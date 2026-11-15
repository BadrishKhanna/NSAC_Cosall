import { useEffect, useMemo, useRef, useState } from "react";
import { getJSON } from "./api.js";
import "./terrain-map.css";

// Top-down elevation map of the real LOLA 80 m terrain around a point, in the style of
// docs/figures/pole_dem.png. Terrain does not change with the date, so the map is fetched
// once per place and reused. The coordinates typed here belong to this panel only: they never
// change the site chosen in the planner or in the Orbit view.

// The same colors as matplotlib's "terrain" colormap, so it matches pole_dem.png.
const STOPS = [
  [0.0, [51, 51, 153]],
  [0.15, [0, 153, 255]],
  [0.25, [0, 204, 102]],
  [0.5, [255, 255, 153]],
  [0.75, [128, 92, 84]],
  [1.0, [255, 255, 255]],
];
function colorAt(t) {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < STOPS.length; i += 1) {
    if (x <= STOPS[i][0]) {
      const [t0, c0] = STOPS[i - 1];
      const [t1, c1] = STOPS[i];
      const f = (x - t0) / (t1 - t0);
      return c0.map((v, k) => Math.round(v + (c1[k] - v) * f));
    }
  }
  return STOPS[STOPS.length - 1][1];
}
const GRADIENT = `linear-gradient(to top, ${STOPS.map(([t, c]) => `rgb(${c.join(",")}) ${t * 100}%`).join(", ")})`;

const WIDTHS = [
  { half: 10, label: "20 km wide" },
  { half: 30, label: "60 km wide" },
  { half: 60, label: "120 km wide" },
];
const CACHE = new Map();

function fmtCoord(v) {
  return Number.isFinite(v) ? String(Math.round(v * 10000) / 10000) : "";
}

