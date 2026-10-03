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

def landing_windows(lat_deg, lon_deg, start_utc, years, eval_days, per_year, step_hours=3.0,
                    sun_limb_deg=0.27, observer_height_m=2.0, earth_limb_deg=0.0, horizon=None,
                    max_points=20_000):
    """Scan candidate landing dates over `years` years starting at start_utc, and return the
    best `per_year` per year (by score), each with the site's power/comms metrics over the
    following `eval_days` days -- the mission's early, most survivability-critical window.

    Computes the Sun/Earth geometry ONCE for the whole scan range (the expensive SPICE part),
    then scores every candidate landing day with cheap array slicing -- this is what makes
    scanning years of candidates practical instead of recomputing geometry per candidate.

    score = both_pct - 2*longest_dark_days - 2*longest_comms_gap_days (both_pct rewarded,
    long blackouts penalized). This formula is a simple, stated, adjustable heuristic, not
    a mission-design optimum -- the point is to surface good candidates for a human to
    inspect in detail, not to replace that inspection.

    Raises ValueError if the requested range needs more time-steps than max_points allows.
    """
    total_days = years * 365 + eval_days
    if total_days * 24.0 / step_hours > max_points:
        raise ValueError(
            f"years={years} with eval_days={eval_days} needs too many time steps at "
            f"step_hours={step_hours}; use fewer years, a shorter eval_days, or a larger step_hours."
        )
    m = site_metrics(lat_deg, lon_deg, start_utc, total_days, step_hours,
                     sun_limb_deg=sun_limb_deg, observer_height_m=observer_height_m,
                     earth_limb_deg=earth_limb_deg, horizon=horizon)
    sun_up, earth_up = m["sun_up"], m["earth_up"]
    points_per_day = round(24.0 / step_hours)
    n_candidates = years * 365

    scored = []
    for d in range(n_candidates):
        i0 = d * points_per_day
        i1 = i0 + eval_days * points_per_day
        su, eu = sun_up[i0:i1], earth_up[i0:i1]
        sun_pct = 100 * su.mean()
        earth_pct = 100 * eu.mean()
        both_pct = 100 * (su & eu).mean()
        dark = longest_run_hours(~su, step_hours) / 24.0
        gap = longest_run_hours(~eu, step_hours) / 24.0
        score = both_pct - 2 * dark - 2 * gap
        scored.append({
            "day": d, "score": score, "sun_lit_pct": sun_pct, "earth_visible_pct": earth_pct,
            "both_pct": both_pct, "longest_dark_days": dark, "longest_comms_gap_days": gap,
        })

    min_sep_days = max(eval_days // 2, 20)
    picks = []
    for y in range(years):
        bucket = [s for s in scored if y * 365 <= s["day"] < (y + 1) * 365]
        bucket_sorted = sorted(bucket, key=lambda s: -s["score"])
        chosen = []
        for cand in bucket_sorted:
            if all(abs(cand["day"] - c["day"]) >= min_sep_days for c in chosen):
                chosen.append(cand)
            if len(chosen) >= per_year:
                break
        picks.extend(sorted(chosen, key=lambda s: s["day"]))

    # The full day-by-day curve, returned alongside the picks so the frontend can plot
    # "landing quality over time" as a continuous line with the picks marked as peaks on
    # it -- showing the reasoning, not just a black-box top-10 list.
    curve = [{"day": s["day"], "sun_lit_pct": s["sun_lit_pct"], "earth_visible_pct": s["earth_visible_pct"],
             "both_pct": s["both_pct"], "score": s["score"]} for s in scored]
    return picks, curve
