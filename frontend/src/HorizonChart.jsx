// Draws the terrain horizon around a site as a black "sky window", with the Sun's
// and Earth's tracks over the first 30 days of the requested period plotted against it.
// Pure SVG, no charting library: the whole picture is under 400 points.

const VB_W = 1000;
const VB_H = 300;
const PAD_L = 54;
const PAD_R = 20;
const PAD_T = 22;
const PAD_B = 40;
const X0 = PAD_L;
const X1 = VB_W - PAD_R;
const Y0 = PAD_T;
const Y1 = VB_H - PAD_B;
const TRACK_DAYS = 30; // how much of the Sun/Earth tracks to draw, to keep the picture legible

function niceBounds(values) {
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const pad = Math.max(1, (hi - lo) * 0.15);
  return [Math.floor(lo - pad), Math.ceil(hi + pad)];
}

export default function HorizonChart({ horizon, series, stepHours, title }) {
  const azDeg = horizon?.az_deg ?? [];
  const elDeg = horizon?.el_deg ?? [];
  if (azDeg.length < 2) return null;

  const pointsPerDay = Math.max(1, Math.round(24 / stepHours));
  const trackN = Math.min(series?.sun_el?.length ?? 0, TRACK_DAYS * pointsPerDay);

  const [elLo, elHi] = niceBounds([
    ...elDeg,
    ...(series?.sun_el?.slice(0, trackN) ?? []),
    ...(series?.earth_el?.slice(0, trackN) ?? []),
  ]);

  const px = (az) => X0 + ((X1 - X0) * az) / 360;
  const py = (el) => Y0 + ((Y1 - Y0) * (elHi - el)) / (elHi - elLo);

  const landPoints = azDeg.map((az, i) => `${px(az).toFixed(1)},${py(elDeg[i]).toFixed(1)}`);
  const landPath =
    `M${landPoints.join(" L")} ` +
    `L${px(azDeg[azDeg.length - 1]).toFixed(1)},${Y1} L${px(azDeg[0]).toFixed(1)},${Y1} Z`;
  const ridgePath = `M${landPoints.join(" L")}`;

  const levelY = py(0);
  const ticks = [];
  for (let v = Math.ceil(elLo / 2) * 2; v <= elHi; v += 2) ticks.push(v);

  const dots = (az, el, cls) =>
    (az ?? []).slice(0, trackN).map((a, i) => {
      const e = el[i];
      if (e < elLo) return null; // below the plotted range; the number is still in the table
      return <circle key={i} cx={px(a)} cy={py(e)} r={1.6} className={cls} />;
    });

  return (
    <figure className="horizon-fig">
      <div className="horizon-window">
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} role="img" aria-label={title}>
          <rect x="0" y="0" width={VB_W} height={VB_H} className="hz-sky" />
          {ticks.map((v) => (
            <g key={v}>
              <line x1={X0} x2={X1} y1={py(v)} y2={py(v)} className={v === 0 ? "hz-level" : "hz-grid"} />
              <text x={X0 - 8} y={py(v) + 4} textAnchor="end" className="hz-axis">
                {v > 0 ? `+${v}\u00b0` : v < 0 ? `\u2212${-v}\u00b0` : "0\u00b0"}
              </text>
            </g>
          ))}
          <path d={landPath} className="hz-land" />
          <path d={ridgePath} className="hz-ridge" />
          <g>{dots(series?.sun_az, series?.sun_el, "hz-sun-dot")}</g>
          <g>{dots(series?.earth_az, series?.earth_el, "hz-earth-dot")}</g>
          {[0, 90, 180, 270, 360].map((a) => (
            <text
              key={a}
              x={px(a)}
              y={Y1 + 24}
              textAnchor={a === 0 ? "start" : a === 360 ? "end" : "middle"}
              className="hz-axis"
            >
              {["N 0\u00b0", "E 90\u00b0", "S 180\u00b0", "W 270\u00b0", "N 360\u00b0"][a / 90]}
            </text>
          ))}
        </svg>
      </div>
      <figcaption>
        The horizon around the site, azimuth clockwise from north.{" "}
        <span className="hz-key hz-key-sun">Sun</span> and <span className="hz-key hz-key-earth">Earth</span>{" "}
        positions for the first {TRACK_DAYS} days are plotted against it; both are visible whenever
        the dot sits above the gray ground.
      </figcaption>
    </figure>
  );
}
