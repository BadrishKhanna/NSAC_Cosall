import threading
from datetime import datetime, timedelta
from functools import lru_cache, wraps

import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from download_data import DATA, FILES
from horizon import horizon_profile, site_from_xy
from lunar_geometry import load_kernels
import spiceypy as spice
from metrics import site_metrics, landing_windows
from terrain_map import terrain_window

app = FastAPI(title="Lunar site planner API",
              description="Sun and Earth visibility at lunar sites (SPICE geometry + LOLA terrain).")
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])
# TODO before deploying: replace allow_origins=["*"] with the frontend's address.


# SPICE keeps its state in global (non thread-safe) memory, and FastAPI runs plain `def`
# endpoints in a thread pool. Two requests inside SPICE at once (for example /api/system
# from the Orbit view and /api/site from the sky view) corrupt its call stack and fail with
# "SPICE(BADSUBSCRIPT) ... trcpkg". Every endpoint that calls SPICE takes this lock, so they
# run one at a time.
_spice_lock = threading.RLock()


def _serialized(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        with _spice_lock:
            return fn(*args, **kwargs)
    return wrapper



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
TERRAIN_LAT_MAX = -60.0      # terrain (horizons) covers 65S to the pole: 80 m south of 80S, coarser to 65S
FINE_LAT_MAX = -80.0         # the 80 m LOLA product covers 80S to the pole
TERRAIN_MAP_LAT_MAX = -60.0  # the terrain map also uses a coarser LOLA map out to 65S
FLAT_AZ = np.arange(0.0, 360.0, 1.0)

PRESETS = [
    {"id": "connecting-ridge", "name": "Connecting Ridge (candidate site)",
     "lat": -89.53432, "lon": -150.05233,
     "note": "Candidate site in NASA's Connecting Ridge region, proposed in LPSC 2024 abstract 1695 (209.948 E)."},
    {"id": "apollo11", "name": "Apollo 11 (Tranquility Base)",
     "lat": 0.67408, "lon": 23.47297,
     "note": "Geometry only (outside the terrain map). Coordinates: Davies and Colvin 2000."},
    {"id": "shackleton-ridge", "name": "Ridge near Shackleton (best cell from our scan)",
     "lat": -89.491, "lon": -138.674, "x_m": -10200.0, "y_m": -11600.0,
     "note": "Highest-lit cell in a 200 m zoom scan (2027, Sun upper edge, 2 m height)."},
    {"id": "peak-near-shackleton", "name": "Peak Near Shackleton (candidate site)",
     "lat": -89.01701, "lon": 126.27302,
     "note": "Candidate site in NASA's Peak Near Shackleton region, proposed in LPSC 2024 abstract 1695."},
    {"id": "nobile-rim-2", "name": "Nobile Rim 2 (candidate site)",
     "lat": -84.20156, "lon": 60.69989,
     "note": "Top-ranked site in the Nobile Rim 2 region, Pena-Asensio et al., Acta Astronautica."},
    {"id": "chandrayaan3", "name": "Chandrayaan-3 (Shiv Shakti Point)",
     "lat": -69.3733, "lon": 32.3191,
     "note": "Vikram lander, ISRO, landed 23 Aug 2023. Approximate coordinates (LRO imagery); terrain here is the coarser 65S-80S map."},
    {"id": "chandrayaan2", "name": "Chandrayaan-2 Vikram (impact site)",
     "lat": -70.8810, "lon": 22.7840,
     "note": "Vikram crashed here on 7 Sep 2019 (found by LRO). Approximate coordinates; coarser terrain."},
    {"id": "im1-odysseus", "name": "IM-1 Odysseus (Malapert A)",
     "lat": -80.1297, "lon": 1.4403,
     "note": "Intuitive Machines, landed 22 Feb 2024, tipped over. Approximate coordinates (LRO imagery)."},
    {"id": "im2-athena", "name": "IM-2 Athena (Mons Mouton)",
     "lat": -84.7933, "lon": 29.2072,
     "note": "Intuitive Machines, landed 6 Mar 2025 near the Mons Mouton plateau. Approximate coordinates (LRO imagery)."},
    {"id": "change4", "name": "Chang'e-4 (Von Karman crater)",
     "lat": -45.4561, "lon": 177.5885,
     "note": "Far side, landed 3 Jan 2019. Geometry only (outside the terrain map); the far side has no direct Earth view."},
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
@_serialized
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
@_serialized
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
            raise HTTPException(400, "x_m, y_m are outside the terrain map (south of 65S only).")
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
        "site": {"lat": lat_r, "lon": lon_r, "terrain": terrain,
                 "terrain_res_m": (80 if lat_r <= FINE_LAT_MAX else 240) if terrain else None},
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


@lru_cache(maxsize=64)
def _terrain(lat, lon, half_km, size):
    return terrain_window(lat, lon, half_km, size)


@app.get("/api/terrain")
def terrain(lat: float = Query(..., ge=-90, le=90),
            lon: float = Query(..., ge=-360, le=360),
            half_km: float = Query(30.0, ge=2.0, le=100.0),
            size: int = Query(160, ge=40, le=240)):
    """Top-down elevation grid (LOLA 80 m DEM, plus a coarser one, 240 m, from 80S to 65S) around a point, for the Orbit view's terrain
    map. It does not depend on the date, and it does not use SPICE, so it is not serialized."""
    if lat > TERRAIN_MAP_LAT_MAX:
        raise HTTPException(400, "No terrain data here (the terrain map covers 65S to the pole).")
    try:
        return _terrain(round(lat, 4), round(lon, 4), round(half_km, 1), size)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception:
        raise HTTPException(503, "The terrain data is not available on this server.")


@app.get("/api/windows")
@_serialized
def windows(lat: float | None = Query(None, ge=-90, le=90),
           lon: float | None = Query(None, ge=-360, le=360),
           x_m: float | None = None, y_m: float | None = None,
           start: str = "2027-01-01",
           years: int = Query(5, ge=1, le=15),
           eval_days: int = Query(60, ge=10, le=365),
           per_year: int = Query(2, ge=1, le=6),
           step_hours: float = Query(3.0, ge=0.5, le=24.0),
           sun_limb_deg: float = Query(0.27, ge=0.0, le=1.0),
           earth_limb_deg: float = Query(0.0, ge=0.0, le=1.0),
           observer_height_m: float = Query(2.0, ge=0.0, le=50.0)):
    """Scans candidate landing dates for one site and recommends the best `per_year`
    per year, each scored by the site's power/comms metrics over the following
    `eval_days` days (the mission's early, most survivability-critical window).
    Also returns the full day-by-day quality curve for the whole scan range, so a
    chart can show why those dates were picked, not just the picks themselves.
    Give the site as lat and lon (degrees), or as x_m and y_m (DEM meters)."""
    if x_m is not None and y_m is not None:
        try:
            lat, lon = (float(v) for v in site_from_xy(x_m, y_m))
        except Exception:
            raise HTTPException(400, "x_m, y_m are outside the terrain map.")
        if lat > TERRAIN_LAT_MAX:
            raise HTTPException(400, "x_m, y_m are outside the terrain map (south of 65S only).")
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
    if years * 365 + eval_days > (MAX_DATE - t0).days:
        raise HTTPException(400, "The scan range (years + eval_days) runs past 2050-12-31; "
                                 "use fewer years, a shorter eval_days, or an earlier start.")
    if abs(24.0 / step_hours - round(24.0 / step_hours)) > 1e-6:
        raise HTTPException(400, "step_hours must divide 24 evenly (for example 1, 2, 3, 4, 6, 8, 12 or 24).")

    lat_r, lon_r = round(lat, 4), round(lon, 4)
    az, el, terrain = _horizon(lat_r, lon_r, observer_height_m)
    try:
        picks, curve = landing_windows(
            lat_r, lon_r, f"{start} 00:00:00 UTC", years, eval_days, per_year, step_hours,
            sun_limb_deg=sun_limb_deg, observer_height_m=observer_height_m,
            earth_limb_deg=earth_limb_deg, horizon=(az, el), max_points=MAX_POINTS,
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    def _fmt(day, p):
        d = (t0 + timedelta(days=int(day))).strftime("%Y-%m-%d")
        return {"landing_date": d, **{k: round(float(v), 2) for k, v in p.items() if k != "day"}}

    return {
        "site": {"lat": lat_r, "lon": lon_r, "terrain": terrain,
                 "terrain_res_m": (80 if lat_r <= FINE_LAT_MAX else 240) if terrain else None},
        "assumptions": {"start": start, "years": years, "eval_days": eval_days, "per_year": per_year,
                        "step_hours": step_hours, "sun_limb_deg": sun_limb_deg,
                        "earth_limb_deg": earth_limb_deg, "observer_height_m": observer_height_m,
                        "score_formula": "both_pct - 2*longest_dark_days - 2*longest_comms_gap_days"},
        "windows": [_fmt(p["day"], p) for p in picks],
        "curve": {
            "dates": [(t0 + timedelta(days=int(c["day"]))).strftime("%Y-%m-%d") for c in curve],
            "sun_lit_pct": _r([c["sun_lit_pct"] for c in curve], 1),
            "earth_visible_pct": _r([c["earth_visible_pct"] for c in curve], 1),
            "both_pct": _r([c["both_pct"] for c in curve], 1),
        },
    }

