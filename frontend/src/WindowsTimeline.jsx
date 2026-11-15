// Shows how landing-window quality changes over the whole scan range, as three lines
// (Sun, Earth, Both visible), with the recommended windows marked as numbered peaks on
// the "Both" line -- so the picks are visibly justified by the curve, not a black box.

const VB_W = 1000;
const VB_H = 260;
const PAD_L = 40;
const PAD_R = 16;
const PAD_T = 20;
const PAD_B = 34;
const X0 = PAD_L;
const X1 = VB_W - PAD_R;
const Y0 = PAD_T;
const Y1 = VB_H - PAD_B;

function parseYMD(s) {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export default function WindowsTimeline({ curve, windows, years }) {
  const dates = curve?.dates ?? [];
  if (dates.length < 2) return null;

  const t0 = parseYMD(dates[0]);
  const t1 = parseYMD(dates[dates.length - 1]);
  const px = (dateStr) => X0 + ((X1 - X0) * (parseYMD(dateStr) - t0)) / (t1 - t0);
  const py = (pct) => Y0 + ((Y1 - Y0) * (100 - pct)) / 100;

  const linePath = (values) =>
    "M" + values.map((v, i) => `${px(dates[i]).toFixed(1)},${py(v).toFixed(1)}`).join(" L");

  // Year gridlines, at each 1 Jan the curve's dates cross.
  const yearLines = [];
  let lastYear = null;
  dates.forEach((d, i) => {
    const y = d.slice(0, 4);
    if (y !== lastYear) {
      yearLines.push({ x: px(d), label: y });
      lastYear = y;
    }
  });

  const bothPath = linePath(curve.both_pct);
  const sunPath = linePath(curve.sun_lit_pct);
  const earthPath = linePath(curve.earth_visible_pct);

  return (
    <figure className="wt-fig">
      <div className="wt-window">
        <svg viewBox={`0 0 ${VB_W} ${VB_H}`} role="img" aria-label="Landing-window quality over the scan range">
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line x1={X0} x2={X1} y1={py(v)} y2={py(v)} className="wt-grid" />
              <text x={X0 - 6} y={py(v) + 3} textAnchor="end" className="wt-axis">
                {v}%
              </text>
            </g>
          ))}
          {yearLines.map((yl) => (
            <g key={yl.label}>
              <line x1={yl.x} x2={yl.x} y1={Y0} y2={Y1} className="wt-yearline" />
              <text x={yl.x + 4} y={Y1 + 16} className="wt-axis">
                {yl.label}
              </text>
            </g>
          ))}
          <path d={sunPath} className="wt-line wt-line-sun" />
          <path d={earthPath} className="wt-line wt-line-earth" />
          <path d={bothPath} className="wt-line wt-line-both" />
          {windows.map((w, i) => {
            const x = px(w.landing_date);
            const y = py(w.both_pct);
            return (
              <g key={w.landing_date}>
                <line x1={x} x2={x} y1={y} y2={Y1} className="wt-pickline" />
                <circle cx={x} cy={y} r="7" className="wt-pickdot" />
                <text x={x} y={y - 11} textAnchor="middle" className="wt-picknum">
                  {i + 1}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption>
        <span className="wt-key wt-key-sun">Sun</span>, <span className="wt-key wt-key-earth">Earth</span> and{" "}
        <span className="wt-key wt-key-both">both</span> visible, as a share of each candidate landing
        date&rsquo;s first evaluation window, across all {years} scanned years. Numbered markers are the
        recommended windows, listed below.
      </figcaption>
    </figure>
  );
}
