import { useCallback, useEffect, useRef, useState } from "react";
import { getJSON, siteQuery } from "./api.js";
import SnapshotChip from "./SnapshotChip.jsx";
import "./site-sky.css";

// "From the site": the Orbit view's clock, seen from the surface. The sky above the chosen
// landing site, with the Sun and Earth placed where the backend says they are at the
// displayed time (the same /api/site data the Site planner uses, so the numbers agree) and
// the real terrain horizon around the site in front of them.
//
// To animate smoothly without a request per tick, one block of hourly directions is fetched
// (30 days back, 90 days ahead) and interpolated; a new block is fetched only when the clock
// leaves the current one.

const DAY = 86400000;
const HOUR = 3600000;
const MIN_MS = Date.UTC(1960, 0, 1);
const MAX_MS = Date.UTC(2050, 11, 31);
const BACK_DAYS = 30;
const BLOCK_DAYS = 120;
const EDGE_DAYS = 4;
const SUN_RADIUS_DEG = 0.2666; // apparent radius of the Sun
const EARTH_RADIUS_DEG = 0.95; // apparent radius of Earth seen from the Moon (it varies by about 6%)
const SUN_SCALE = 4; // "enlarged" sizes, so the discs can be seen at all
const EARTH_SCALE = 3;
const RAD = Math.PI / 180;
const SYNODIC_OVER_SIDEREAL = 29.5306 / 27.3217; // Sun's drift against the stars vs. the Moon's spin

const wrap180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function startFor(tMs) {
  let s = Math.floor((tMs - BACK_DAYS * DAY) / DAY) * DAY;
  s = Math.max(MIN_MS, s);
  return Math.min(s, MAX_MS - BLOCK_DAYS * DAY);
}

// Hourly Sun and Earth directions around the displayed time, for the chosen site.
function useSkyBlock(site, tMs) {
  const [block, setBlock] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);
  const want = useRef(null);
  const lastFail = useRef(0);

  const drain = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      while (want.current) {
        const w = want.current;
        want.current = null;
        try {
          const data = await getJSON(
            siteQuery({
              lat: w.lat, lon: w.lon, start: new Date(w.startMs).toISOString().slice(0, 10),
              days: BLOCK_DAYS, step_hours: 1, sun_limb_deg: 0.27, observer_height_m: 2, include_series: true,
            }),
            { timeoutMs: 30000 },
          );
          const s = data.series;
          const n = s.sun_az.length;
          let unwrapped = 0;
          for (let i = 1; i < n; i++) unwrapped += wrap180(s.sun_az[i] - s.sun_az[i - 1]);
          setBlock({
            lat: w.lat, lon: w.lon, startMs: w.startMs, n, s,
            horizon: data.horizon, terrain: data.site.terrain,
            sunRate: unwrapped / ((n - 1) / 24), // degrees of azimuth per day
          });
          setError("");
        } catch (err) {
          lastFail.current = Date.now();
          setError(err.message || "The request failed.");
        }
      }
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, []);

  const lat = site?.lat;
  const lon = site?.lon;
  useEffect(() => {
    if (lat === undefined || lon === undefined) return;
    if (Date.now() - lastFail.current < 5000) return; // back off after a failure
    const same = block && Math.abs(block.lat - lat) < 1e-6 && Math.abs(block.lon - lon) < 1e-6;
    if (same) {
      const lo = block.startMs + (block.startMs <= MIN_MS ? 0 : EDGE_DAYS * DAY);
      const atEnd = block.startMs >= MAX_MS - BLOCK_DAYS * DAY;
      const hi = block.startMs + BLOCK_DAYS * DAY - (atEnd ? 0 : EDGE_DAYS * DAY);
      if (tMs >= lo && tMs <= hi) return;
    }
    want.current = { lat, lon, startMs: startFor(tMs) };
    drain();
  }, [lat, lon, tMs, block, drain]);

  return { block, error, loading };
}

// Direction of the Sun or Earth at time tMs, interpolated between the hourly samples.
function sample(block, tMs, azKey, elKey, upKey) {
  const f = clamp((tMs - block.startMs) / HOUR, 0, block.n - 1);
  const i = Math.min(Math.floor(f), block.n - 2);
  const k = f - i;
  const s = block.s;
  const az = (s[azKey][i] + wrap180(s[azKey][i + 1] - s[azKey][i]) * k + 360) % 360;
  const el = s[elKey][i] + (s[elKey][i + 1] - s[elKey][i]) * k;
  return { az, el, up: s[upKey][Math.round(f)] === 1 };
}

