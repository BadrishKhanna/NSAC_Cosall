import { horizonAt, sunUp, earthUp } from "./sky.js";

// A panorama of the sky as the lander sees it: azimuth runs left to right (a full circle),
// elevation up the side. The black ground is the real LOLA terrain horizon around the site.
// The vertical scale is exaggerated so the few degrees that matter are visible.
const W = 1000;
const H = 340;
const EL_MIN = -10;
const EL_MAX = 12;
const x = (az) => (((az % 360) + 360) % 360) / 360 * W;
const y = (el) => (H * (EL_MAX - el)) / (EL_MAX - EL_MIN);

const COMPASS = [
  [0, "north"], [90, "east"], [180, "south"], [270, "west"],
];

const FLAT = { az_deg: [0], el_deg: [0] };

export default function SkyView({ site, track, hour, showBodies = true, showPath = true, flat = false, annotate = false, up = null, label }) {
  const horizon = flat ? FLAT : site.horizon;
  const pts = [];
  // Not x(a): x() wraps 360 back to 0, which would draw a stray diagonal at the right edge.
  for (let a = 0; a <= 360; a += 2) pts.push(`${((a / 360) * W).toFixed(1)},${y(horizonAt(horizon, a)).toFixed(1)}`);
  const ground = `M0,${H} L${pts.join(" L")} L${W},${H} Z`;

  const sAz = track.sun_az[hour], sEl = track.sun_el[hour];
  const eAz = track.earth_az[hour], eEl = track.earth_el[hour];
  // `up` lets a scene pass the exported flags, so the picture always matches the numbers.
  const sOn = up ? up.sun : sunUp(track, hour, horizon);
  const eOn = up ? up.earth : earthUp(track, hour, horizon);

  const path = [];
  if (showPath) {
    for (let i = 0; i < track.sun_az.length; i += 6) {
      path.push(<circle key={`s${i}`} cx={x(track.sun_az[i])} cy={y(track.sun_el[i])} r="2" className="sky-trail sun" />);
      path.push(<circle key={`e${i}`} cx={x(track.earth_az[i])} cy={y(track.earth_el[i])} r="2" className="sky-trail earth" />);
    }
  }

  return (
    <svg className="sky-view" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label || "Sky panorama from the landing site"}>
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} className="sky-flat" />
      {COMPASS.map(([a, t]) => (
        <text key={t} x={x(a) + (a === 0 ? 8 : 0)} y={18} textAnchor={a === 0 ? "start" : "middle"} className="sky-compass">{t}</text>
      ))}
      {path}
      <path d={ground} className="sky-ground" />
      {showBodies && (
        <>
          <circle cx={x(sAz)} cy={y(sEl)} r="11" className={`sky-body sun${sOn ? " up" : ""}`} />
          <circle cx={x(eAz)} cy={y(eEl)} r="8" className={`sky-body earth${eOn ? " up" : ""}`} />
          {annotate && (
            <>
              <text x={x(sAz)} y={y(sEl) - 20} textAnchor="middle" className="sky-note sun">
                Sun {sEl.toFixed(1)}&deg; vs ridge {horizonAt(horizon, sAz).toFixed(1)}&deg;
              </text>
              <text x={x(eAz)} y={y(eEl) + 30} textAnchor="middle" className="sky-note earth">
                Earth {eEl.toFixed(1)}&deg; vs ridge {horizonAt(horizon, eAz).toFixed(1)}&deg;
              </text>
            </>
          )}
        </>
      )}
    </svg>
  );
}

export function StatusPanel({ sun, earth, idle }) {
  const cls = (on, extra) => (idle ? "" : on ? `on ${extra}` : "off");
  return (
    <dl className="st-status" aria-label="Lander status">
      <div><dt>Sun</dt><dd className={cls(sun, "sun")}>{idle ? "checking" : sun ? "in view" : "below horizon"}</dd></div>
      <div><dt>Earth</dt><dd className={cls(earth, "earth")}>{idle ? "checking" : earth ? "in view" : "below horizon"}</dd></div>
      <div><dt>Power</dt><dd className={cls(sun, "")}>{idle ? "checking" : sun ? "solar array lit" : "battery only"}</dd></div>
      <div><dt>Link</dt><dd className={cls(earth, "")}>{idle ? "checking" : earth ? "direct to Earth" : "no signal"}</dd></div>
    </dl>
  );
}
