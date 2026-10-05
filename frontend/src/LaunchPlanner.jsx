import { useEffect, useMemo, useRef, useState } from "react";
import { getJSON, siteQuery, windowsQuery } from "./api.js";
import SitePicker, { CUSTOM } from "./SitePicker.jsx";
import WindowsTimeline from "./WindowsTimeline.jsx";
import VisibilityRibbon from "./VisibilityRibbon.jsx";
import CopyLinkButton from "./CopyLinkButton.jsx";
import { parseDateParam, parseNumberParam, patchParams, readHash, selectionPatch } from "./urlState.js";

const YEARS = 5;
const PER_YEAR = 2;

// A few well-known orbital launch sites, real coordinates. Latitude sets the minimum
// inclination a direct-ascent launch can reach efficiently (roughly: min inclination
// approx equals launch latitude) -- a real, simple fact worth showing, without claiming
// to compute the specific translunar injection geometry, which depends on much more
// (the parking orbit, the Moon's declination at injection, and so on) than we model here.
const LAUNCH_SITES = [
  { id: "ksc", name: "Kennedy Space Center, USA", lat: 28.5, lon: -80.6 },
  { id: "kourou", name: "Guiana Space Centre, Kourou", lat: 5.2, lon: -52.8 },
  { id: "sriharikota", name: "Satish Dhawan Space Centre, India", lat: 13.7, lon: 80.2 },
  { id: "tanegashima", name: "Tanegashima Space Center, Japan", lat: 30.4, lon: 130.9 },
  { id: "baikonur", name: "Baikonur Cosmodrome, Kazakhstan", lat: 46.0, lon: 63.3 },
  { id: "vandenberg", name: "Vandenberg Space Force Base, USA", lat: 34.6, lon: -120.6 },
];

const TRANSFERS = [
  { id: "direct", label: "Direct transfer (~4.3 days)", days: 4.3, note: "Apollo 11's actual transit time, launch to landing." },
  { id: "lowenergy", label: "Low-energy transfer (~40 days)", days: 40.1, note: "Chandrayaan-3's actual transit time, launch to landing." },
  { id: "custom", label: "Custom", days: null, note: "Enter your own assumed transit time." },
];

function inclinationNote(lat) {
  const a = Math.abs(lat);
  if (a < 10) return `Near-equatorial (${a.toFixed(1)}\u00b0): can reach almost any orbital inclination efficiently.`;
  if (a < 30) return `Low latitude (${a.toFixed(1)}\u00b0): reaches low and moderate inclinations efficiently.`;
  return `Higher latitude (${a.toFixed(1)}\u00b0): direct ascent favors higher-inclination orbits; reaching a low-inclination orbit costs extra fuel for a plane change.`;
}

function fmtPct(v) {
  return `${v.toFixed(1)}%`;
}
function fmtDays(v) {
  return `${v.toFixed(1)} days`;
}

