import argparse
import time
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

from horizon import above_horizon, horizon_profile, site_from_xy
from lunar_geometry import azel_from_vectors, body_vectors, time_grid

FIGURES = Path(__file__).resolve().parents[1] / "docs" / "figures"
FIGURES.mkdir(parents=True, exist_ok=True)

parser = argparse.ArgumentParser(description="Scan a box near the south pole for Sun visibility.")
parser.add_argument("--xrange", type=float, nargs=2, default=(-25_000.0, 15_000.0),
                    metavar=("MIN", "MAX"), help="scan box x range, DEM meters")
parser.add_argument("--yrange", type=float, nargs=2, default=(-25_000.0, 15_000.0),
                    metavar=("MIN", "MAX"), help="scan box y range, DEM meters")
parser.add_argument("--spacing", type=float, default=1_000.0, help="grid spacing, meters")
parser.add_argument("--limb", type=float, default=0.0,
                    help="Sun-limb offset, deg (0 = Sun center, 0.27 = upper edge)")
parser.add_argument("--height", type=float, default=0.0, help="observer height above ground, m")
parser.add_argument("--tag", default="", help="text added to the figure file name")
args = parser.parse_args()

X_RANGE_M, Y_RANGE_M, SPACING_M = tuple(args.xrange), tuple(args.yrange), args.spacing
SUN_LIMB_DEG, OBSERVER_HEIGHT_M = args.limb, args.height
START_UTC = "2027-01-01 00:00:00 UTC"
DAYS = 365
STEP_H = 1.0
MAX_RANGE_M = 30_000.0   # terrain considered out to this distance (scan only)
AZ_STEP_DEG = 2.0

# Cell centers, so no grid point sits exactly on the pole
xs = np.arange(X_RANGE_M[0] + SPACING_M / 2, X_RANGE_M[1], SPACING_M)
ys = np.arange(Y_RANGE_M[0] + SPACING_M / 2, Y_RANGE_M[1], SPACING_M)
X, Y = np.meshgrid(xs, ys)
lat_grid, lon_grid = site_from_xy(X, Y)
print(f"Scan: x {X_RANGE_M}, y {Y_RANGE_M}, spacing {SPACING_M:.0f} m, "
      f"Sun-limb {SUN_LIMB_DEG} deg, observer height {OBSERVER_HEIGHT_M} m, "
      f"{X.size} cells")

ets = time_grid(START_UTC, DAYS, STEP_H)
sun_vec = body_vectors("SUN", ets)  # one SPICE pass, reused for every site

lit = np.full(X.shape, np.nan)
t0 = time.perf_counter()
for i in range(X.shape[0]):
    for j in range(X.shape[1]):
        lat, lon = lat_grid[i, j], lon_grid[i, j]
        try:
            az_g, hor = horizon_profile(lat, lon, max_range_m=MAX_RANGE_M,
                                        az_step_deg=AZ_STEP_DEG,
                                        observer_height_m=OBSERVER_HEIGHT_M)
        except ValueError:  # site outside the DEM or on a no-data pixel
            continue
        el, az = azel_from_vectors(sun_vec, lat, lon)
        lit[i, j] = above_horizon(el + SUN_LIMB_DEG, az, az_g, hor).mean()
    print(f"row {i + 1}/{X.shape[0]} done", end="\r", flush=True)
elapsed = time.perf_counter() - t0
n_sites = int(np.isfinite(lit).sum())
print(f"\n{n_sites} sites in {elapsed:.1f} s ({1000 * elapsed / max(n_sites, 1):.0f} ms per site)")

order = np.argsort(np.nan_to_num(lit, nan=-1.0).ravel())[::-1][:8]
print("\nBest-lit grid cells (Sun above terrain horizon, share of the year):")
for k in order:
    i, j = divmod(int(k), X.shape[1])
    print(f"  x={X[i, j] / 1000:7.2f} km  y={Y[i, j] / 1000:7.2f} km  "
          f"lat {lat_grid[i, j]:8.3f}  lon {lon_grid[i, j]:8.2f}  lit {100 * lit[i, j]:5.1f} %")

best_i, best_j = divmod(int(order[0]), X.shape[1])
x_lim = (X_RANGE_M[0] / 1000, X_RANGE_M[1] / 1000)
y_lim = (Y_RANGE_M[0] / 1000, Y_RANGE_M[1] / 1000)
fig, ax = plt.subplots(figsize=(7.5, 6.5))
im = ax.imshow(100 * lit, origin="lower", cmap="magma", extent=[*x_lim, *y_lim])
fig.colorbar(im, label="% of the year the Sun is above the terrain horizon")
if x_lim[0] <= 0 <= x_lim[1] and y_lim[0] <= 0 <= y_lim[1]:
    ax.plot(0, 0, marker="*", color="cyan", markersize=12, linestyle="none", label="south pole")
ax.plot(X[best_i, best_j] / 1000, Y[best_i, best_j] / 1000, marker="o", markerfacecolor="none",
        markeredgecolor="lime", markersize=12, linestyle="none", label="best-lit cell")
ax.set_xlim(x_lim)
ax.set_ylim(y_lim)
ax.set_xlabel("x (km)")
ax.set_ylabel("y (km)")
ax.set_title(f"Sun visibility near the south pole\n{DAYS} days from {START_UTC[:10]}, "
             f"Sun-limb {SUN_LIMB_DEG} deg, observer height {OBSERVER_HEIGHT_M} m", fontsize=11)
ax.legend(loc="upper right")
fig.tight_layout()
name = f"illumination_map{args.tag}_limb{SUN_LIMB_DEG}_h{OBSERVER_HEIGHT_M}.png"
fig.savefig(FIGURES / name, dpi=150)
print("Saved", FIGURES / name)
plt.show()