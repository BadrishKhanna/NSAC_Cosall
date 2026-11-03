import { useEffect, useMemo, useState } from "react";
import { getJSON, siteQuery } from "./api.js";
import HorizonChart from "./HorizonChart.jsx";
import YearRibbon from "./YearRibbon.jsx";

const CUSTOM = "__custom__";
const DAYS = 365;
const STEP_HOURS = 1;
const DEBOUNCE_MS = 500;

function formatCoords(lat, lon) {
  const la = `${Math.abs(lat).toFixed(3)}\u00b0 ${lat < 0 ? "S" : "N"}`;
  const lo = `${Math.abs(lon).toFixed(3)}\u00b0 ${lon < 0 ? "W" : "E"}`;
  return `${la}, ${lo}`;
}

function fmtPct(v) {
  return `${v.toFixed(1)}%`;
}
function fmtDays(v) {
  return `${v.toFixed(2)} days`;
}

function SnapshotChip({ kind, up, elevation, label, upText, downText }) {
  const sign = elevation >= 0 ? "+" : "\u2212";
  return (
    <div className={`chip chip-${kind} ${up ? "chip-up" : "chip-down"}`}>
      <span className="chip-dot" />
      <span>
        <b>{label}</b> {up ? "up" : "down"}
        <span className="chip-el"> ({sign}{Math.abs(elevation).toFixed(1)}&deg;)</span>
        {" \u2014 "}
        {up ? upText : downText}
      </span>
    </div>
  );
}

