// Shared helpers for the story. Everything here is plain geometry on the numbers the
// exporter saved, so the story agrees with the Site planner by construction.

export const SUN_LIMB_DEG = 0.27; // same upper-edge rule as the planners

// Terrain horizon elevation at an azimuth, wrapping round 360 degrees.
export function horizonAt(horizon, az) {
  const n = horizon.az_deg.length;
  const a = ((az % 360) + 360) % 360;
  const step = 360 / n;
  const i = Math.floor(a / step) % n;
  const j = (i + 1) % n;
  const f = (a - i * step) / step;
  return horizon.el_deg[i] * (1 - f) + horizon.el_deg[j] * f;
}

export function sunUp(track, i, horizon) {
  return track.sun_el[i] + SUN_LIMB_DEG > horizonAt(horizon, track.sun_az[i]);
}
export function earthUp(track, i, horizon) {
  return track.earth_el[i] > horizonAt(horizon, track.earth_az[i]);
}

export function fmtUtc(startIso, hourIndex) {
  const d = new Date(`${startIso}T00:00:00Z`);
  d.setUTCHours(d.getUTCHours() + hourIndex);
  return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

export function fmtDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export const REDUCED_MOTION =
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
