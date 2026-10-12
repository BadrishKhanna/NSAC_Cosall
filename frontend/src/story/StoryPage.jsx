import { useEffect, useMemo, useRef, useState } from "react";
import "./story.css";
import { drawScene, framing, keys, seg, smooth, clamp01 } from "./drawScene.js";
import { REDUCED_MOTION, fmtDate, fmtUtc, sunUp, earthUp } from "./sky.js";

// Cosall, the film. One continuous scene driven by scrolling (or the play button): a lander
// comes down near the Moon's south pole and finds neither Sun nor Earth, and each part of
// Cosall appears at the moment it is needed. Every number is real: it comes from
// story_sites.json and story_windows.json, exported from the same engine as the planners.

const HOOK = "nobile-rim-2";
const COMPARE = ["nobile-rim-2", "peak-near-shackleton", "shackleton-ridge"];
const RETRY = "shackleton-ridge";
const FILM_LENGTH_SVH = 1100; // how much scrolling the film takes
const AUTOPLAY_SECONDS = 130;

const CHAPTERS = [
  ["Touchdown", 0], ["Silence", 0.075], ["The sky", 0.2], ["The terrain", 0.31],
  ["The year", 0.47], ["The sites", 0.6], ["The date", 0.725], ["Second landing", 0.85], ["Finale", 0.965],
];

// brightness of the canvas dimming layer, by progress: the charts sit on a darker sky
const DIM = [[0, 0], [0.455, 0], [0.475, 0.8], [0.66, 0.8], [0.68, 0.94], [0.83, 0.94], [0.85, 0], [0.955, 0], [0.975, 0.95], [1, 0.95]];

const fade = (p, a, b, fin = 0.012, fout = 0.012) =>
  Math.min(smooth(seg(p, a, a + fin)), 1 - smooth(seg(p, b - fout, b)));

const pct = (v) => `${v.toFixed(1)}%`;
const dd = (v) => `${v.toFixed(1)} days`;
const shortName = (s) => s.name.replace(" (candidate site)", "").replace(" (best cell from our scan)", "");

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

// Defined outside Film on purpose: the render loop keeps references to these elements, so
// they must not be remounted when Film re-renders.
function Cap({ a, b, children, tag }) {
  return (
    <div className="film-cap" data-cap={`${a},${b}`}>
      <p>{children}</p>
      {tag && <span className="film-tag">{tag}</span>}
    </div>
  );
}

export default function StoryPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([
      fetch("/story/story_sites.json").then((r) => { if (!r.ok) throw new Error("sites"); return r.json(); }),
      fetch("/story/story_windows.json").then((r) => { if (!r.ok) throw new Error("windows"); return r.json(); }),
    ])
      .then(([sites, windows]) => live && setData({ sites, windows }))
      .catch(() => live && setError(true));
    return () => { live = false; };
  }, []);

  if (error) return <main className="page"><p className="note-line error-line">The story data could not be loaded. Reload the page to try again.</p></main>;
  if (!data) return <main className="film-loading"><p>Loading the story&hellip;</p></main>;
  return <Film sites={data.sites} windows={data.windows} />;
}

