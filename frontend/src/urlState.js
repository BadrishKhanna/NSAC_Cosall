// Shareable links. The app already keeps the current tab in the URL hash (#planner), so
// the settings go after it in the same place: #planner?site=connecting-ridge&start=2027-03-01
// The hash never reaches the server, so no backend change is needed.
//
// How it works: each tab keeps the address bar up to date with its settings (replaceState,
// which adds no history entries and fires no hashchange event). "Copy link" then simply
// copies the address bar. On load, a tab reads its starting values from the same place.

import { CUSTOM } from "./SitePicker.jsx";

// The current tab name and settings, from the hash: "#planner?site=x&start=y".
export function readHash() {
  const raw = window.location.hash.replace(/^#/, "");
  const q = raw.indexOf("?");
  const tab = q === -1 ? raw : raw.slice(0, q);
  const params = new URLSearchParams(q === -1 ? "" : raw.slice(q + 1));
  return { tab, params };
}

// Update some settings in the hash, leaving the others alone. A null, undefined or empty
// value removes that setting.
// Each tab's settings are also remembered here, so a tab that is kept alive in the
// background can still record changes made while it is hidden (patchParams below), and get
// its address back when it is shown again (restoreTabParams).
const tabParams = {};

export function patchParams(tab, patch) {
  const visible = readHash().tab === tab;
  const params = visible ? readHash().params : new URLSearchParams(tabParams[tab] || "");
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === "") params.delete(key);
    else params.set(key, String(value));
  }
  const qs = params.toString();
  tabParams[tab] = qs;
  if (!visible) return; // a hidden tab must not touch the address bar
  const next = `#${tab}${qs ? `?${qs}` : ""}`;
  if (window.location.hash !== next) window.history.replaceState(null, "", next);
}

// Called when a tab is shown again by a plain tab click (a bare "#planner"): puts its own
// settings back into the address bar, so "Copy link" still shares what is on screen.
export function restoreTabParams(tab) {
  const { tab: current, params } = readHash();
  const qs = tabParams[tab];
  if (current !== tab || !qs || [...params].length > 0) return;
  window.history.replaceState(null, "", `#${tab}?${qs}`);
}

export async function copyCurrentLink() {
  const url = window.location.href;
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    try {
      const box = document.createElement("textarea");
      box.value = url;
      box.setAttribute("readonly", "");
      box.style.position = "fixed";
      box.style.opacity = "0";
      document.body.appendChild(box);
      box.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(box);
      return ok;
    } catch {
      return false;
    }
  }
}

// --- Reading values back, with validation: a hand-edited or old link must never break
// the page, it just falls back to the default for that setting. -----------------------

export function parseDateParam(value, fallback, min = "1960-01-01", max = "2050-12-31") {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  if (Number.isNaN(Date.parse(`${value}T00:00:00Z`))) return fallback;
  return value >= min && value <= max ? value : fallback;
}

export function parseNumberParam(value, min, max, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// --- The chosen site (shared by the Site planner and the Launch planner) ---------------

// Settings to write for a site: a preset id, or "custom" with its coordinates.
export function selectionPatch(presetId, customLat, customLon) {
  if (presetId === CUSTOM) return { site: "custom", lat: customLat, lon: customLon };
  return { site: presetId, lat: null, lon: null };
}

// The site picker's state from a link. With no site in the link, `prev` is kept.
export function selectionFromParams(params, prev) {
  const site = params.get("site");
  if (!site) return prev;
  if (site === "custom") {
    const lat = Number.parseFloat(params.get("lat"));
    const lon = Number.parseFloat(params.get("lon"));
    return {
      presetId: CUSTOM,
      customLat: Number.isFinite(lat) ? String(lat) : prev.customLat,
      customLon: Number.isFinite(lon) ? String(lon) : prev.customLon,
    };
  }
  return { ...prev, presetId: site };
}
