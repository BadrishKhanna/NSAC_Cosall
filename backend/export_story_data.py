"""Exports the numbers the Cosall story needs, using the same engine as the live site.

Run from the project root, with the backend .venv active:

  1. python backend/export_story_data.py --survey
       Prints one line per preset site, so we can pick three that contrast.
  2. python backend/export_story_data.py --export shackleton-ridge connecting-ridge nobile-rim-2 --windows-site shackleton-ridge
       Writes frontend/public/story/story_sites.json and story_windows.json.

Nothing here changes the app. It only reads the kernels and terrain in backend/data/.
"""
import argparse
import json
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np

from api import PRESETS, _horizon  # the same site list and cached horizon the live API uses
from metrics import landing_windows, longest_run_hours, site_metrics

START = "2027-01-01"
DAYS = 365
STEP_H = 1.0
SUN_LIMB_DEG = 0.27
HEIGHT_M = 2.0
OUT = Path(__file__).resolve().parents[1] / "frontend" / "public" / "story"
KEYS = ("sun_lit_pct", "earth_visible_pct", "both_pct", "longest_dark_days", "longest_comms_gap_days")


def compute(p):
    """Metrics and series for one preset, with the same settings the Site planner uses."""
    lat, lon = round(p["lat"], 4), round(p["lon"], 4)
    az, el, terrain = _horizon(lat, lon, HEIGHT_M)
    m = site_metrics(lat, lon, f"{START} 00:00:00 UTC", DAYS, STEP_H,
                     sun_limb_deg=SUN_LIMB_DEG, observer_height_m=HEIGHT_M, horizon=(az, el))
    return lat, lon, az, el, terrain, m


def survey():
    print(f"Settings: {DAYS} days from {START}, hourly, Sun upper edge {SUN_LIMB_DEG} deg, height {HEIGHT_M} m\n")
    print(f"{'id':22s} {'terrain':8s} {'sun %':>6s} {'earth %':>8s} {'both %':>7s} "
          f"{'dark d':>7s} {'gap d':>6s} {'both-down d':>12s}")
    for p in PRESETS:
        lat, lon, az, el, terrain, m = compute(p)
        both_down = longest_run_hours(~(m["sun_up"] | m["earth_up"]), STEP_H) / 24.0
        print(f"{p['id']:22s} {str(terrain):8s} {m['sun_lit_pct']:6.1f} {m['earth_visible_pct']:8.1f} "
              f"{m['both_pct']:7.1f} {m['longest_dark_days']:7.2f} {m['longest_comms_gap_days']:6.2f} "
              f"{both_down:12.2f}")


def site_json(p):
    lat, lon, az, el, terrain, m = compute(p)
    s = m["series"]
    per_day = int(24 / STEP_H)
    n30 = 30 * per_day
    none_up = ~(m["sun_up"] | m["earth_up"])

    def daily(mask):
        return np.round(np.asarray(mask).reshape(DAYS, per_day).mean(axis=1) * 100, 1).tolist()

    # The first hour when neither the Sun nor Earth is above the horizon: the story's
    # "landed, but dark and silent" moment, taken from real geometry.
    moment = None
    idx = np.flatnonzero(none_up)
    if idx.size:
        i = int(idx[0])
        moment = {
            "utc": (datetime.strptime(START, "%Y-%m-%d") + timedelta(hours=i * STEP_H)).strftime("%Y-%m-%d %H:%M"),
            "hour_index": i,
            "sun_el": round(float(s["sun_el"][i]), 2),
            "sun_az": round(float(s["sun_az"][i]), 1),
            "earth_el": round(float(s["earth_el"][i]), 2),
            "earth_az": round(float(s["earth_az"][i]), 1),
            "horizon_at_sun_deg": round(float(np.interp(s["sun_az"][i], az, el, period=360.0)), 2),
            "horizon_at_earth_deg": round(float(np.interp(s["earth_az"][i], az, el, period=360.0)), 2),
        }

    return {
        "id": p["id"],
        "name": p["name"],
        "lat": lat,
        "lon": lon,
        "terrain": bool(terrain),
        "metrics": {k: round(float(m[k]), 2) for k in KEYS},
        "longest_both_down_days": round(longest_run_hours(none_up, STEP_H) / 24.0, 2),
        "horizon": {"az_deg": np.round(az, 1).tolist(), "el_deg": np.round(el, 3).tolist()},
        "track30": {
            "step_hours": STEP_H,
            "sun_az": np.round(s["sun_az"][:n30], 2).tolist(),
            "sun_el": np.round(s["sun_el"][:n30], 2).tolist(),
            "earth_az": np.round(s["earth_az"][:n30], 2).tolist(),
            "earth_el": np.round(s["earth_el"][:n30], 2).tolist(),
        },
        "daily_pct": {
            "sun": daily(m["sun_up"]),
            "earth": daily(m["earth_up"]),
            "both": daily(m["sun_up"] & m["earth_up"]),
        },
        "first_silent_moment": moment,
    }


