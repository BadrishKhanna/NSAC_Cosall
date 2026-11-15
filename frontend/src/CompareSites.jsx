import { useEffect, useMemo, useRef, useState } from "react";
import { getJSON, siteQuery } from "./api.js";
import SitePicker, { CUSTOM } from "./SitePicker.jsx";
import VisibilityRibbon from "./VisibilityRibbon.jsx";
import HorizonChart from "./HorizonChart.jsx";
import { patchParams, readHash } from "./urlState.js";

// Side-by-side comparison of three sites, shown below the Site planner's own result.
// The start date, antenna height and Sun-edge setting come from the planner (props), so
// every site is judged on identical assumptions. This component never reports a site up
// to the parent, so it cannot move the Orbit tab's marker or the planner's chosen site.

const SLOTS = 3;
const DEBOUNCE_MS = 700;
const CACHE_MAX = 12;
// Default picks, used only if these presets exist; otherwise the first presets fill in.
const PREFERRED = ["shackleton-ridge", "connecting-ridge", "peak-near-shackleton"];

const ROWS = [
  { label: "Sun above the terrain", key: "sun_lit_pct", better: "high", fmt: (v) => `${v.toFixed(1)}%` },
  { label: "Longest without sunlight", key: "longest_dark_days", better: "low", fmt: (v) => `${v.toFixed(2)} days` },
  { label: "Earth in view", key: "earth_visible_pct", better: "high", fmt: (v) => `${v.toFixed(1)}%` },
  { label: "Longest without Earth", key: "longest_comms_gap_days", better: "low", fmt: (v) => `${v.toFixed(2)} days` },
  { label: "Sun and Earth together", key: "both_pct", better: "high", fmt: (v) => `${v.toFixed(1)}%` },
];

// Gaps smaller than `tol` between the top two sites are reported as a tie.
const VERDICT = [
  { key: "sun_lit_pct", better: "high", tol: 1, what: "sunlight", phrase: "most sunlight", fmt: ROWS[0].fmt },
  { key: "longest_dark_days", better: "low", tol: 0.5, what: "the longest dark stretch", phrase: "shortest dark stretch", fmt: ROWS[1].fmt },
  { key: "earth_visible_pct", better: "high", tol: 1, what: "Earth visibility", phrase: "most Earth visibility", fmt: ROWS[2].fmt },
  { key: "longest_comms_gap_days", better: "low", tol: 0.5, what: "the longest gap without Earth", phrase: "shortest gap without Earth", fmt: ROWS[3].fmt },
];

function defaultSlots(presets) {
  const ids = presets.map((p) => p.id);
  const picks = PREFERRED.filter((id) => ids.includes(id));
  for (const p of presets) {
    if (picks.length >= SLOTS) break;
    if (!picks.includes(p.id)) picks.push(p.id);
  }
  while (picks.length < SLOTS) picks.push(CUSTOM);
  return picks.slice(0, SLOTS).map((id) => ({ presetId: id, customLat: "-89.49", customLon: "-138.67" }));
}

// Starting slots from the link (#planner?c1=connecting-ridge&c2=custom&c2lat=..&c2lon=..).
// Anything missing or unknown falls back to that slot's default site.
function slotsFromParams(params, presets) {
  return defaultSlots(presets).map((d, i) => {
    const n = i + 1;
    const id = params.get(`c${n}`);
    if (id === "custom") {
      const lat = Number.parseFloat(params.get(`c${n}lat`));
      const lon = Number.parseFloat(params.get(`c${n}lon`));
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        return { presetId: CUSTOM, customLat: String(lat), customLon: String(lon) };
      }
    } else if (id && presets.some((p) => p.id === id)) {
      return { ...d, presetId: id };
    }
    return d;
  });
}

function resolveSite(slot, presets) {
  const p = presets.find((x) => x.id === slot.presetId);
  if (p) return { lat: p.lat, lon: p.lon, name: p.name };
  const lat = Number.parseFloat(slot.customLat);
  const lon = Number.parseFloat(slot.customLon);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return { lat, lon, name: `Custom ${lat.toFixed(2)}, ${lon.toFixed(2)}` };
}

