export default function SnapshotChip({ kind, up, elevation, label, upText, downText }) {
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
