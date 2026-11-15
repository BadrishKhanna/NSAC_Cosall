// A one-row-per-body strip showing, for each bin of the requested period, the fraction
// of that bin the Sun (or Earth) was above the terrain. Auto-bins so a long span (e.g.
// three years) still renders as a legible number of columns instead of thousands of
// sub-pixel-wide days; a single year still bins to one column per day as before.

const MAX_COLUMNS = 180;

function binnedMeans(mask, pointsPerDay, totalDays) {
  if (!mask?.length || !totalDays) return { values: [], binDays: 1 };
  const binDays = Math.max(1, Math.ceil(totalDays / MAX_COLUMNS));
  const pointsPerBin = pointsPerDay * binDays;
  const bins = Math.ceil(mask.length / pointsPerBin);
  const out = new Array(bins);
  for (let b = 0; b < bins; b++) {
    const start = b * pointsPerBin;
    const end = Math.min(start + pointsPerBin, mask.length);
    let sum = 0;
    for (let i = start; i < end; i++) sum += mask[i];
    out[b] = sum / (end - start);
  }
  return { values: out, binDays };
}

function Row({ label, values, cls }) {
  return (
    <div className="ribbon-row">
      <span className="ribbon-label">{label}</span>
      <div className="ribbon-track" role="img" aria-label={`${label}: share of each period above the horizon`}>
        {values.map((v, i) => (
          <span key={i} className={cls} style={{ opacity: 0.12 + 0.88 * v }} />
        ))}
      </div>
    </div>
  );
}

export default function VisibilityRibbon({ series, stepHours, days }) {
  const pointsPerDay = Math.max(1, Math.round(24 / stepHours));
  const sun = binnedMeans(series?.sun_up, pointsPerDay, days);
  const earth = binnedMeans(series?.earth_up, pointsPerDay, days);
  if (!sun.values.length) return null;

  return (
    <div className="ribbon">
      <Row label="Sun" values={sun.values} cls="ribbon-cell ribbon-sun" />
      <Row label="Earth" values={earth.values} cls="ribbon-cell ribbon-earth" />
      <p className="ribbon-cap">
        {sun.binDays === 1
          ? `Each column is one day of the ${days}-day period; darker means more of that day was above the terrain horizon.`
          : `Each column is ${sun.binDays} days of the ${days}-day period; darker means more of that span was above the terrain horizon.`}
      </p>
    </div>
  );
}