function verdictLines(ready) {
  return VERDICT.map((sp) => {
    const sorted = [...ready].sort((a, b) =>
      sp.better === "high" ? b.m[sp.key] - a.m[sp.key] : a.m[sp.key] - b.m[sp.key],
    );
    const [top, second] = sorted;
    if (Math.abs(top.m[sp.key] - second.m[sp.key]) < sp.tol) {
      return `On ${sp.what}, ${top.name} and ${second.name} are effectively tied`;
    }
    return `${top.name} has the ${sp.phrase} (${sp.fmt(top.m[sp.key])})`;
  });
}

export default function CompareSites({ presets, start, sunEdge, heightM, days, hold }) {
  const [slots, setSlots] = useState(() => slotsFromParams(readHash().params, presets));
  const [cols, setCols] = useState(() => Array.from({ length: SLOTS }, () => ({ phase: "idle" })));
  const cacheRef = useRef(new Map());

  // Keep the address bar in step with the three chosen sites, so a copied link includes them.
  useEffect(() => {
    const patch = {};
    slots.forEach((slot, i) => {
      const n = i + 1;
      const custom = slot.presetId === CUSTOM;
      patch[`c${n}`] = custom ? "custom" : slot.presetId;
      patch[`c${n}lat`] = custom ? slot.customLat : null;
      patch[`c${n}lon`] = custom ? slot.customLon : null;
    });
    patchParams("planner", patch);
  }, [slots]);

  const sunLimb = sunEdge ? 0.27 : 0;
  const sites = useMemo(() => slots.map((s) => resolveSite(s, presets)), [slots, presets]);
  const keyFor = (s) =>
    s && start ? [s.lat.toFixed(4), s.lon.toFixed(4), start, sunLimb, heightM, days].join("|") : null;
  const keys = sites.map(keyFor);
  const keysJoined = keys.join("#");

  const setSlot = (i, patch) => setSlots((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const setCol = (i, value) => setCols((prev) => prev.map((c, j) => (j === i ? value : c)));

  // Fetch the sites ONE AFTER ANOTHER (never in parallel): the SPICE library is not
  // thread-safe, and the API runs requests in a thread pool. `hold` is true while the
  // planner's own request is running, so the two never overlap either.
  useEffect(() => {
    if (hold) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      for (let i = 0; i < SLOTS; i++) {
        if (cancelled) return;
        const key = keys[i];
        const s = sites[i];
        if (key === null) {
          setCol(i, { phase: "idle" });
          continue;
        }
        const hit = cacheRef.current.get(key);
        if (hit) {
          setCol(i, { phase: "ready", key, name: s.name, data: hit });
          continue;
        }
        setCol(i, { phase: "loading", key, name: s.name });
        try {
          const path = siteQuery({
            lat: s.lat,
            lon: s.lon,
            start,
            days,
            step_hours: 1,
            sun_limb_deg: sunLimb,
            observer_height_m: heightM,
            include_series: true,
          });
          const data = await getJSON(path, { timeoutMs: 30000 });
          cacheRef.current.set(key, data);
          if (cacheRef.current.size > CACHE_MAX) {
            cacheRef.current.delete(cacheRef.current.keys().next().value);
          }
          if (cancelled) return;
          setCol(i, { phase: "ready", key, name: s.name, data });
        } catch (err) {
          if (cancelled) return;
          setCol(i, { phase: "error", key, name: s.name, error: err.message || "The request failed." });
        }
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // keysJoined stands for every input that matters (sites, start, Sun edge, height).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysJoined, hold]);

  // What to show: an invalid custom site reads as empty, not as its old result.
  const view = cols.map((c, i) => (keys[i] === null ? { phase: "idle" } : c));
  const ready = view
    .map((c, i) => (c.phase === "ready" ? { name: c.name, m: c.data.metrics, data: c.data, i } : null))
    .filter(Boolean);
  const stale = ready.length > 0 && view.some((c, i) => keys[i] !== null && c.key !== keys[i]);
  const loadingIdx = view.findIndex((c) => c.phase === "loading");
  const showFlatNote = ready.some((r) => !r.data.site.terrain);

  const cell = (c, i) => {
    if (keys[i] === null) return "\u2014";
    if (c.phase === "error") return "n/a";
    return "\u2026";
  };

  return (
    <section className="compare" aria-labelledby="cmp-h">
      <div className="section-head">
        <h2 id="cmp-h">Compare sites</h2>
        <p className="caption">
          Pick three sites. They use the start date, antenna height and Sun-edge setting chosen
          above, so the comparison is like for like.
        </p>
      </div>

      <div className="cmp-slots">
        {slots.map((slot, i) => (
          <div className="cmp-slot" key={i}>
            <span className="cmp-slot-label">Site {i + 1}</span>
            <SitePicker
              presets={presets}
              presetId={slot.presetId}
              customLat={slot.customLat}
              customLon={slot.customLon}
              onPresetId={(id) => setSlot(i, { presetId: id })}
              onCustomLat={(v) => setSlot(i, { customLat: v })}
              onCustomLon={(v) => setSlot(i, { customLon: v })}
            />
          </div>
        ))}
      </div>

      {hold && <p className="note-line">Waiting for the main result above to finish&hellip;</p>}
      {!hold && loadingIdx >= 0 && (
        <p className="note-line">
          Computing site {loadingIdx + 1} of {SLOTS}&hellip; sites are computed one at a time.
        </p>
      )}
      {!start && <p className="note-line error-line">Enter a start date above to compare sites.</p>}

      <article className={`cmp-sheet ${stale ? "cmp-stale" : ""}`}>
        <div className="cmp-scroll">
          <table className="metrics cmp-table">
            <thead>
              <tr>
                <td />
                {view.map((c, i) => (
                  <th scope="col" key={i}>
                    {c.name || sites[i]?.name || `Site ${i + 1}`}
                    {c.phase === "ready" && !c.data.site.terrain && <span className="cmp-flat">flat horizon</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => {
                const vals = view.map((c) => (c.phase === "ready" ? c.data.metrics[row.key] : null));
                const present = vals.filter((v) => v !== null);
                let best = null;
                if (present.length >= 2 && Math.max(...present) !== Math.min(...present)) {
                  best = row.better === "high" ? Math.max(...present) : Math.min(...present);
                }
                return (
                  <tr key={row.key}>
                    <th scope="row">{row.label}</th>
                    {vals.map((v, i) => {
                      const isBest = best !== null && v === best;
                      return (
                        <td key={i} className={isBest ? "cmp-best" : ""}>
                          {v === null ? (
                            cell(view[i], i)
                          ) : (
                            <>
                              {isBest && (
                                <span className="cmp-mark" title="Best of the compared sites">
                                  {"\u2713 "}
                                </span>
                              )}
                              {row.fmt(v)}
                            </>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="tcap">
          A check mark shows the best value in each row. Percentages are shares of the {days} days.
        </p>

        {view.map(
          (c, i) =>
            c.phase === "error" && (
              <p className="note-line error-line" key={i}>
                {c.name}: {c.error}
              </p>
            ),
        )}

        {showFlatNote && (
          <p className="badge-flat">
            Sites north of 80&deg;S have no terrain data and use a flat horizon, so they are not
            directly comparable with terrain-masked polar sites.
          </p>
        )}

        {ready.length >= 2 && (
          <>
            <p className="summary">{verdictLines(ready).join(". ")}.</p>
            <p className="tcap">Gaps smaller than 1 percentage point or half a day are reported as ties.</p>
          </>
        )}

        {ready.length > 0 && (
          <div className="cmp-ribbons">
            {ready.map((r) => (
              <div className="cmp-ribbon" key={r.i}>
                <h3>{r.name}</h3>
                <VisibilityRibbon series={r.data.series} stepHours={r.data.assumptions.step_hours} days={days} />
              </div>
            ))}
          </div>
        )}

        {ready.length > 0 && (
          <details className="cmp-details">
            <summary>Horizon views</summary>
            {ready.map((r) => (
              <div className="cmp-horizon" key={r.i}>
                <h3>{r.name}</h3>
                <HorizonChart
                  horizon={r.data.horizon}
                  series={r.data.series}
                  stepHours={r.data.assumptions.step_hours}
                  title={`Horizon view: ${r.name}`}
                />
              </div>
            ))}
          </details>
        )}
      </article>
    </section>
  );
}
