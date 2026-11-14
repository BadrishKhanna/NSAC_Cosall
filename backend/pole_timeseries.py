from pathlib import Path

import matplotlib.pyplot as plt

from lunar_geometry import sun_earth_series

FIGURES = Path(__file__).resolve().parents[1] / "docs" / "figures"
FIGURES.mkdir(parents=True, exist_ok=True)
# Test point 0.5 degrees from the south pole. NOT a real candidate site.
LAT_DEG, LON_DEG = -89.5, 0.0
START_UTC = "2027-01-01 00:00:00 UTC"
DAYS = 365

r = sun_earth_series(LAT_DEG, LON_DEG, START_UTC, DAYS, step_hours=1.0)
t_days = (r["et"] - r["et"][0]) / 86400.0

sun_up = r["sun_el"] > 0
earth_up = r["earth_el"] > 0
print(f"Sun above horizon:   {100 * sun_up.mean():5.1f} % of the time")
print(f"Earth above horizon: {100 * earth_up.mean():5.1f} % of the time")
print(f"Both above horizon:  {100 * (sun_up & earth_up).mean():5.1f} % of the time")
print(f"Sun elevation range:   {r['sun_el'].min():6.2f} to {r['sun_el'].max():6.2f} deg")
print(f"Earth elevation range: {r['earth_el'].min():6.2f} to {r['earth_el'].max():6.2f} deg")

fig, axes = plt.subplots(2, 1, sharex=True, figsize=(11, 6))
for ax, key, label in [(axes[0], "sun_el", "Sun"), (axes[1], "earth_el", "Earth")]:
    ax.plot(t_days, r[key], linewidth=0.8)
    ax.axhline(0, color="k", linewidth=0.8)
    ax.set_ylabel(f"{label} elevation (deg)")
    ax.grid(alpha=0.3)
axes[1].set_xlabel(f"Days since {START_UTC}")
axes[0].set_title(
    f"Sun and Earth elevation at {LAT_DEG} lat, {LON_DEG} lon (spherical Moon, no terrain)"
)
fig.tight_layout()
fig.savefig(FIGURES / "pole_timeseries.png", dpi=150)
plt.show()