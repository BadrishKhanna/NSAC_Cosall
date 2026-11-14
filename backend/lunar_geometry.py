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


def elevation_deg(body, et, lat_deg, lon_deg):
    """Elevation of `body` ('SUN', 'EARTH') above the local horizon at a lunar site.
    Approximations: spherical Moon, no terrain, no light-time correction."""
    load_kernels()
    radius = spice.bodvrd("MOON", "RADII", 3)[1][0]
    site = np.array(spice.latrec(radius, np.radians(lon_deg), np.radians(lat_deg)))
    up = site / np.linalg.norm(site)
    body_pos, _ = spice.spkpos(body, et, "MOON_ME", "NONE", "MOON")
    to_body = np.array(body_pos) - site
    return np.degrees(np.arcsin(np.dot(up, to_body) / np.linalg.norm(to_body)))