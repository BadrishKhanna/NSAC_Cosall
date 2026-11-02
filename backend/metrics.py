import numpy as np

from horizon import above_horizon, horizon_profile
from lunar_geometry import sun_earth_series


def longest_run_hours(mask, step_hours):
    """Length in hours of the longest stretch of consecutive True values."""
    padded = np.concatenate(([False], np.asarray(mask, dtype=bool), [False]))
    edges = np.flatnonzero(padded[1:] != padded[:-1])  # alternating run starts and ends
    if edges.size == 0:
        return 0.0
    return float((edges[1::2] - edges[0::2]).max()) * step_hours


def site_metrics(lat_deg, lon_deg, start_utc, days, step_hours=1.0,
                 sun_limb_deg=0.27, observer_height_m=2.0, earth_limb_deg=0.0,
                 max_range_m=100_000.0, az_step_deg=1.0, horizon=None):
    """Power and comms metrics for one site over a time span.
    sun_limb_deg: count the Sun as visible when its upper edge clears the terrain
      (0.27 = the Sun's angular radius, 0 = center only).
    observer_height_m: height of the antenna / solar panel above the ground.
    earth_limb_deg: same idea for Earth (its angular radius from the Moon is about 0.95 deg).
    horizon: optional (azimuths_deg, elevations_deg) to use instead of computing the terrain
      horizon (for caching, or a flat horizon where there is no terrain data)."""
    if horizon is None:
        horizon = horizon_profile(lat_deg, lon_deg, max_range_m=max_range_m,
                                  az_step_deg=az_step_deg, observer_height_m=observer_height_m)
    az_grid, hor = horizon
    series = sun_earth_series(lat_deg, lon_deg, start_utc, days, step_hours)
    sun_up = above_horizon(series["sun_el"] + sun_limb_deg, series["sun_az"], az_grid, hor)
    earth_up = above_horizon(series["earth_el"] + earth_limb_deg, series["earth_az"], az_grid, hor)
    return {
        "horizon_az_deg": az_grid,
        "horizon_el_deg": hor,
        "series": series,
        "sun_up": sun_up,
        "earth_up": earth_up,
        "sun_lit_pct": 100 * sun_up.mean(),
        "earth_visible_pct": 100 * earth_up.mean(),
        "both_pct": 100 * (sun_up & earth_up).mean(),
        "longest_dark_days": longest_run_hours(~sun_up, step_hours) / 24.0,
        "longest_comms_gap_days": longest_run_hours(~earth_up, step_hours) / 24.0,
    }