from datetime import datetime
from functools import lru_cache

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from download_data import DATA, FILES
from horizon import horizon_profile, site_from_xy
from lunar_geometry import load_kernels
import spiceypy as spice
from metrics import site_metrics

app = FastAPI(title="Lunar site planner API",
              description="Sun and Earth visibility at lunar sites (SPICE geometry + LOLA terrain).")
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])
# TODO before deploying: replace allow_origins=["*"] with the frontend's address.


def kernels_self_test():
    """Loads the kernels and exercises them with a real call, so a corrupted or
    incomplete kernel (e.g. from a download interrupted mid-transfer) fails loudly
    here -- before the server starts accepting traffic -- rather than as a cryptic
    500 on the first real request. /api/health only checks that the kernel files
    exist, not that their contents are valid, which is exactly how a truncated
    download can pass one check and fail the other.
    Called explicitly from render.yaml's startCommand, never at import time, so
    importing this module for tests never triggers it."""
    load_kernels()
    spice.str2et("2000-01-01 00:00:00 UTC")

MIN_DATE, MAX_DATE = datetime(1960, 1, 1), datetime(2050, 12, 31)
MAX_POINTS = 20_000          # per request, keeps computation bounded
TERRAIN_LAT_MAX = -80.0      # the LOLA product used covers 80S to the pole
FLAT_AZ = np.arange(0.0, 360.0, 1.0)

PRESETS = [
    {"id": "apollo11", "name": "Apollo 11 (Tranquility Base)",
     "lat": 0.67408, "lon": 23.47297,
     "note": "Geometry only (outside the 80S terrain product). Coordinates: Davies and Colvin 2000."},
    {"id": "shackleton-ridge", "name": "Ridge near Shackleton (best cell from our scan)",
     "lat": -89.491, "lon": -138.674, "x_m": -10200.0, "y_m": -11600.0,
     "note": "Highest-lit cell in a 200 m zoom scan (2027, Sun upper edge, 2 m height)."},
]


@lru_cache(maxsize=256)
def _horizon(lat, lon, height_m):
    """Terrain horizon for a site (cached). Flat horizon where there is no terrain data."""
    if lat <= TERRAIN_LAT_MAX:
        try:
            az, el = horizon_profile(lat, lon, observer_height_m=height_m)
            return az, el, True
        except ValueError:
            pass
    return FLAT_AZ, np.zeros_like(FLAT_AZ), False


def _r(a, n=3):
    return np.round(np.asarray(a, dtype=float), n).tolist()


@app.get("/api/health")
def health():
    """Always answers 200 while the server is up; data_ready says whether the kernels and terrain are present."""
    missing = [name for name, _, _ in FILES if not (DATA / name).exists()]
    return {"status": "ok", "data_ready": not missing, "missing": missing}


@app.get("/api/presets")
def presets():
    return PRESETS


@app.get("/api/system")
def system(time: str = Query(..., description="UTC time, e.g. 2027-06-15T12:00:00")):
    """Real Sun/Earth/Moon geometry for one instant, for the 3D orbit scene.
    Returns Earth->Moon, Earth->Sun and Moon->Sun vectors (km, J2000 inertial frame),
    plus the J2000-to-body-fixed rotation matrices for the Moon (MOON_ME) and Earth
    (IAU_EARTH). To orient a mesh authored in body-fixed axes for rendering in the
    J2000 scene, apply the TRANSPOSE of the given matrix (body-fixed -> J2000)."""
    try:
        t = datetime.strptime(time, "%Y-%m-%dT%H:%M:%S")
    except ValueError:
        raise HTTPException(400, "time must look like 2027-06-15T12:00:00")
    if not (MIN_DATE <= t <= MAX_DATE):
        raise HTTPException(400, "time must be between 1960-01-01 and 2050-12-31")
    load_kernels()
    et = spice.str2et(t.strftime("%Y-%m-%d %H:%M:%S") + " UTC")
    moon_e, _ = spice.spkpos("MOON", et, "J2000", "NONE", "EARTH")
    sun_e, _ = spice.spkpos("SUN", et, "J2000", "NONE", "EARTH")
    sun_m, _ = spice.spkpos("SUN", et, "J2000", "NONE", "MOON")
    moon_rot = np.asarray(spice.pxform("J2000", "MOON_ME", et))
    earth_rot = np.asarray(spice.pxform("J2000", "IAU_EARTH", et))
    return {
        "time": time,
        "moon_from_earth_km": _r(moon_e, 1),
        "sun_from_earth_km": _r(sun_e, 1),
        "sun_from_moon_km": _r(sun_m, 1),
        "moon_rotation": [_r(row, 6) for row in moon_rot],
        "earth_rotation": [_r(row, 6) for row in earth_rot],
    }


