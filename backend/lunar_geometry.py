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


def azel_deg(body, et, lat_deg, lon_deg):
    """(elevation, azimuth) of `body` ('SUN', 'EARTH') at a lunar site, in degrees.
    Azimuth is measured clockwise from north. Elevation is the geometric angle of the
    body's center above the local horizontal plane.
    Approximations: spherical Moon, no terrain, no light-time correction."""
    load_kernels()
    site, up, east, north = _site_basis(lat_deg, lon_deg)
    body_pos, _ = spice.spkpos(body, et, "MOON_ME", "NONE", "MOON")
    to_body = np.array(body_pos) - site
    to_body = to_body / np.linalg.norm(to_body)
    el = np.degrees(np.arcsin(np.dot(up, to_body)))
    az = np.degrees(np.arctan2(np.dot(east, to_body), np.dot(north, to_body))) % 360.0
    return el, az


def elevation_deg(body, et, lat_deg, lon_deg):
    return azel_deg(body, et, lat_deg, lon_deg)[0]


def sun_earth_series(lat_deg, lon_deg, start_utc, days, step_hours=1.0):
    """Sun and Earth elevation/azimuth at a site over a time span."""
    et0 = utc_to_et(start_utc)
    ets = et0 + np.arange(0.0, days * 86400.0, step_hours * 3600.0)
    result = {"et": ets}
    for body in ("SUN", "EARTH"):
        azel = np.array([azel_deg(body, et, lat_deg, lon_deg) for et in ets])
        result[body.lower() + "_el"] = azel[:, 0]
        result[body.lower() + "_az"] = azel[:, 1]
    return result