import argparse
from pathlib import Path

import matplotlib.pyplot as plt

from horizon import site_from_xy
from metrics import site_metrics

FIGURES = Path(__file__).resolve().parents[1] / "docs" / "figures"
FIGURES.mkdir(parents=True, exist_ok=True)

parser = argparse.ArgumentParser(description="Sun/Earth metrics and horizon view for one site.")
parser.add_argument("x", type=float, nargs="?", default=-10_200.0, help="DEM x, meters")
parser.add_argument("y", type=float, nargs="?", default=-11_600.0, help="DEM y, meters")
parser.add_argument("--limb", type=float, default=0.27, help="Sun-limb offset, deg")
parser.add_argument("--height", type=float, default=2.0, help="observer height, m")
parser.add_argument("--days", type=int, default=365)
args = parser.parse_args()

START_UTC = "2027-01-01 00:00:00 UTC"
STEP_H = 1.0
lat, lon = site_from_xy(args.x, args.y)
print(f"Site: x {args.x:.0f} m, y {args.y:.0f} m -> lat {lat:.3f}, lon {lon:.3f}")
print(f"Assumptions: Sun-limb {args.limb} deg, observer height {args.height} m, "
      f"{args.days} days from {START_UTC[:10]}, {STEP_H:.0f} h steps")

m = site_metrics(lat, lon, START_UTC, args.days, STEP_H,
                 sun_limb_deg=args.limb, observer_height_m=args.height)
hor, az_grid, r = m["horizon_el_deg"], m["horizon_az_deg"], m["series"]
print(f"Terrain horizon elevation: min {hor.min():.2f}, max {hor.max():.2f}, "
      f"mean {hor.mean():.2f} deg")
print(f"Sun visible:        {m['sun_lit_pct']:5.1f} %   longest dark stretch: "
      f"{m['longest_dark_days']:5.1f} days")
print(f"Earth visible:      {m['earth_visible_pct']:5.1f} %   longest comms gap:   "
      f"{m['longest_comms_gap_days']:5.1f} days")
print(f"Both at once:       {m['both_pct']:5.1f} %")

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
ax.set_title(f"Horizon view at lat {lat:.2f}, lon {lon:.2f} (observer height {args.height} m)")
ax.legend(loc="upper right")
ax.grid(alpha=0.3)
fig.tight_layout()
name = f"site_horizon_view_x{args.x:.0f}_y{args.y:.0f}.png"
fig.savefig(FIGURES / name, dpi=150)
print("Saved", FIGURES / name)
plt.show()