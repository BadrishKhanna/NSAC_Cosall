// A one-row-per-body strip showing, for each day of the requested period, the fraction
// of that day the Sun (or Earth) was above the terrain. A small preview of the full
// calendar heatmap planned for a later step, built from the same sun_up/earth_up arrays.

function dailyMeans(mask, pointsPerDay) {
  if (!mask?.length) return [];
  const days = Math.floor(mask.length / pointsPerDay);
  const out = new Array(days);
  for (let d = 0; d < days; d++) {
    let sum = 0;
    for (let i = 0; i < pointsPerDay; i++) sum += mask[d * pointsPerDay + i];
    out[d] = sum / pointsPerDay;
  }
  return out;
}

function Row({ label, values, cls }) {
  return (
    <div className="ribbon-row">
      <span className="ribbon-label">{label}</span>
      <div className="ribbon-track" role="img" aria-label={`${label}: daily share of the period above the horizon`}>
        {values.map((v, i) => (
          <span key={i} className={cls} style={{ opacity: 0.12 + 0.88 * v }} />
        ))}
      </div>
    </div>
  );
}

export default function YearRibbon({ series, stepHours, days }) {
  const pointsPerDay = Math.max(1, Math.round(24 / stepHours));
  const sunDaily = dailyMeans(series?.sun_up, pointsPerDay);
  const earthDaily = dailyMeans(series?.earth_up, pointsPerDay);
  if (!sunDaily.length) return null;

  return (
    <div className="ribbon">
      <Row label="Sun" values={sunDaily} cls="ribbon-cell ribbon-sun" />
      <Row label="Earth" values={earthDaily} cls="ribbon-cell ribbon-earth" />
      <p className="ribbon-cap">
        Each column is one day of the {days}-day period; darker means more of that day was above
        the terrain horizon. A full calendar view with month labels is planned next.
      </p>
    </div>
  );
}