function Film({ sites, windows }) {
  const wrapRef = useRef(null);
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const progressRef = useRef(null);
  const curveCursorRef = useRef(null);
  const curveReadRef = useRef(null);
  const [chapter, setChapter] = useState(0);
  const [finale, setFinale] = useState(false);
  const [playing, setPlaying] = useState(false);
  const playRef = useRef(false);
  const pRef = useRef(0);

  const byId = (id) => sites.sites.find((s) => s.id === id);
  const hook = byId(HOOK);
  const retry = byId(RETRY);
  const best = windows.best_pick;
  const start = sites.assumptions.start;
  const m = hook.metrics;

  // Counts for the terrain scene: Sun hours with the real horizon vs a flat Moon, so far.
  const prefix = useMemo(() => {
    const t = hook.track30;
    const n = t.sun_az.length;
    const flat = { az_deg: [0], el_deg: [0] };
    const real = new Array(n), fl = new Array(n);
    let a = 0, b = 0;
    for (let i = 0; i < n; i++) {
      a += sunUp(t, i, hook.horizon) ? 1 : 0;
      b += sunUp(t, i, flat) ? 1 : 0;
      real[i] = a; fl[i] = b;
    }
    return { real, fl, n };
  }, [hook]);

  // The longest run of whole days with neither Sun nor Earth, to outline on the year chart.
  const run = useMemo(() => {
    const d = hook.daily_pct;
    let bestRun = [0, 0], cur = -1;
    for (let i = 0; i <= d.sun.length; i++) {
      const dead = i < d.sun.length && d.sun[i] === 0 && d.earth[i] === 0;
      if (dead && cur < 0) cur = i;
      if (!dead && cur >= 0) { if (i - cur > bestRun[1] - bestRun[0]) bestRun = [cur, i]; cur = -1; }
    }
    return bestRun;
  }, [hook]);

  const frames = useMemo(() => ({ hook: framing(hook.track30), retry: framing(best.track7) }), [hook, best]);
  const curve = windows.curve;
  const nCurve = curve.dates.length;
  const bestIdx = Math.max(0, curve.dates.indexOf(best.landing_date));
  const startIdx = Math.floor(nCurve * 0.08);

  // ---- the render loop ----------------------------------------------------------------
  useEffect(() => {
    const wrap = wrapRef.current, stage = stageRef.current, canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let W = 0, H = 0, dpr = 1, raf = 0, cur = 0, lastChapter = -1, lastFinale = false;
    const caps = [...stage.querySelectorAll("[data-cap]")].map((el) => [el, ...el.dataset.cap.split(",").map(Number)]);
    const panels = [...stage.querySelectorAll("[data-panel]")].map((el) => [el, ...el.dataset.panel.split(",").map(Number)]);
    const reveals = [...stage.querySelectorAll("[data-reveal]")].map((el) => [el, ...el.dataset.reveal.split(",").map(Number)]);
    const logs = [...stage.querySelectorAll("[data-log]")].map((el) => [el, Number(el.dataset.log)]);
    const q = (k) => stage.querySelector(`[data-hud="${k}"]`);
    const hud = { box: q("box"), clock: q("clock"), sun: q("sun"), earth: q("earth"), power: q("power"), link: q("link"), real: q("real"), flat: q("flat") };

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = stage.clientWidth; H = stage.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(stage);

    const setStatus = (el, on, onText, offText, cls) => {
      if (!el) return;
      el.textContent = on ? onText : offText;
      el.className = on ? `on ${cls}` : "off";
    };

    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      const rect = wrap.getBoundingClientRect();
      const total = Math.max(1, rect.height - stage.clientHeight);
      const target = clamp01(-rect.top / total);
      cur += (target - cur) * (REDUCED_MOTION ? 1 : 0.09);
      if (Math.abs(target - cur) < 0.00005) cur = target;
      const p = cur;
      pRef.current = target;
      const time = now / 1000;

      // which film are we in: the first landing or the second
      const second = p >= 0.835;
      let scene;
      if (!second) {
        const t = hook.track30, n = t.sun_az.length;
        const hour = p < 0.3 ? hook.first_silent_moment.hour_index : Math.round(smooth(seg(p, 0.3, 0.46)) * (n - 1));
        const f = frames.hook;
        const camAz = f.cam + (180 - f.cam) * smooth(seg(p, 0.27, 0.31));
        const fov = keys(p, [[0, 175], [0.2, 140], [0.27, f.fov], [0.31, 360]]);
        scene = {
          site: hook, track: t, hour, camAz, fov,
          lander: { descent: seg(p, 0, 0.07), dust: seg(p, 0.068, 0.115), lift: seg(p, 0.6, 0.66) },
          bodies: { alpha: smooth(seg(p, 0.2, 0.25)), annotate: fade(p, 0.215, 0.31), flat: fade(p, 0.375, 0.47, 0.02, 0.02), trail: p > 0.3 },
          up: { sun: sunUp(t, hour, hook.horizon), earth: earthUp(t, hour, hook.horizon) },
        };
      } else {
        const t = best.track7, n = t.sun_az.length;
        const hour = Math.min(n - 1, Math.round(seg(p, 0.905, 0.955) * (n - 1)));
        const f = frames.retry;
        scene = {
          site: retry, track: t, hour, camAz: f.cam, fov: keys(p, [[0.85, f.fov * 1.15], [0.9, f.fov]]),
          lander: { descent: seg(p, 0.855, 0.895), dust: seg(p, 0.893, 0.94), lift: 0 },
          bodies: { alpha: smooth(seg(p, 0.88, 0.9)), annotate: 0, flat: 0, trail: p > 0.906 },
          up: { sun: t.sun_up[hour] === 1, earth: t.earth_up[hour] === 1 },
        };
      }
      drawScene(ctx, W, H, scene, time);
      const dim = keys(p, DIM);
      if (dim > 0.001) { ctx.fillStyle = `rgba(3,4,7,${dim})`; ctx.fillRect(0, 0, W, H); }

      // captions, panels and reveals
      for (const [el, a, b] of caps) {
        const o = fade(p, a, b, 0.014, 0.014);
        el.style.opacity = o.toFixed(3);
        el.style.transform = `translateY(${((1 - o) * 16).toFixed(1)}px)`;
      }
      for (const [el, a, b] of panels) el.style.opacity = fade(p, a, b, 0.014, 0.014).toFixed(3);
      for (const [el, a, b] of reveals) el.style.setProperty("--r", smooth(seg(p, a, b)).toFixed(4));
      for (const [el, th] of logs) el.classList.toggle("on", p >= th);

      // HUD
      const hudO = Math.max(fade(p, 0.07, 0.47, 0.02, 0.02), fade(p, 0.85, 0.965, 0.02, 0.02));
      if (hud.box) hud.box.style.opacity = hudO.toFixed(3);
      if (hud.clock) hud.clock.textContent = second ? fmtUtc(best.landing_date, scene.hour) : fmtUtc(start, scene.hour);
      const landed = second ? p > 0.895 : p > 0.07;
      const idle = !landed;
      if (idle) {
        ["sun", "earth", "power", "link"].forEach((k) => { if (hud[k]) { hud[k].textContent = "—"; hud[k].className = ""; } });
      } else {
        setStatus(hud.sun, scene.up.sun, "in view", "below horizon", "sun");
        setStatus(hud.earth, scene.up.earth, "in view", "below horizon", "earth");
        setStatus(hud.power, scene.up.sun, "solar array lit", "battery only", "");
        setStatus(hud.link, scene.up.earth, "direct to Earth", "no signal", "");
      }
      if (hud.real && !second) {
        hud.real.textContent = `${(prefix.real[scene.hour] / 24).toFixed(1)} days`;
        hud.flat.textContent = `${(prefix.fl[scene.hour] / 24).toFixed(1)} days`;
      }

      // the curve cursor
      if (curveCursorRef.current) {
        const k = smooth(seg(p, 0.745, 0.815));
        const idx = Math.round(startIdx + (bestIdx - startIdx) * k);
        const x = 40 + (idx / (nCurve - 1)) * (740 - 40 - 10);
        curveCursorRef.current.setAttribute("x1", x); curveCursorRef.current.setAttribute("x2", x);
        curveCursorRef.current.style.opacity = seg(p, 0.74, 0.755).toFixed(2);
        if (curveReadRef.current) {
          curveReadRef.current.textContent =
            `Landing on ${fmtDate(curve.dates[idx])}: Sun ${pct(curve.sun_lit_pct[idx])}, Earth ${pct(curve.earth_visible_pct[idx])}, both ${pct(curve.both_pct[idx])}`;
        }
      }

      if (progressRef.current) progressRef.current.style.transform = `scaleX(${p.toFixed(4)})`;
      let ch = 0;
      CHAPTERS.forEach(([, at], i) => { if (p >= at - 0.001) ch = i; });
      if (ch !== lastChapter) { lastChapter = ch; setChapter(ch); }
      const fin = p > 0.972;
      if (fin !== lastFinale) { lastFinale = fin; setFinale(fin); }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [hook, retry, best, frames, prefix, curve, nCurve, bestIdx, startIdx, start]);

  // ---- autopilot ----------------------------------------------------------------------
  const stopPlay = () => { playRef.current = false; setPlaying(false); };
  useEffect(() => {
    if (!playing) return undefined;
    playRef.current = true;
    let last = performance.now(), raf = 0;
    const loop = (now) => {
      if (!playRef.current) return;
      const wrap = wrapRef.current;
      const total = wrap.offsetHeight - stageRef.current.clientHeight;
      const dy = ((now - last) / 1000) * (total / AUTOPLAY_SECONDS);
      last = now;
      window.scrollBy(0, dy);
      if (pRef.current >= 0.999) { stopPlay(); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const stop = () => stopPlay();
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchstart", stop, { passive: true });
    window.addEventListener("keydown", stop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("keydown", stop);
    };
  }, [playing]);

  const scrollToP = (p, instant) => {
    const wrap = wrapRef.current;
    const top = wrap.getBoundingClientRect().top + window.scrollY;
    const total = wrap.offsetHeight - stageRef.current.clientHeight;
    window.scrollTo({ top: top + p * total, behavior: instant || REDUCED_MOTION ? "auto" : "smooth" });
  };
  const togglePlay = () => {
    if (playing) { stopPlay(); return; }
    if (pRef.current > 0.98) scrollToP(0, true);
    setPlaying(true);
  };

  useEffect(() => { window.scrollTo(0, 0); }, []);

  // ---- year chart geometry --------------------------------------------------------------
  const d = hook.daily_pct;
  const rows = [["Sun", d.sun, "sun"], ["Earth", d.earth, "earth"], ["Both", d.both, "both"]];

  // ---- curve geometry -------------------------------------------------------------------
  const CW = 740, CH = 230, L = 40, R = 10, T = 12, B = 30;
  const px = (i) => L + (i / (nCurve - 1)) * (CW - L - R);
  const py = (v) => T + (1 - v / 100) * (CH - T - B);
  const line = (arr) => arr.map((v, i) => `${i ? "L" : "M"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  const yearIdx = [0, 1, 2, 3, 4].map((k) => curve.dates.findIndex((x) => x.startsWith(String(2027 + k))));
  const pickIdx = windows.windows.map((w) => curve.dates.indexOf(w.landing_date)).filter((i) => i >= 0);
  const bm = best.metrics;

  return (
    <main className="film-page">
      <div ref={wrapRef} className="film-wrap" style={{ height: `${FILM_LENGTH_SVH}svh` }}>
        <div ref={stageRef} className="film-stage">
          <canvas ref={canvasRef} className="film-canvas" aria-hidden="true" />
          <div className="film-progress"><span ref={progressRef} /></div>

          {/* title card */}
          <div className="film-title" data-panel="-0.02,0.045">
            <p className="film-kicker">Cosall presents</p>
            <h1>Silent landing</h1>
            <p className="film-sub">A lander touches down near the Moon&rsquo;s south pole. Scroll, or press play.</p>
            <span className="film-chevron" aria-hidden="true" />
          </div>

          {/* mission HUD */}
          <div className="film-hud" data-hud="box" style={{ opacity: 0 }}>
            <p className="film-clock" data-hud="clock">&nbsp;</p>
            <dl>
              <div><dt>Sun</dt><dd data-hud="sun">&mdash;</dd></div>
              <div><dt>Earth</dt><dd data-hud="earth">&mdash;</dd></div>
              <div><dt>Power</dt><dd data-hud="power">&mdash;</dd></div>
              <div><dt>Link</dt><dd data-hud="link">&mdash;</dd></div>
            </dl>
            <ol className="film-log" data-panel="0.075,0.205">
              <li data-log="0.085"><span>T+00:00</span>Touchdown confirmed.</li>
              <li data-log="0.1"><span>T+00:04</span>Solar array: no light.</li>
              <li data-log="0.115"><span>T+00:09</span>Antenna: no signal.</li>
              <li data-log="0.13"><span>T+00:15</span>Running on battery.</li>
            </ol>
            <dl className="film-counts" data-panel="0.375,0.47">
              <div><dt>Sun so far, real horizon</dt><dd data-hud="real">0.0 days</dd></div>
              <div><dt>Sun so far, flat Moon</dt><dd data-hud="flat">0.0 days</dd></div>
            </dl>
          </div>

          {/* captions */}
          <Cap a={0.05} b={0.072}>2027. Near the Moon&rsquo;s south pole, a lander is coming down.</Cap>
          <Cap a={0.078} b={0.2}>Touchdown. Legs down, engines off. And then, nothing: no light on the solar array, no signal to Earth.</Cap>
          <Cap a={0.205} b={0.3} tag="Orbit view · Sun and Earth positions from NASA SPICE (DE440)">
            Nothing is broken. The Sun is {Math.abs(hook.first_silent_moment.sun_el).toFixed(1)}&deg; below the horizon, and Earth is{" "}
            {Math.abs(hook.first_silent_moment.earth_el).toFixed(1)}&deg; below a {hook.first_silent_moment.horizon_at_earth_deg.toFixed(0)}&deg; ridge. Both are there, just out of sight.
          </Cap>
          <Cap a={0.315} b={0.375}>A month passes. The Sun creeps all the way round the horizon, never climbing high. Earth sways in one patch of sky.</Cap>
          <Cap a={0.38} b={0.465} tag="Site planner · real terrain horizon from NASA LOLA elevation data">
            The hills decide what counts as daylight. A flat Moon would give this lander about {(prefix.fl[prefix.n - 1] / 24).toFixed(0)} days of Sun in
            this month. The real horizon gives {(prefix.real[prefix.n - 1] / 24).toFixed(0)}.
          </Cap>
          <Cap a={0.475} b={0.535}>One quiet hour is a nuisance. Weeks are a problem.</Cap>
          <Cap a={0.54} b={0.6} tag="Site planner · any site, any dates">
            Across 2027, this site sees the Sun {pct(m.sun_lit_pct)} of the time and Earth {pct(m.earth_visible_pct)}. Both at once: {pct(m.both_pct)}.
            At one point, {dd(hook.longest_both_down_days)} with neither.
          </Cap>
          <Cap a={0.607} b={0.725} tag="Site planner · compare up to three sites under the same assumptions">
            Move the lander, and the trade-offs move with it. There is no perfect site, only the one whose weaknesses your spacecraft can live with.
          </Cap>
          <Cap a={0.728} b={0.79}>Same place, different day, very different mission.</Cap>
          <Cap a={0.795} b={0.845} tag="Launch planner · five years of landing dates, scored and ranked">
            Cosall scans five years of landing dates for the site. The best window: {fmtDate(best.landing_date)}.
          </Cap>
          <Cap a={0.852} b={0.903}>{fmtDate(best.landing_date)}. Same lander, a better place and day.</Cap>
          <Cap a={0.908} b={0.96}>
            The array is lit and the antenna has a signal. Earth still drops out for up to {dd(bm.longest_comms_gap_days)} at a time, so
            the spacecraft has to wait it out. Cosall shows that gap before you commit.
          </Cap>

          {/* year chart */}
          <div className="film-panel film-year" data-panel="0.475,0.605">
            <div data-reveal="0.49,0.54" className="film-wipe">
              <svg viewBox="0 0 740 150" role="img" aria-label="Daily share of time the Sun, Earth, and both are in view across 2027 at Nobile Rim 2">
                {rows.map(([name, arr, cls], r) => (
                  <g key={name} transform={`translate(52, ${r * 38 + 8})`}>
                    <text x="-8" y="21" textAnchor="end" className="film-axis">{name}</text>
                    <rect x="0" y="0" width={arr.length * 1.9} height="30" className="film-bg" />
                    {arr.map((v, i) => <rect key={i} x={i * 1.9} y="0" width="1.95" height="30" className={`film-cell ${cls}`} style={{ opacity: v / 100 }} />)}
                  </g>
                ))}
                {MONTHS.map((mo, i) => <text key={mo} x={52 + MONTH_START[i] * 1.9} y="140" className="film-axis">{mo}</text>)}
              </svg>
            </div>
            <svg className="film-run" viewBox="0 0 740 150" data-reveal="0.545,0.57" aria-hidden="true">
              <rect x={52 + run[0] * 1.9} y="4" width={(run[1] - run[0]) * 1.9} height="114" />
            </svg>
            <p className="film-note">Each column is a day of 2027. Brighter means more of that day is lit. The outlined stretch is the longest run of whole days with neither.</p>
          </div>

          {/* site comparison */}
          <div className="film-panel film-sites" data-panel="0.607,0.725">
            {COMPARE.map((id, i) => {
              const s = byId(id);
              const a = 0.617 + i * 0.026;
              return (
                <div key={id} className="film-site" data-reveal={`${a},${a + 0.03}`}>
                  <h3>{shortName(s)}{id === HOOK && <span className="film-pill">where we landed</span>}</h3>
                  {[["Sun", "sun_lit_pct", "sun"], ["Earth", "earth_visible_pct", "earth"], ["Both", "both_pct", "both"]].map(([label, key, cls]) => (
                    <div key={key} className="film-bar-row">
                      <span className="film-axis">{label}</span>
                      <span className="film-bar"><span className={`film-fill ${cls}`} style={{ width: `${s.metrics[key]}%` }} /></span>
                      <span className="film-val">{pct(s.metrics[key])}</span>
                    </div>
                  ))}
                  <p className="film-note">Longest dark spell {dd(s.metrics.longest_dark_days)}<br />Longest silence {dd(s.metrics.longest_comms_gap_days)}</p>
                </div>
              );
            })}
          </div>

          {/* five-year curve */}
          <div className="film-panel film-curve" data-panel="0.727,0.847">
            <svg viewBox={`0 0 ${CW} ${CH}`} role="img" aria-label="Share of time the Sun and Earth are both in view for each possible landing date, 2027 to 2031">
              {[0, 25, 50, 75, 100].map((v) => (
                <g key={v}>
                  <line x1={L} x2={CW - R} y1={py(v)} y2={py(v)} className="film-grid" />
                  <text x={L - 6} y={py(v) + 4} textAnchor="end" className="film-axis">{v}%</text>
                </g>
              ))}
              {yearIdx.map((i, k) => i >= 0 && <text key={k} x={px(i)} y={CH - 8} className="film-axis">{2027 + k}</text>)}
              <g data-reveal="0.735,0.785">
                <path d={line(curve.sun_lit_pct)} pathLength="1" className="film-line sun" />
                <path d={line(curve.earth_visible_pct)} pathLength="1" className="film-line earth" />
                <path d={line(curve.both_pct)} pathLength="1" className="film-line both" />
              </g>
              <g data-reveal="0.785,0.8" className="film-picks">
                {pickIdx.map((i) => <circle key={i} cx={px(i)} cy={py(curve.both_pct[i])} r="4.5" />)}
              </g>
              <line ref={curveCursorRef} x1={L} x2={L} y1={T} y2={CH - B} className="film-cursor" style={{ opacity: 0 }} />
            </svg>
            <p className="film-readout" ref={curveReadRef}>&nbsp;</p>
            <p className="film-note">Each point is the next {windows.assumptions.eval_days} days if you land that day, at the ridge near Shackleton. Dots are the windows Cosall recommends.</p>
          </div>

          {/* finale */}
          <div className={`film-finale${finale ? " live" : ""}`} data-panel="0.962,1.2">
            <p className="film-kicker">Cosall</p>
            <h2>Find where the Sun and Earth both shine.</h2>
            <p className="film-sub">
              Geometry only: it does not model power, batteries, temperature or dust, treats Earth as a point, and uses terrain
              data only south of 80&deg;S. A fast, honest first pass for comparing sites and dates.
            </p>
            <div className="film-ctas">
              <a href="#planner?site=shackleton-ridge&start=2027-01-01">Open the Site planner</a>
              <a href="#launch?site=shackleton-ridge">Open the Launch planner</a>
              <a href="#orbit">Open the Orbit view</a>
              <button type="button" onClick={() => { stopPlay(); scrollToP(0, true); }}>Replay</button>
            </div>
          </div>

          {/* controls */}
          <nav className="film-chapters" aria-label="Chapters">
            {CHAPTERS.map(([name, at], i) => (
              <button key={name} type="button" className={i === chapter ? "active" : ""} onClick={() => { stopPlay(); scrollToP(at + 0.004); }} aria-label={name} title={name}>
                <span>{name}</span><i />
              </button>
            ))}
          </nav>
          <div className="film-controls">
            <button type="button" onClick={togglePlay}>{playing ? "Pause" : "Play film"}</button>
            <a href="#home">Leave</a>
          </div>
        </div>
      </div>
    </main>
  );
}