function horizonAt(h, az) {
  const n = h.az_deg.length;
  const a = ((az % 360) + 360) % 360;
  const step = 360 / n;
  const i = Math.floor(a / step) % n;
  const j = (i + 1) % n;
  const t = (a - i * step) / step;
  return h.el_deg[i] * (1 - t) + h.el_deg[j] * t;
}

// Fixed decorative stars in the local sky.
const STARS = Array.from({ length: 450 }, (_, i) => {
  const r = (n) => { const v = Math.sin(i * 127.1 + n * 311.7) * 43758.5453; return v - Math.floor(v); };
  return { az: r(1) * 360, el: Math.asin(r(2) * 1.05 - 0.05) / RAD, s: 0.6 + r(3) * 1.2, o: 0.3 + r(4) * 0.6 };
});

const COMPASS = [[0, "N"], [90, "E"], [180, "S"], [270, "W"]];

export default function SiteSkyView({ site, time, earthIllumPct }) {
  const tMs = time.getTime();
  const { block, error, loading } = useSkyBlock(site, tMs);
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const view = useRef({ az: null, pitch: 10, fov: 100 });
  const live = useRef({});
  const [enlarged, setEnlarged] = useState(true);
  const [readout, setReadout] = useState(null);

  live.current = { block, tMs, enlarged, earthIllumPct };

  // Face Earth to begin with: it stays in one patch of sky, so the Sun sweeps past it.
  useEffect(() => {
    if (block && view.current.az === null) {
      view.current.az = sample(block, tMs, "earth_az", "earth_el", "earth_up").az;
    }
  }, [block, tMs]);

  // ---- drawing loop ----
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let W = 0, H = 0, raf = 0, disp = null, lastReadout = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = wrap.clientWidth; H = wrap.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const { block: b, tMs: target, enlarged: big, earthIllumPct: illum } = live.current;
      ctx.fillStyle = "#020306";
      ctx.fillRect(0, 0, W, H);
      if (!b || view.current.az === null) return;

      // ease the displayed time towards the clock, so jumps of hours or days glide
      if (disp === null || Math.abs(target - disp) > 90 * DAY) disp = target;
      else disp += (target - disp) * 0.2;
      if (Math.abs(target - disp) < 1000) disp = target;
      const dispMs = clamp(disp, b.startMs, b.startMs + (b.n - 1) * HOUR);

      const sun = sample(b, dispMs, "sun_az", "sun_el", "sun_up");
      const earth = sample(b, dispMs, "earth_az", "earth_el", "earth_up");

      // camera
      const v = view.current;
      const az0 = v.az * RAD, p0 = v.pitch * RAD;
      const f = [Math.sin(az0) * Math.cos(p0), Math.cos(az0) * Math.cos(p0), Math.sin(p0)];
      const r = [Math.cos(az0), -Math.sin(az0), 0];
      const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
      const focal = W / 2 / Math.tan((v.fov * RAD) / 2);
      const proj = (az, el) => {
        const ce = Math.cos(el * RAD);
        const a = Math.sin(az * RAD) * ce, c = Math.cos(az * RAD) * ce, d = Math.sin(el * RAD);
        const zc = a * f[0] + c * f[1] + d * f[2];
        if (zc <= 0.02) return null;
        return {
          x: W / 2 + ((a * r[0] + c * r[1] + d * r[2]) / zc) * focal,
          y: H / 2 - ((a * u[0] + c * u[1] + d * u[2]) / zc) * focal,
        };
      };

      // stars (they turn with the Moon, so near the pole they circle the sky slowly)
      const polar = Math.abs(b.lat) > 80;
      const starShift = polar ? b.sunRate * SYNODIC_OVER_SIDEREAL * ((dispMs - b.startMs) / DAY) : 0;
      for (const st of STARS) {
        const p = proj(st.az + starShift, st.el);
        if (!p || p.x < -4 || p.x > W + 4 || p.y < -4 || p.y > H + 4) continue;
        ctx.globalAlpha = st.o * (0.8 + 0.2 * Math.sin(now / 900 + st.az));
        ctx.fillStyle = "#e9e7e2";
        ctx.fillRect(p.x, p.y, st.s, st.s);
      }
      ctx.globalAlpha = 1;

      // paths of the Sun and Earth: where they have been (brighter) and will be
      for (let i = 0; i < b.n; i += 6) {
        const past = b.startMs + i * HOUR <= dispMs;
        ctx.globalAlpha = past ? 0.4 : 0.17;
        const ps = proj(b.s.sun_az[i], b.s.sun_el[i]);
        if (ps) { ctx.fillStyle = "#e6b422"; ctx.beginPath(); ctx.arc(ps.x, ps.y, 1.7, 0, 7); ctx.fill(); }
        const pe = proj(b.s.earth_az[i], b.s.earth_el[i]);
        if (pe) { ctx.fillStyle = "#4f8fd6"; ctx.beginPath(); ctx.arc(pe.x, pe.y, 1.7, 0, 7); ctx.fill(); }
      }
      ctx.globalAlpha = 1;

      // the Sun
      const sp = proj(sun.az, sun.el);
      if (sp) {
        const rr = Math.max(2.5, focal * Math.tan(SUN_RADIUS_DEG * RAD) * (big ? SUN_SCALE : 1));
        const halo = rr * 9;
        const g = ctx.createRadialGradient(sp.x, sp.y, rr * 0.5, sp.x, sp.y, halo);
        g.addColorStop(0, "rgba(255,226,122,0.55)");
        g.addColorStop(1, "rgba(255,226,122,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(sp.x, sp.y, halo, 0, 7); ctx.fill();
        ctx.fillStyle = "#fff0b8";
        ctx.beginPath(); ctx.arc(sp.x, sp.y, rr, 0, 7); ctx.fill();
      }

      // Earth, with its real phase: the lit side faces the Sun
      const ep = proj(earth.az, earth.el);
      if (ep) {
        const rr = Math.max(5, focal * Math.tan(EARTH_RADIUS_DEG * RAD) * (big ? EARTH_SCALE : 1));
        const sp2 = sp || null;
        const theta = sp2
          ? Math.atan2(sp2.y - ep.y, sp2.x - ep.x)
          : Math.atan2(-(sun.el - earth.el), wrap180(sun.az - earth.az));
        const lit = illum === null || illum === undefined ? 1 : clamp(illum / 100, 0, 1);
        ctx.save();
        ctx.translate(ep.x, ep.y);
        ctx.rotate(theta);
        ctx.fillStyle = "#0b1626";
        ctx.beginPath(); ctx.arc(0, 0, rr, 0, 7); ctx.fill();
        ctx.fillStyle = "#8fbdf0";
        ctx.beginPath();
        ctx.arc(0, 0, rr, -Math.PI / 2, Math.PI / 2, false);
        const rx = Math.abs(1 - 2 * lit) * rr;
        if (lit > 0.5) ctx.ellipse(0, 0, rx, rr, 0, Math.PI / 2, (3 * Math.PI) / 2, false);
        else ctx.ellipse(0, 0, rx, rr, 0, Math.PI / 2, -Math.PI / 2, true);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(143,189,240,0.5)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, rr, 0, 7); ctx.stroke();
        ctx.restore();
      }

      // the ground: the real terrain horizon, lightly tinted while the Sun is up
      const pts = [];
      for (let d = -88; d <= 88; d += 1) {
        const a = v.az + d;
        const p = proj(a, horizonAt(b.horizon, a));
        if (p) pts.push(p);
      }
      if (pts.length > 1) {
        const lightK = sun.up ? clamp(sun.el / 5, 0.3, 1) : 0;
        const c0 = Math.round(8 + 62 * lightK), c1 = Math.round(4 + 18 * lightK);
        const top = pts.reduce((m, p) => Math.min(m, p.y), H);
        const g = ctx.createLinearGradient(0, top, 0, H);
        g.addColorStop(0, `rgb(${c0},${c0 - 2},${c0 - 5})`);
        g.addColorStop(1, `rgb(${c1},${c1},${c1})`);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, H + 20);
        for (const p of pts) ctx.lineTo(p.x, p.y);
        ctx.lineTo(pts[pts.length - 1].x, H + 20);
        ctx.closePath();
        ctx.fillStyle = g;
        ctx.fill();
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.strokeStyle = "rgba(233,231,226,0.55)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }

      // compass letters on the horizon
      ctx.font = "13px Archivo, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(233,231,226,0.8)";
      for (const [a, name] of COMPASS) {
        const p = proj(a, horizonAt(b.horizon, a) + 1.6);
        if (p && p.x > 10 && p.x < W - 10) ctx.fillText(name, p.x, p.y - 4);
      }

      if (now - lastReadout > 250) {
        lastReadout = now;
        setReadout({ sun, earth, terrain: b.terrain });
      }
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  // ---- looking around: drag to turn, wheel or pinch to zoom, arrow keys ----
  useEffect(() => {
    const wrap = wrapRef.current;
    const pointers = new Map();
    let pinch = 0;
    const focalNow = () => wrap.clientWidth / 2 / Math.tan((view.current.fov * RAD) / 2);
    const down = (e) => {
      if (e.target.closest(".orbit-overlay")) return; // let the buttons and panels take their own clicks
      wrap.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      pinch = 0;
    };
    const move = (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) view.current.fov = clamp(view.current.fov * (pinch / dist), 30, 120);
        pinch = dist;
        return;
      }
      const k = (1 / focalNow()) / RAD;
      view.current.az = (((view.current.az - dx * k) % 360) + 360) % 360;
      view.current.pitch = clamp(view.current.pitch + dy * k, -15, 80);
    };
    const up = (e) => { pointers.delete(e.pointerId); pinch = 0; };
    const wheel = (e) => {
      e.preventDefault();
      view.current.fov = clamp(view.current.fov * Math.exp(e.deltaY * 0.001), 30, 120);
    };
    const key = (e) => {
      const step = 5;
      if (e.key === "ArrowLeft") view.current.az = (view.current.az - step + 360) % 360;
      else if (e.key === "ArrowRight") view.current.az = (view.current.az + step) % 360;
      else if (e.key === "ArrowUp") view.current.pitch = clamp(view.current.pitch + step, -15, 80);
      else if (e.key === "ArrowDown") view.current.pitch = clamp(view.current.pitch - step, -15, 80);
      else return;
      e.preventDefault();
    };
    wrap.addEventListener("pointerdown", down);
    wrap.addEventListener("pointermove", move);
    wrap.addEventListener("pointerup", up);
    wrap.addEventListener("pointercancel", up);
    wrap.addEventListener("wheel", wheel, { passive: false });
    wrap.addEventListener("keydown", key);
    return () => {
      wrap.removeEventListener("pointerdown", down);
      wrap.removeEventListener("pointermove", move);
      wrap.removeEventListener("pointerup", up);
      wrap.removeEventListener("pointercancel", up);
      wrap.removeEventListener("wheel", wheel);
      wrap.removeEventListener("keydown", key);
    };
  }, []);

  const face = (which) => {
    if (!readout) return;
    const b = which === "sun" ? readout.sun : readout.earth;
    view.current.az = b.az;
    view.current.pitch = clamp(Math.max(8, b.el + 6), -15, 80);
  };
  const reset = () => {
    if (readout) view.current.az = readout.earth.az;
    view.current.pitch = 10;
    view.current.fov = 100;
  };

  return (
    <div className="sky-wrap" ref={wrapRef} tabIndex={0} aria-label="Sky above the landing site. Drag to look around.">
      <canvas ref={canvasRef} className="sky-canvas" />

      {!block && (
        <p className={`sky-message ${error ? "error-line" : ""}`}>
          {error ? "Could not load the sky for this site. Is the backend running?" : "Loading the sky…"}
        </p>
      )}
      {block && loading && <p className="sky-updating">Updating&hellip;</p>}

      <div className="orbit-overlay sky-controls">
        <button type="button" className="btn" onClick={() => face("sun")}>Face the Sun</button>
        <button type="button" className="btn" onClick={() => face("earth")}>Face Earth</button>
        <button type="button" className="btn" onClick={reset}>Reset view</button>
        <div className="scale-toggle" role="group" aria-label="Size of the Sun and Earth">
          <button type="button" className={enlarged ? "active" : ""} onClick={() => setEnlarged(true)}>Enlarged</button>
          <button type="button" className={!enlarged ? "active" : ""} onClick={() => setEnlarged(false)}>True size</button>
        </div>
      </div>

      <div className="orbit-overlay orbit-overlay-br sky-panel">
        <h3>{site?.name || "Landing site"}</h3>
        {readout ? (
          <>
            {!readout.terrain && <p className="orbit-hint">No terrain data here; horizon assumed flat.</p>}
            <SnapshotChip
              kind="sun" up={readout.sun.up} elevation={readout.sun.el} label="Sun"
              upText="power available" downText="no direct sunlight"
            />
            <SnapshotChip
              kind="earth" up={readout.earth.up} elevation={readout.earth.el} label="Earth"
              upText="direct-to-Earth link possible" downText="no direct-to-Earth link"
            />
            {earthIllumPct !== null && earthIllumPct !== undefined && (
              <p className="orbit-hint">Earth is about {Math.round(earthIllumPct)}% lit as seen from the Moon.</p>
            )}
          </>
        ) : (
          <p className="note-line">Loading&hellip;</p>
        )}
        <p className="orbit-hint">
          Real directions and terrain horizon, from the same data as the Site planner.
          {enlarged ? " The Sun and Earth are drawn larger than life so they can be seen; the dotted paths are the last 30 days and the next 90." : " Sizes are true: the Sun is about half a degree across, Earth about two."}{" "}
          Ground shading is illustrative. Drag to look around.
        </p>
      </div>
    </div>
  );
}