export default function TerrainMap({ site, onClose }) {
  const [lat, setLat] = useState(() => fmtCoord(site?.lat));
  const [lon, setLon] = useState(() => fmtCoord(site?.lon));
  const [half, setHalf] = useState(30);
  const [target, setTarget] = useState(() => (site ? { lat: site.lat, lon: site.lon } : null));
  const [name, setName] = useState(site?.name || "");
  const [phase, setPhase] = useState("idle"); // idle | loading | ready | error
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [hover, setHover] = useState(null);
  const canvasRef = useRef(null);

  // fetch whenever the target place or width changes
  useEffect(() => {
    if (!target) return undefined;
    const key = `${target.lat.toFixed(4)},${target.lon.toFixed(4)},${half}`;
    if (CACHE.has(key)) {
      setData(CACHE.get(key));
      setPhase("ready");
      return undefined;
    }
    let cancelled = false;
    setPhase("loading");
    setError("");
    getJSON(`/api/terrain?lat=${target.lat}&lon=${target.lon}&half_km=${half}&size=160`, { timeoutMs: 30000 })
      .then((d) => {
        if (cancelled) return;
        CACHE.set(key, d);
        setData(d);
        setPhase("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        setData(null);
        setError(e?.message || "The terrain map could not be loaded.");
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, [target, half]);

  // close on Escape
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // the grid as an image, made once per data set
  const image = useMemo(() => {
    if (!data) return null;
    const n = data.size;
    const off = document.createElement("canvas");
    off.width = n;
    off.height = n;
    const ctx = off.getContext("2d");
    const img = ctx.createImageData(n, n);
    const span = Math.max(1, data.max - data.min);
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) {
        const h = data.heights[r][c];
        const i = (r * n + c) * 4;
        if (h === null) {
          img.data[i] = 24;
          img.data[i + 1] = 26;
          img.data[i + 2] = 29;
        } else {
          const [R, G, B] = colorAt((h - data.min) / span);
          img.data[i] = R;
          img.data[i + 1] = G;
          img.data[i + 2] = B;
        }
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return off;
  }, [data]);

  // draw: map, marker, north arrow, scale bar, edge labels
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image || !data) return;
    const size = canvas.clientWidth || 420;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(image, 0, 0, size, size);

    const mid = size / 2;
    // the site marker, at the centre
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.arc(mid, mid, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mid - 14, mid);
    ctx.lineTo(mid - 4, mid);
    ctx.moveTo(mid + 4, mid);
    ctx.lineTo(mid + 14, mid);
    ctx.moveTo(mid, mid - 14);
    ctx.lineTo(mid, mid - 4);
    ctx.moveTo(mid, mid + 4);
    ctx.lineTo(mid, mid + 14);
    ctx.stroke();

    // north arrow (the map is a polar projection, so north is not straight up)
    const [nx, ny] = data.north;
    const ax = size - 34;
    const ay = 38;
    const dx = nx * 18;
    const dy = -ny * 18;
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax - dx, ay - dy);
    ctx.lineTo(ax + dx, ay + dy);
    ctx.stroke();
    const ang = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(ax + dx, ay + dy);
    ctx.lineTo(ax + dx - 8 * Math.cos(ang - 0.45), ay + dy - 8 * Math.sin(ang - 0.45));
    ctx.lineTo(ax + dx - 8 * Math.cos(ang + 0.45), ay + dy - 8 * Math.sin(ang + 0.45));
    ctx.closePath();
    ctx.fill();
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 3;
    ctx.fillText("N", ax + dx * 1.7, ay + dy * 1.7);

    // scale bar, a round number of km that fits about a fifth of the width
    const kmPerPx = (2 * data.half_km) / size;
    const nice = [1, 2, 5, 10, 20, 50].filter((k) => k / kmPerPx <= size * 0.28).pop() || 1;
    const barPx = nice / kmPerPx;
    const bx = 16;
    const by = size - 18;
    ctx.shadowBlur = 3;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + barPx, by);
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillText(`${nice} km`, bx, by - 12);
    ctx.shadowBlur = 0;
  }, [image, data]);

  const apply = (e) => {
    e?.preventDefault();
    const la = Number.parseFloat(lat);
    const lo = Number.parseFloat(lon);
    if (!Number.isFinite(la) || la < -90 || la > 90 || !Number.isFinite(lo) || lo < -360 || lo > 360) {
      setPhase("error");
      setData(null);
      setError("Enter a latitude between -90 and 90 and a longitude between -360 and 360.");
      return;
    }
    setName("");
    setTarget({ lat: la, lon: lo });
  };

  const onMove = (e) => {
    if (!data) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    const c = Math.min(data.size - 1, Math.max(0, Math.floor(fx * data.size)));
    const r = Math.min(data.size - 1, Math.max(0, Math.floor(fy * data.size)));
    const h = data.heights[r][c];
    setHover({
      h,
      x: (fx - 0.5) * 2 * data.half_km,
      y: (0.5 - fy) * 2 * data.half_km,
    });
  };

  const title = name || (target ? `${fmtCoord(target.lat)}°, ${fmtCoord(target.lon)}°` : "Terrain map");

  return (
    <div className="orbit-overlay terrain-panel" role="dialog" aria-label="Terrain map">
      <div className="terrain-head">
        <h3>{title}</h3>
        <button type="button" className="terrain-close" onClick={onClose} aria-label="Close the terrain map">
          &times;
        </button>
      </div>

      <form className="terrain-form" onSubmit={apply}>
        <label>
          <span>Latitude</span>
          <input type="number" step="any" min="-90" max="90" value={lat} onChange={(e) => setLat(e.target.value)} />
        </label>
        <label>
          <span>Longitude</span>
          <input type="number" step="any" min="-360" max="360" value={lon} onChange={(e) => setLon(e.target.value)} />
        </label>
        <button type="submit" className="btn">Show</button>
      </form>
      <p className="orbit-hint terrain-note">
        These coordinates only change this map. They do not change the site chosen elsewhere.
      </p>

      <div className="scale-toggle terrain-width" role="group" aria-label="Map width">
        {WIDTHS.map((w) => (
          <button key={w.half} type="button" className={half === w.half ? "active" : ""} onClick={() => setHalf(w.half)}>
            {w.label}
          </button>
        ))}
      </div>

      <div className="terrain-stage">
        {phase === "loading" && <p className="terrain-msg">Loading terrain&hellip;</p>}
        {phase === "error" && <p className="terrain-msg error-line">{error}</p>}
        {phase === "idle" && <p className="terrain-msg">Enter a latitude and longitude.</p>}
        {phase === "ready" && data && (
          <div className="terrain-map-row">
            <canvas
              ref={canvasRef}
              className="terrain-canvas"
              onMouseMove={onMove}
              onMouseLeave={() => setHover(null)}
              role="img"
              aria-label="Top-down elevation map of the terrain around this point"
            />
            <div className="terrain-bar">
              <span>{data.max.toLocaleString()} m</span>
              <div className="terrain-gradient" style={{ background: GRADIENT }} />
              <span>{data.min.toLocaleString()} m</span>
            </div>
          </div>
        )}
      </div>

      {phase === "ready" && data && (
        <p className="orbit-hint terrain-readout">
          {hover
            ? hover.h === null
              ? "No data at this point."
              : `Height ${hover.h.toLocaleString()} m, ${Math.abs(hover.x).toFixed(1)} km ${hover.x >= 0 ? "right" : "left"} and ${Math.abs(hover.y).toFixed(1)} km ${hover.y >= 0 ? "up" : "down"} of the marker`
            : "Move over the map to read heights. The marker is the chosen point."}
        </p>
      )}
      <p className="orbit-hint">
        Real LOLA terrain, 80 m resolution, seen from above. Heights are measured from a reference
        sphere of 1,737.4 km. Colors show relative height inside this map, not water. The date does
        not change terrain. Coverage is 80&deg;S to the pole.
      </p>
    </div>
  );
}