@app.get("/api/site")
def site(lat: float | None = Query(None, ge=-90, le=90),
         lon: float | None = Query(None, ge=-360, le=360),
         x_m: float | None = None, y_m: float | None = None,
         start: str = "2027-01-01",
         days: int = Query(365, ge=1, le=1100),
         step_hours: float = Query(1.0, ge=0.25, le=24.0),
         sun_limb_deg: float = Query(0.27, ge=0.0, le=1.0),
         earth_limb_deg: float = Query(0.0, ge=0.0, le=1.0),
         observer_height_m: float = Query(2.0, ge=0.0, le=50.0),
         include_series: bool = True):
    """Metrics, horizon profile and (optionally) Sun/Earth tracks for one site.
    Give the site as lat and lon (degrees), or as x_m and y_m (DEM meters)."""
    if x_m is not None and y_m is not None:
        try:
            lat, lon = (float(v) for v in site_from_xy(x_m, y_m))
        except Exception:
            raise HTTPException(400, "x_m, y_m are outside the terrain map.")
        if lat > TERRAIN_LAT_MAX:
            raise HTTPException(400, "x_m, y_m are outside the terrain map (south of 80S only).")
    elif lat is None or lon is None:
        raise HTTPException(400, "Give lat and lon, or x_m and y_m.")
    if abs(lat) > 89.98:
        raise HTTPException(400, "Site must be at least 0.02 degrees from the pole.")
    try:
        t0 = datetime.strptime(start, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "start must be a date like 2027-01-01.")
    if not (MIN_DATE <= t0 <= MAX_DATE):
        raise HTTPException(400, "start must be between 1960-01-01 and 2050-12-31.")
    if days * 24.0 / step_hours > MAX_POINTS:
        raise HTTPException(400, f"Too many time steps (max {MAX_POINTS}); use fewer days or a larger step.")

    lat_r, lon_r = round(lat, 4), round(lon, 4)
    az, el, terrain = _horizon(lat_r, lon_r, observer_height_m)
    m = site_metrics(lat_r, lon_r, f"{start} 00:00:00 UTC", days, step_hours,
                     sun_limb_deg=sun_limb_deg, observer_height_m=observer_height_m,
                     earth_limb_deg=earth_limb_deg, horizon=(az, el))
    out = {
        "site": {"lat": lat_r, "lon": lon_r, "terrain": terrain},
        "assumptions": {"start": start, "days": days, "step_hours": step_hours,
                        "sun_limb_deg": sun_limb_deg, "earth_limb_deg": earth_limb_deg,
                        "observer_height_m": observer_height_m},
        "metrics": {k: round(float(m[k]), 2) for k in
                    ("sun_lit_pct", "earth_visible_pct", "both_pct",
                     "longest_dark_days", "longest_comms_gap_days")},
        "horizon": {"az_deg": _r(az, 1), "el_deg": _r(el, 3)},
    }
    if include_series:
        s = m["series"]
        out["series"] = {
            "t_hours": _r((s["et"] - s["et"][0]) / 3600.0, 3),
            "sun_az": _r(s["sun_az"]), "sun_el": _r(s["sun_el"]),
            "earth_az": _r(s["earth_az"]), "earth_el": _r(s["earth_el"]),
            "sun_up": m["sun_up"].astype(int).tolist(),
            "earth_up": m["earth_up"].astype(int).tolist(),
        }
    return out
