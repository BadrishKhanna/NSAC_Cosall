from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

from horizon import above_horizon, horizon_profile, site_from_xy
from lunar_geometry import sun_earth_series

# Test site: a point on the ridge next to Shackleton, picked from the DEM image
# (x = -10 km, y = -10 km in the DEM's polar stereographic coordinates).
LAT_DEG, LON_DEG = site_from_xy(-10_000.0, -10_000.0)
START_UTC = "2027-01-01 00:00:00 UTC"
DAYS = 365
STEP_H = 1.0

print(f"Site: lat {LAT_DEG:.3f}, lon {LON_DEG:.3f}")
az_grid, hor = horizon_profile(LAT_DEG, LON_DEG)
print(f"Terrain horizon elevation: min {hor.min():.2f}, max {hor.max():.2f}, "
      f"mean {hor.mean():.2f} deg")

r = sun_earth_series(LAT_DEG, LON_DEG, START_UTC, DAYS, step_hours=STEP_H)
sun_flat = r["sun_el"] > 0
earth_flat = r["earth_el"] > 0
sun_up = above_horizon(r["sun_el"], r["sun_az"], az_grid, hor)
earth_up = above_horizon(r["earth_el"], r["earth_az"], az_grid, hor)


def longest_run_days(mask):
    best = run = 0
    for v in mask:
        run = run + 1 if v else 0
        best = max(best, run)
    return best * STEP_H / 24.0


print(f"Sun   above flat horizon {100 * sun_flat.mean():5.1f} %   "
      f"above terrain horizon {100 * sun_up.mean():5.1f} %")
print(f"Earth above flat horizon {100 * earth_flat.mean():5.1f} %   "
      f"above terrain horizon {100 * earth_up.mean():5.1f} %")
print(f"Both above terrain horizon: {100 * (sun_up & earth_up).mean():5.1f} %")
print(f"Longest Sun-dark stretch:   {longest_run_days(~sun_up):6.1f} days")
print(f"Longest Earth-gap stretch:  {longest_run_days(~earth_up):6.1f} days")

n = int(30 * 24 / STEP_H)  # first 30 days
fig, ax = plt.subplots(figsize=(12, 5))
ax.fill_between(az_grid, -10, hor, color="0.6", label="terrain horizon")
ax.scatter(r["sun_az"][:n], r["sun_el"][:n], s=6, color="orange", label="Sun (first 30 days)")
ax.scatter(r["earth_az"][:n], r["earth_el"][:n], s=6, color="tab:blue", label="Earth (first 30 days)")
ax.axhline(0, color="k", linewidth=0.8)
ax.set_xlim(0, 360)
ax.set_ylim(-10, max(10, hor.max() + 2))
ax.set_xlabel("Azimuth (deg, clockwise from north)")
ax.set_ylabel("Elevation (deg)")
ax.set_title(f"Horizon view at lat {LAT_DEG:.2f}, lon {LON_DEG:.2f}")
ax.legend(loc="upper right")
ax.grid(alpha=0.3)
fig.tight_layout()
fig.savefig(Path(__file__).resolve().parent / "site_horizon_view.png", dpi=150)
plt.show()