export default function LaunchPlanner({ presets, selection, onSelectionChange, onSiteChange }) {
  const presetId = selection.presetId || presets[0]?.id || CUSTOM;
  const customLat = selection.customLat;
  const customLon = selection.customLon;
  const setPresetId = (id) => onSelectionChange({ ...selection, presetId: id });
  const setCustomLat = (v) => onSelectionChange({ ...selection, customLat: v });
  const setCustomLon = (v) => onSelectionChange({ ...selection, customLon: v });

  // Starting values come from the link (#launch?start=...&eval=...&ls=...&tr=...), if it
  // has them. Anything missing or invalid falls back to the usual default.
  const [linkParams] = useState(() => readHash().params);
  const [start, setStart] = useState(() => parseDateParam(linkParams.get("start"), "2027-01-01", "1960-01-01", "2045-01-01"));
  const [evalDays, setEvalDays] = useState(() => Math.round(parseNumberParam(linkParams.get("eval"), 10, 365, 60)));
  const [launchSiteId, setLaunchSiteId] = useState(() => {
    const v = linkParams.get("ls");
    return LAUNCH_SITES.some((s) => s.id === v) ? v : LAUNCH_SITES[0].id;
  });
  const [transferId, setTransferId] = useState(() => {
    const v = linkParams.get("tr");
    return TRANSFERS.some((t) => t.id === v) ? v : "direct";
  });
  const [customDays, setCustomDays] = useState(() => parseNumberParam(linkParams.get("td"), 1, 200, 14));

  const [result, setResult] = useState(null);
  const [phase, setPhase] = useState("idle"); // idle | loading | ready | error
  const [errorMsg, setErrorMsg] = useState("");

  const [selectedIdx, setSelectedIdx] = useState(null);
  const [outlook, setOutlook] = useState(null);
  const [outlookPhase, setOutlookPhase] = useState("idle");

  const preset = presets.find((p) => p.id === presetId);
  const site = useMemo(() => {
    if (preset) return { lat: preset.lat, lon: preset.lon, name: preset.name };
    const lat = Number.parseFloat(customLat);
    const lon = Number.parseFloat(customLon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
    return { lat, lon, name: "Custom coordinates" };
  }, [preset, customLat, customLon]);

  useEffect(() => {
    onSiteChange?.(site);
  }, [site, onSiteChange]);

  const launchSite = LAUNCH_SITES.find((s) => s.id === launchSiteId);
  const transfer = TRANSFERS.find((t) => t.id === transferId);
  const transitDays = transferId === "custom" ? customDays : transfer.days;

  // --- Shareable link ---------------------------------------------------------------
  // The settings that change the scan itself (site, start date, evaluation length) also
  // clear "run" and "sel" from the link: once they change, the results on screen no longer
  // match them, so a link should not claim to reproduce those results. The scan marks the
  // link "run=1" again when it finishes.
  const scanSig = JSON.stringify([site?.lat, site?.lon, start, evalDays]);
  const liveSigRef = useRef(scanSig);
  liveSigRef.current = scanSig;

  useEffect(() => {
    patchParams("launch", {
      ...selectionPatch(presetId, customLat, customLon),
      start,
      eval: evalDays,
      run: null,
      sel: null,
    });
  }, [presetId, customLat, customLon, start, evalDays]);

  // Launch site and transfer time do not need a new scan (only the launch dates shown on
  // the cards change), so they are saved without clearing the results markers.
  useEffect(() => {
    patchParams("launch", {
      ls: launchSiteId,
      tr: transferId,
      td: transferId === "custom" ? customDays : null,
    });
  }, [launchSiteId, transferId, customDays]);

  // Which window card is open.
  useEffect(() => {
    patchParams("launch", { sel: selectedIdx === null ? null : selectedIdx + 1 });
  }, [selectedIdx]);

  // A link made after a scan (run=1) re-runs that scan on load and re-opens the same card.
  const pendingSel = useRef(null);
  useEffect(() => {
    if (linkParams.get("run") !== "1" || !site) return;
    const sel = Number.parseInt(linkParams.get("sel"), 10);
    pendingSel.current = Number.isFinite(sel) ? sel - 1 : null;
    runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runScan() {
    if (!site) return;
    const sig = scanSig;
    setPhase("loading");
    setErrorMsg("");
    setResult(null);
    setSelectedIdx(null);
    setOutlook(null);
    try {
      const path = windowsQuery({
        lat: site.lat, lon: site.lon, start, years: YEARS, eval_days: evalDays, per_year: PER_YEAR,
      });
      const data = await getJSON(path, { timeoutMs: 60000 });
      setResult(data);
      setPhase("ready");
      // Mark the link as "this view includes a finished scan", unless the settings were
      // changed while it ran.
      if (sig === liveSigRef.current) patchParams("launch", { run: 1 });
      const want = pendingSel.current;
      pendingSel.current = null;
      if (want !== null && want >= 0 && want < data.windows.length) setSelectedIdx(want);
    } catch (err) {
      pendingSel.current = null;
      setErrorMsg(err.message || "The scan failed.");
      setPhase("error");
    }
  }

  // Fetch the 3-year mission outlook for whichever window card is selected.
  useEffect(() => {
    if (selectedIdx === null || !result || !site) return;
    const w = result.windows[selectedIdx];
    let cancelled = false;
    setOutlookPhase("loading");
    (async () => {
      try {
        const path = siteQuery({
          lat: site.lat, lon: site.lon, start: w.landing_date, days: 3 * 365, step_hours: 6,
          sun_limb_deg: result.assumptions.sun_limb_deg, observer_height_m: result.assumptions.observer_height_m,
          include_series: true,
        });
        const data = await getJSON(path, { timeoutMs: 60000 });
        if (cancelled) return;
        setOutlook(data);
        setOutlookPhase("ready");
      } catch (err) {
        if (cancelled) return;
        setOutlookPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedIdx, result, site]);

  function launchDateFor(landingDateStr) {
    const d = new Date(landingDateStr + "T00:00:00Z");
    d.setTime(d.getTime() - transitDays * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }

  return (
    <section className="launch-page" aria-labelledby="launch-h">
      <header>
        <h1 id="launch-h">Launch date suggester</h1>
        <p className="lede">
          Pick a landing site, and this scans {YEARS} years of candidate landing dates to find the
          {" "}{PER_YEAR} best per year &mdash; each scored on the site&rsquo;s sunlight and Earth
          visibility over the following {evalDays} days, the mission&rsquo;s early, most
          survivability-critical stretch.
        </p>
      </header>

      <div className="launch-controls">
        <SitePicker
          presets={presets}
          presetId={presetId}
          customLat={customLat}
          customLon={customLon}
          onPresetId={setPresetId}
          onCustomLat={setCustomLat}
          onCustomLon={setCustomLon}
        />
        <label className="field field-narrow">
          <span>Scan starting</span>
          <input type="date" min="1960-01-01" max="2045-01-01" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field field-narrow">
          <span>Evaluate this many days after landing</span>
          <input
            type="number" min="10" max="365" step="5" value={evalDays}
            onChange={(e) => setEvalDays(Number.parseInt(e.target.value, 10) || 60)}
          />
        </label>
        <button type="button" className="btn" onClick={runScan} disabled={!site || phase === "loading"}>
          {phase === "loading" ? "Scanning\u2026" : "Find launch windows"}
        </button>
        <CopyLinkButton />
      </div>

      <div className="launch-controls">
        <label className="field">
          <span>Launch site on Earth</span>
          <select value={launchSiteId} onChange={(e) => setLaunchSiteId(e.target.value)}>
            {LAUNCH_SITES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Transfer to the Moon</span>
          <select value={transferId} onChange={(e) => setTransferId(e.target.value)}>
            {TRANSFERS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        {transferId === "custom" && (
          <label className="field field-narrow">
            <span>Transit time (days)</span>
            <input type="number" min="1" max="200" step="0.1" value={customDays}
                  onChange={(e) => setCustomDays(Number.parseFloat(e.target.value) || 1)} />
          </label>
        )}
      </div>
      <p className="launch-note">{inclinationNote(launchSite.lat)} {transfer.note}</p>

      {phase === "error" && <p className="note-line error-line">{errorMsg}</p>}
      {phase === "loading" && <p className="note-line">Scanning {YEARS} years of candidate dates&hellip; this can take a little while on a cold server.</p>}

      {result && (
        <article className="sheet-single launch-results">
          <WindowsTimeline curve={result.curve} windows={result.windows} years={YEARS} />

          <p className="tcap tcap-spaced">
            Score = both_pct &minus; 2&times;longest_dark_days &minus; 2&times;longest_comms_gap_days,
            computed over each candidate&rsquo;s own {result.assumptions.eval_days}-day window.
            This ranks candidates for you to inspect further, it is not a mission-design optimum.
          </p>

          <div className="window-cards">
            {result.windows.map((w, i) => (
              <button
                type="button"
                key={w.landing_date}
                className={`window-card${i === selectedIdx ? " window-card-selected" : ""}`}
                onClick={() => setSelectedIdx(i)}
              >
                <div className="window-card-head">
                  <span className="window-card-num">{i + 1}</span>
                  <h3>{w.landing_date}</h3>
                </div>
                <dl>
                  <div><dt>Sun visible</dt><dd>{fmtPct(w.sun_lit_pct)}</dd></div>
                  <div><dt>Earth visible</dt><dd>{fmtPct(w.earth_visible_pct)}</dd></div>
                  <div><dt>Both together</dt><dd>{fmtPct(w.both_pct)}</dd></div>
                  <div><dt>Longest dark stretch</dt><dd>{fmtDays(w.longest_dark_days)}</dd></div>
                  <div><dt>Longest comms gap</dt><dd>{fmtDays(w.longest_comms_gap_days)}</dd></div>
                </dl>
                <p className="launch-date-line">
                  Launch from {launchSite.name.split(",")[0]} by
                  <b>{launchDateFor(w.landing_date)}</b>
                </p>
              </button>
            ))}
          </div>
        </article>
      )}

      {selectedIdx !== null && result && (
        <article className="sheet-single launch-outlook">
          <h2>Mission outlook: 3 years from {result.windows[selectedIdx].landing_date}</h2>
          {outlookPhase === "loading" && <p className="note-line">Computing the 3-year outlook&hellip;</p>}
          {outlookPhase === "error" && <p className="note-line error-line">Could not load the 3-year outlook.</p>}
          {outlook && (
            <>
              <p className="summary">
                Over the three years from landing, the Sun clears the terrain{" "}
                <b className="sun">{fmtPct(outlook.metrics.sun_lit_pct)}</b> of the time
                (longest dark stretch <b className="sun">{fmtDays(outlook.metrics.longest_dark_days)}</b>), and
                Earth is in view <b className="earth">{fmtPct(outlook.metrics.earth_visible_pct)}</b> of the
                time (longest gap <b className="earth">{fmtDays(outlook.metrics.longest_comms_gap_days)}</b>).
                Both together: <b className="both">{fmtPct(outlook.metrics.both_pct)}</b>.
              </p>
              <VisibilityRibbon series={outlook.series} stepHours={outlook.assumptions.step_hours} days={3 * 365} />
            </>
          )}
        </article>
      )}
    </section>
  );
}
