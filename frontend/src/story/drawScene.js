import { horizonAt } from "./sky.js";

// The film's picture: a full-screen night sky over the real LOLA terrain horizon, a lander
// that descends, sits, and lifts off, and the Sun and Earth placed from the exported
// positions. Everything is a pure function of the scroll progress, so scrubbing backwards
// plays the film backwards.

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const seg = (p, a, b) => clamp01((p - a) / (b - a));
export const smooth = (x) => x * x * (3 - 2 * x);
const easeOut = (x) => 1 - Math.pow(1 - x, 3);
const lerp = (a, b, t) => a + (b - a) * t;
const wrap180 = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

// Piecewise-linear lookup through [[p, value], ...]
export function keys(p, table) {
  if (p <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (p <= table[i][0]) {
      const [p0, v0] = table[i - 1];
      const [p1, v1] = table[i];
      return lerp(v0, v1, smooth(seg(p, p0, p1)));
    }
  }
  return table[table.length - 1][1];
}

// Fixed pseudo-random stars (no Math.random, so every frame agrees).
const STARS = Array.from({ length: 260 }, (_, i) => {
  const r = (n) => { const v = Math.sin(i * 127.1 + n * 311.7) * 43758.5453; return v - Math.floor(v); };
  return { x: r(1), y: r(2), s: 0.4 + r(3) * 1.3, o: 0.25 + r(4) * 0.65, t: r(5) * 6.28 };
});

function circMean(list) {
  let sx = 0, sy = 0;
  for (const a of list) { sx += Math.cos((a * Math.PI) / 180); sy += Math.sin((a * Math.PI) / 180); }
  return ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360;
}

// Where the camera looks for a site and track: centred between the Sun and Earth tracks.
export function framing(track) {
  const n = track.sun_az.length;
  const az = [track.sun_az[0], track.earth_az[0], track.sun_az[Math.min(n - 1, 167)], track.earth_az[Math.min(n - 1, 167)]];
  const cam = circMean(az);
  const spread = Math.max(...az.map((a) => Math.abs(wrap180(a - cam))));
  return { cam, fov: Math.max(135, spread * 2 + 60) };
}

