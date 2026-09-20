from functools import lru_cache
from pathlib import Path

import numpy as np
import spiceypy as spice

DATA = Path(__file__).resolve().parent / "data"
KERNELS = [
    "naif0012.tls",
    "de440s.bsp",
    "pck00011.tpc",
    "moon_pa_de440_200625.bpc",
    "moon_de440_220930.tf",
]
_loaded = False


def load_kernels():
    """Load all SPICE kernels once per process."""
    global _loaded
    if not _loaded:
        for name in KERNELS:
            spice.furnsh(str(DATA / name))
        _loaded = True


def utc_to_et(utc_string):
    load_kernels()
    return spice.str2et(utc_string)


def time_grid(start_utc, days, step_hours=1.0):
    """Ephemeris times (seconds past J2000) from start_utc for `days` days."""
    return utc_to_et(start_utc) + np.arange(0.0, days * 86400.0, step_hours * 3600.0)


@lru_cache(maxsize=None)
def _moon_radius_km():
    load_kernels()
    return spice.bodvrd("MOON", "RADII", 3)[1][0]


def _site_basis(lat_deg, lon_deg):
    """Site position plus local up/east/north unit vectors in the Moon-fixed frame."""
    lat, lon = np.radians(lat_deg), np.radians(lon_deg)
    up = np.array([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)])
    east = np.array([-np.sin(lon), np.cos(lon), 0.0])
    north = np.array([-np.sin(lat) * np.cos(lon), -np.sin(lat) * np.sin(lon), np.cos(lat)])
    return _moon_radius_km() * up, up, east, north


def body_vectors(body, ets):
    """Geometric position (km) of `body` ('SUN', 'EARTH') relative to the Moon's
    center, in the Moon-fixed MOON_ME frame, for each time in `ets`. Shape (N, 3).
    Computed once per body and time grid, then reused for any number of sites."""
    load_kernels()
    ets = np.atleast_1d(np.asarray(ets, dtype=float))
    pos, _ = spice.spkpos(body, ets, "MOON_ME", "NONE", "MOON")
    return np.asarray(pos).reshape(-1, 3)


def azel_from_vectors(vectors, lat_deg, lon_deg):
    """(elevation, azimuth) in degrees, arrays of length N, of bodies at `vectors`
    (N, 3, km, Moon-fixed frame, from the Moon's center) seen from a lunar site.
    Azimuth is clockwise from north. Elevation is the geometric angle of the body's
    center above the local horizontal plane.
    Approximations: spherical Moon, no terrain, no light-time correction."""
    site, up, east, north = _site_basis(lat_deg, lon_deg)
    to_body = np.asarray(vectors) - site
    to_body = to_body / np.linalg.norm(to_body, axis=1, keepdims=True)
    el = np.degrees(np.arcsin(np.clip(to_body @ up, -1.0, 1.0)))
    az = np.degrees(np.arctan2(to_body @ east, to_body @ north)) % 360.0
    return el, az


def azel_deg(body, et, lat_deg, lon_deg):
    """(elevation, azimuth) of `body` at one time."""
    el, az = azel_from_vectors(body_vectors(body, [et]), lat_deg, lon_deg)
    return el[0], az[0]


def elevation_deg(body, et, lat_deg, lon_deg):
    return azel_deg(body, et, lat_deg, lon_deg)[0]


def sun_earth_series(lat_deg, lon_deg, start_utc, days, step_hours=1.0):
    """Sun and Earth elevation/azimuth at a site over a time span."""
    ets = time_grid(start_utc, days, step_hours)
    result = {"et": ets}
    for body in ("SUN", "EARTH"):
        el, az = azel_from_vectors(body_vectors(body, ets), lat_deg, lon_deg)
        result[body.lower() + "_el"] = el
        result[body.lower() + "_az"] = az
    return result