export default function SiteWorkspace({ presets }) {
  const [presetId, setPresetId] = useState(presets[0]?.id ?? CUSTOM);
  const [customLat, setCustomLat] = useState("-89.49");
  const [customLon, setCustomLon] = useState("-138.67");
  const [start, setStart] = useState("2027-01-01");
  const [sunEdge, setSunEdge] = useState(true); // true: Sun's upper edge counts; false: center only
  const [heightM, setHeightM] = useState(2);

  const [result, setResult] = useState(null);
  const [phase, setPhase] = useState("idle"); // idle | loading | ready | error
  const [errorMsg, setErrorMsg] = useState("");

  const preset = presets.find((p) => p.id === presetId);
  const site = useMemo(() => {
    if (preset) return { lat: preset.lat, lon: preset.lon, name: preset.name, note: preset.note };
    const lat = Number.parseFloat(customLat);
    const lon = Number.parseFloat(customLon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
    return { lat, lon, name: "Custom coordinates", note: null };
  }, [preset, customLat, customLon]);

  useEffect(() => {
    if (!site) {
      setPhase("error");
      setErrorMsg("Enter a latitude and longitude to see results.");
      return;
    }
    let cancelled = false;
    setPhase("loading");
    const timer = setTimeout(async () => {
      try {
        const path = siteQuery({
          lat: site.lat,
          lon: site.lon,
          start,
          days: DAYS,
          step_hours: STEP_HOURS,
          sun_limb_deg: sunEdge ? 0.27 : 0,
          observer_height_m: heightM,
          include_series: true,
        });
        const data = await getJSON(path, { timeoutMs: 30000 });
        if (cancelled) return;
        setResult(data);
        setPhase("ready");
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(err.message || "The request failed.");
        setPhase("error");
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site?.lat, site?.lon, start, sunEdge, heightM]);

  return (
    <section className="workspace" aria-labelledby="ws-h">
      <div className="section-head">
        <h2 id="ws-h">Choose a site and a date</h2>
        <p>Every number below is computed for this exact site and period when you load the page.</p>
      </div>

      <div className="controls">
        <label className="field">
          <span>Site</span>
          <select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
            <option value={CUSTOM}>Custom coordinates…</option>
          </select>
        </label>

        {presetId === CUSTOM && (
          <>
            <label className="field field-narrow">
              <span>Latitude</span>
              <input
                type="number"
                step="0.001"
                min="-90"
                max="90"
                value={customLat}
                onChange={(e) => setCustomLat(e.target.value)}
              />
            </label>
            <label className="field field-narrow">
              <span>Longitude</span>
              <input
                type="number"
                step="0.001"
                min="-360"
                max="360"
                value={customLon}
                onChange={(e) => setCustomLon(e.target.value)}
              />
            </label>
          </>
        )}

        <label className="field field-narrow">
          <span>Start date</span>
          <input type="date" min="1960-01-01" max="2050-12-31" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>

        <label className="field field-narrow">
          <span>Antenna / panel height</span>
          <input
            type="number"
            step="0.5"
            min="0"
            max="50"
            value={heightM}
            onChange={(e) => setHeightM(Number.parseFloat(e.target.value) || 0)}
          />
        </label>

        <label className="field field-check">
          <input type="checkbox" checked={sunEdge} onChange={(e) => setSunEdge(e.target.checked)} />
          <span>Count the Sun&rsquo;s upper edge, not just its center</span>
        </label>
      </div>

      {phase === "loading" && !result && <p className="note-line">Computing geometry and terrain for this site…</p>}
      {phase === "error" && <p className="note-line error-line">{errorMsg}</p>}

      {result && (
        <article className={`sheet ${phase === "loading" ? "sheet-stale" : ""}`}>
          <div>
            <h2>{site?.name}</h2>
            <p className="site-meta">
              {formatCoords(result.site.lat, result.site.lon)}
              {site?.note ? ` \u2014 ${site.note}` : ""}
            </p>
            {!result.site.terrain && (
              <p className="badge-flat">
                No terrain data at this site (north of 80{"\u00b0"}S). Horizon assumed flat.
              </p>
            )}

            {result.series && (
              <div className="snapshot">
                <p className="snapshot-label">
                  On {result.assumptions.start}, 00:00 UTC
                </p>
                <div className="snapshot-chips">
                  <SnapshotChip
                    kind="sun"
                    up={!!result.series.sun_up[0]}
                    elevation={result.series.sun_el[0]}
                    label="Sun"
                    upText="power available"
                    downText="no direct sunlight"
                  />
                  <SnapshotChip
                    kind="earth"
                    up={!!result.series.earth_up[0]}
                    elevation={result.series.earth_el[0]}
                    label="Earth"
                    upText="direct-to-Earth link possible"
                    downText="no direct-to-Earth link"
                  />
                </div>
              </div>
            )}

            <HorizonChart
              horizon={result.horizon}
              series={result.series}
              stepHours={result.assumptions.step_hours}
              title={`Horizon view at ${formatCoords(result.site.lat, result.site.lon)}`}
            />

            <p className="summary">
              Through the {DAYS}-day period from {result.assumptions.start}, the Sun clears the
              terrain <b className="sun">{fmtPct(result.metrics.sun_lit_pct)}</b> of the time, and the
              longest stretch without sunlight is{" "}
              <b className="sun">{fmtDays(result.metrics.longest_dark_days)}</b>. Earth is in view{" "}
              <b className="earth">{fmtPct(result.metrics.earth_visible_pct)}</b> of the time, with a
              longest gap of <b className="earth">{fmtDays(result.metrics.longest_comms_gap_days)}</b>.
              Both are available together{" "}
              <b className="both">{fmtPct(result.metrics.both_pct)}</b> of the time.
            </p>

            <YearRibbon series={result.series} stepHours={result.assumptions.step_hours} days={DAYS} />

            <table className="metrics">
              <tbody>
                <tr>
                  <th scope="row">Sun above the terrain</th>
                  <td>{fmtPct(result.metrics.sun_lit_pct)}</td>
                </tr>
                <tr>
                  <th scope="row">Longest without sunlight</th>
                  <td>{fmtDays(result.metrics.longest_dark_days)}</td>
                </tr>
                <tr>
                  <th scope="row">Earth in view</th>
                  <td>{fmtPct(result.metrics.earth_visible_pct)}</td>
                </tr>
                <tr>
                  <th scope="row">Longest without Earth</th>
                  <td>{fmtDays(result.metrics.longest_comms_gap_days)}</td>
                </tr>
                <tr>
                  <th scope="row">Sun and Earth together</th>
                  <td>{fmtPct(result.metrics.both_pct)}</td>
                </tr>
              </tbody>
            </table>
            <p className="tcap">Percentages are shares of the {DAYS} days.</p>
          </div>

          <aside>
            <h3>Assumptions</h3>
            <dl>
              <div>
                <dt>Sun counts as visible</dt>
                <dd>
                  {result.assumptions.sun_limb_deg > 0
                    ? `When its upper edge clears the terrain (${result.assumptions.sun_limb_deg}\u00b0)`
                    : "When its center clears the terrain"}
                </dd>
              </div>
              <div>
                <dt>Antenna and panel height</dt>
                <dd>{result.assumptions.observer_height_m} m above the ground</dd>
              </div>
              <div>
                <dt>Period</dt>
                <dd>
                  {result.assumptions.start}, {result.assumptions.days} days, hourly
                </dd>
              </div>
              <div>
                <dt>Terrain</dt>
                <dd>
                  {result.site.terrain
                    ? "NASA LOLA elevation, 80 m pixels, out to 100 km"
                    : "None available; treated as flat"}
                </dd>
              </div>
              <div>
                <dt>Earth counts as visible</dt>
                <dd>When the center of its disk clears the terrain</dd>
              </div>
            </dl>
            <p className="cap">
              Change the Sun&rsquo;s edge setting or the antenna height above to see how much they
              move the answer &mdash; at this kind of site it can be by 10 to 15 points.
            </p>
          </aside>
        </article>
      )}
    </section>
  );
}