def windows_json(p, years=5, eval_days=60, per_year=2, step_hours=3.0):
    lat, lon = round(p["lat"], 4), round(p["lon"], 4)
    az, el, terrain = _horizon(lat, lon, HEIGHT_M)
    picks, curve = landing_windows(
        lat, lon, f"{START} 00:00:00 UTC", years, eval_days, per_year, step_hours,
        sun_limb_deg=SUN_LIMB_DEG, observer_height_m=HEIGHT_M, horizon=(az, el),
    )
    t0 = datetime.strptime(START, "%Y-%m-%d")

    def date(day):
        return (t0 + timedelta(days=int(day))).strftime("%Y-%m-%d")

    # The best-scoring landing date, followed hour by hour: the story's "try again" scene,
    # where the same lander finally has the Sun and Earth.
    best = max(picks, key=lambda c: c["score"])
    best_date = date(best["day"])
    bm = site_metrics(lat, lon, f"{best_date} 00:00:00 UTC", eval_days, 1.0,
                      sun_limb_deg=SUN_LIMB_DEG, observer_height_m=HEIGHT_M, horizon=(az, el))
    bs = bm["series"]
    n7 = 7 * 24
    both_idx = np.flatnonzero(bm["sun_up"] & bm["earth_up"])
    best_detail = {
        "landing_date": best_date,
        "metrics": {k: round(float(bm[k]), 2) for k in KEYS},
        "first_both_up_hour": int(both_idx[0]) if both_idx.size else None,
        "track7": {
            "step_hours": 1.0,
            "sun_az": np.round(bs["sun_az"][:n7], 2).tolist(),
            "sun_el": np.round(bs["sun_el"][:n7], 2).tolist(),
            "earth_az": np.round(bs["earth_az"][:n7], 2).tolist(),
            "earth_el": np.round(bs["earth_el"][:n7], 2).tolist(),
            "sun_up": bm["sun_up"][:n7].astype(int).tolist(),
            "earth_up": bm["earth_up"][:n7].astype(int).tolist(),
        },
    }

    return {
        "site": {"id": p["id"], "name": p["name"], "lat": lat, "lon": lon, "terrain": bool(terrain)},
        "best_pick": best_detail,
        "assumptions": {"start": START, "years": years, "eval_days": eval_days, "per_year": per_year,
                        "step_hours": step_hours, "sun_limb_deg": SUN_LIMB_DEG, "observer_height_m": HEIGHT_M,
                        "score_formula": "both_pct - 2*longest_dark_days - 2*longest_comms_gap_days"},
        "windows": [{"landing_date": date(c["day"]),
                     **{k: round(float(v), 2) for k, v in c.items() if k != "day"}} for c in picks],
        "curve": {
            "dates": [date(c["day"]) for c in curve],
            "sun_lit_pct": [round(float(c["sun_lit_pct"]), 1) for c in curve],
            "earth_visible_pct": [round(float(c["earth_visible_pct"]), 1) for c in curve],
            "both_pct": [round(float(c["both_pct"]), 1) for c in curve],
        },
    }


def write(name, payload):
    path = OUT / name
    path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {path} ({path.stat().st_size / 1024:.0f} KB)")


def main():
    ap = argparse.ArgumentParser(description="Export real Cosall numbers for the story page.")
    ap.add_argument("--survey", action="store_true", help="print a summary line for every preset site")
    ap.add_argument("--export", nargs="+", metavar="SITE_ID", help="export these preset sites")
    ap.add_argument("--windows-site", metavar="SITE_ID", help="site for the landing-window scan (default: first exported)")
    args = ap.parse_args()

    by_id = {p["id"]: p for p in PRESETS}
    if args.survey:
        survey()
        return
    if args.export:
        unknown = [i for i in args.export if i not in by_id]
        if unknown:
            raise SystemExit(f"Unknown site id(s): {', '.join(unknown)}. Known: {', '.join(by_id)}")
        windows_id = args.windows_site or args.export[0]
        if windows_id not in by_id:
            raise SystemExit(f"Unknown --windows-site: {windows_id}. Known: {', '.join(by_id)}")
        OUT.mkdir(parents=True, exist_ok=True)
        write("story_sites.json", {
            "assumptions": {"start": START, "days": DAYS, "step_hours": STEP_H,
                            "sun_limb_deg": SUN_LIMB_DEG, "observer_height_m": HEIGHT_M},
            "sites": [site_json(by_id[i]) for i in args.export],
        })
        write("story_windows.json", windows_json(by_id[windows_id]))
        return
    ap.print_help()


if __name__ == "__main__":
    main()