function drawLander(ctx, s, sunOn, earthOn, t, tiltDir) {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineWidth = 1.6 / s;
  // legs
  ctx.strokeStyle = "#9aa0aa";
  ctx.beginPath();
  [[-26, -34, -52, 0], [26, -34, 52, 0], [-14, -34, -22, 0], [14, -34, 22, 0]].forEach(([x1, y1, x2, y2]) => { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); });
  ctx.stroke();
  ctx.fillStyle = "#6c727d";
  [-52, -22, 22, 52].forEach((x) => ctx.fillRect(x - 7, -2.5, 14, 3));
  // descent stage
  ctx.fillStyle = "#4a4f5a"; ctx.strokeStyle = "#b8bcc4";
  ctx.beginPath(); ctx.rect(-34, -66, 68, 34); ctx.fill(); ctx.stroke();
  // cabin
  ctx.fillStyle = "#343842";
  ctx.beginPath(); ctx.moveTo(-24, -66); ctx.lineTo(-30, -96); ctx.lineTo(30, -96); ctx.lineTo(24, -66); ctx.closePath(); ctx.fill(); ctx.stroke();
  // solar wings
  [-1, 1].forEach((d) => {
    ctx.save();
    ctx.translate(d * 30, -82);
    ctx.fillStyle = sunOn ? "#d9ac1f" : "#1d2028";
    ctx.strokeStyle = sunOn ? "#ffe27a" : "#6c727d";
    ctx.beginPath(); ctx.rect(d > 0 ? 0 : -78, -5, 78, 10); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = sunOn ? "#8a6a08" : "#454a55";
    ctx.beginPath();
    for (let i = 1; i < 6; i++) { const x = (d > 0 ? 0 : -78) + i * 13; ctx.moveTo(x, -5); ctx.lineTo(x, 5); }
    ctx.stroke();
    ctx.restore();
  });
  // mast and dish, tilted towards Earth
  ctx.strokeStyle = "#b8bcc4";
  ctx.beginPath(); ctx.moveTo(0, -96); ctx.lineTo(0, -116); ctx.stroke();
  ctx.save();
  ctx.translate(0, -116);
  ctx.rotate(tiltDir * 0.5);
  ctx.fillStyle = earthOn ? "#4f8fd6" : "#5a606b";
  ctx.beginPath(); ctx.ellipse(0, -2, 13, 5, 0, Math.PI, 0); ctx.fill();
  ctx.restore();
  if (earthOn) {
    ctx.strokeStyle = "#4f8fd6";
    for (let i = 0; i < 3; i++) {
      const k = ((t * 0.6 + i / 3) % 1);
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = 1.8 / s;
      ctx.beginPath();
      ctx.arc(tiltDir * 14, -128, 10 + k * 46, -Math.PI / 2 - 0.9 + (tiltDir < 0 ? 0.6 : 0), -Math.PI / 2 + 0.9 + (tiltDir < 0 ? 0.6 : 0));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawPlume(ctx, s, strength, t) {
  if (strength <= 0) return;
  const flick = 0.85 + 0.15 * Math.sin(t * 60) + 0.1 * Math.sin(t * 37);
  const len = (38 + 70 * strength) * flick;
  ctx.save();
  const g = ctx.createLinearGradient(0, -32, 0, -32 + len);
  g.addColorStop(0, "rgba(255,244,214,0.95)");
  g.addColorStop(0.4, "rgba(255,190,80,0.55)");
  g.addColorStop(1, "rgba(255,160,40,0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(-14, -32); ctx.lineTo(14, -32); ctx.lineTo(4, -32 + len); ctx.lineTo(-4, -32 + len); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawDust(ctx, cx, y, k, W) {
  if (k <= 0 || k >= 1) return;
  for (let i = 0; i < 46; i++) {
    const r = (n) => { const v = Math.sin(i * 91.7 + n * 17.3) * 9301.77; return v - Math.floor(v); };
    const dir = i % 2 ? 1 : -1;
    const sp = (0.25 + r(1) * 0.9) * W * 0.22;
    const x = cx + dir * sp * easeOut(k);
    const yy = y - 4 - Math.sin(Math.PI * Math.min(1, k * 1.4)) * (8 + r(2) * 26);
    ctx.fillStyle = `rgba(190,188,182,${(1 - k) * 0.45 * (0.4 + r(3) * 0.6)})`;
    ctx.beginPath(); ctx.arc(x, yy, 1.5 + r(4) * 3.2, 0, 7); ctx.fill();
  }
}

/**
 * scene: { site, track, hour, camAz, fov, lander: {descent 0..1, lift 0..1, dust 0..1},
 *          bodies: {alpha, annotate, flat, trail}, up: {sun, earth} }
 */
export function drawScene(ctx, W, H, scene, time) {
  const { site, track, hour, camAz, fov, lander, bodies, up } = scene;
  const pxDeg = W / fov;
  const hz = H * 0.68;
  const ppdY = H / 26;
  const X = (az) => W / 2 + wrap180(az - camAz) * pxDeg;
  const Y = (el) => hz - el * ppdY;

  ctx.fillStyle = "#05060a";
  ctx.fillRect(0, 0, W, H);

  // stars, drifting slowly with the camera
  const shift = -camAz * pxDeg * 0.15;
  for (const st of STARS) {
    const x = (((st.x * W * 1.6 + shift) % (W * 1.6)) + W * 1.6) % (W * 1.6) - W * 0.3;
    const y = st.y * hz * 0.98;
    ctx.globalAlpha = st.o * (0.75 + 0.25 * Math.sin(time * 1.3 + st.t));
    ctx.fillStyle = "#e9e7e2";
    ctx.fillRect(x, y, st.s, st.s);
  }
  ctx.globalAlpha = 1;

  // flat-Moon reference line
  if (bodies.flat > 0) {
    ctx.save();
    ctx.globalAlpha = bodies.flat;
    ctx.strokeStyle = "#e9e7e2"; ctx.setLineDash([6, 7]); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, Y(0)); ctx.lineTo(W, Y(0)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#e9e7e2"; ctx.font = `${Math.max(12, H * 0.016)}px Archivo, sans-serif`;
    ctx.fillText("a flat Moon would put the horizon here", 16, Y(0) - 8);
    ctx.restore();
  }

  // far terrain: the real horizon
  const half = fov / 2 + 4;
  ctx.beginPath();
  ctx.moveTo(W / 2 - half * pxDeg, H);
  for (let a = camAz - half; a <= camAz + half; a += 1.5) {
    ctx.lineTo(W / 2 + (a - camAz) * pxDeg, Y(horizonAt(site.horizon, a)));
  }
  ctx.lineTo(W / 2 + half * pxDeg, H);
  ctx.closePath();
  ctx.fillStyle = "#000"; ctx.fill();
  ctx.strokeStyle = "rgba(233,231,226,0.55)"; ctx.lineWidth = 1.3; ctx.stroke();

  // near ground
  const fg = (x) => H * 0.885 + 5 * Math.sin(x * 0.011) + 3 * Math.sin(x * 0.027 + 1);
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 12) ctx.lineTo(x, fg(x));
  ctx.lineTo(W, H); ctx.closePath();
  ctx.fillStyle = "#0a0b0f"; ctx.fill();
  ctx.strokeStyle = "rgba(233,231,226,0.14)"; ctx.lineWidth = 1; ctx.stroke();
  for (let i = 0; i < 70; i++) {
    const rx = (Math.sin(i * 12.9) * 0.5 + 0.5) * W;
    const ry = fg(rx) + 6 + (Math.sin(i * 7.7) * 0.5 + 0.5) * (H - fg(rx) - 10);
    ctx.fillStyle = "rgba(233,231,226,0.07)";
    ctx.fillRect(rx, ry, 2 + (i % 3), 1.4);
  }

  // trails of the Sun and Earth so far
  if (bodies.trail && hour > 0) {
    for (let i = 0; i <= hour; i += 4) {
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = "#e6b422";
      ctx.beginPath(); ctx.arc(X(track.sun_az[i]), Y(track.sun_el[i]), 1.8, 0, 7); ctx.fill();
      ctx.fillStyle = "#4f8fd6";
      ctx.beginPath(); ctx.arc(X(track.earth_az[i]), Y(track.earth_el[i]), 1.8, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // the Sun and Earth
  if (bodies.alpha > 0) {
    ctx.save();
    ctx.globalAlpha = bodies.alpha;
    const sx = X(track.sun_az[hour]), sy = Y(track.sun_el[hour]);
    const ex = X(track.earth_az[hour]), ey = Y(track.earth_el[hour]);
    const R = Math.max(12, H * 0.027);
    if (up.sun) {
      const g = ctx.createRadialGradient(sx, sy, R * 0.4, sx, sy, R * 5);
      g.addColorStop(0, "rgba(255,226,122,0.55)"); g.addColorStop(1, "rgba(255,226,122,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, R * 5, 0, 7); ctx.fill();
    }
    // A body that is below the terrain is drawn as a dashed ghost on top of the ground,
    // so the viewer can see where it is even though the lander cannot.
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = "#e6b422"; ctx.fillStyle = up.sun ? "#ffe27a" : "rgba(0,0,0,0)";
    ctx.setLineDash(up.sun ? [] : [5, 4]);
    ctx.beginPath(); ctx.arc(sx, sy, R, 0, 7); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#4f8fd6"; ctx.fillStyle = up.earth ? "#4f8fd6" : "rgba(0,0,0,0)";
    ctx.setLineDash(up.earth ? [] : [5, 4]);
    ctx.beginPath(); ctx.arc(ex, ey, R * 0.72, 0, 7); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    if (bodies.annotate > 0) {
      ctx.globalAlpha = bodies.alpha * bodies.annotate;
      ctx.font = `${Math.max(13, H * 0.019)}px Archivo, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = "#e6b422";
      ctx.fillText(`Sun ${track.sun_el[hour].toFixed(1)}°`, sx, sy - R - 12);
      ctx.fillStyle = "#4f8fd6";
      ctx.fillText(`Earth ${track.earth_el[hour].toFixed(1)}°`, ex, ey - R - 12);
      ctx.textAlign = "left";
    }
    ctx.restore();
  }

  // the lander
  const s = (H * 0.19) / 120;
  const cx = W / 2;
  const feet = fg(cx) + 8;
  const { descent, lift, dust } = lander;
  if (descent > 0 || lift > 0) {
    let y;
    let plume = 0;
    if (lift > 0) { y = feet - easeOut(lift) * H * 1.15; plume = 0.4 + lift * 0.6; }
    else {
      y = lerp(-H * 0.3, feet, easeOut(descent));
      plume = descent < 0.985 ? 1 - descent * 0.5 : 0;
    }
    ctx.save();
    ctx.translate(cx, y);
    ctx.scale(s, s);
    drawPlume(ctx, s, plume, time);
    const tilt = Math.sin(((track.earth_az[hour] - camAz) * Math.PI) / 180) >= 0 ? 1 : -1;
    drawLander(ctx, s, up.sun && lift === 0, up.earth && lift === 0 && descent >= 1, time, tilt);
    ctx.restore();
    if (lift === 0) drawDust(ctx, cx, feet, dust, W);
  }
}
