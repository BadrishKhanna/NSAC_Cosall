from pathlib import Path

import numpy as np
import spiceypy as spice

DATA = Path(__file__).resolve().parent / "data"
for name in ["naif0012.tls", "de440s.bsp", "pck00011.tpc",
             "moon_pa_de440_200625.bpc", "moon_de440_220930.tf"]:
    spice.furnsh(str(DATA / name))

# Apollo 11: VERIFY these against the Apollo Flight Journal / LROC before citing
LAT_DEG, LON_DEG = 0.674, 23.473
LANDING_UTC = "1969-07-20 20:17:40 UTC"


def elevation_deg(body, et, lat_deg, lon_deg):
    """Elevation of `body` above the local horizon at a lunar site (spherical Moon)."""
    radius = spice.bodvrd("MOON", "RADII", 3)[1][0]
    site = np.array(spice.latrec(radius, np.radians(lon_deg), np.radians(lat_deg)))
    up = site / np.linalg.norm(site)
    body_pos, _ = spice.spkpos(body, et, "MOON_ME", "NONE", "MOON")
    to_body = np.array(body_pos) - site
    return np.degrees(np.arcsin(np.dot(up, to_body) / np.linalg.norm(to_body)))


et = spice.str2et(LANDING_UTC)
print(f"Sun elevation:   {elevation_deg('SUN', et, LAT_DEG, LON_DEG):6.2f} deg")
print(f"Earth elevation: {elevation_deg('EARTH', et, LAT_DEG, LON_DEG):6.2f} deg")