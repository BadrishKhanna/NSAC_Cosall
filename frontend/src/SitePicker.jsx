export const CUSTOM = "__custom__";

export default function SitePicker({ presets, presetId, customLat, customLon, onPresetId, onCustomLat, onCustomLon }) {
  return (
    <>
      <label className="field">
        <span>Site</span>
        <select value={presetId} onChange={(e) => onPresetId(e.target.value)}>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value={CUSTOM}>Custom coordinates&hellip;</option>
        </select>
      </label>

      {presetId === CUSTOM && (
        <>
          <label className="field field-narrow">
            <span>Latitude</span>
            <input
              type="number"
              step="0.001"
              min="-90"
              max="90"
              value={customLat}
              onChange={(e) => onCustomLat(e.target.value)}
            />
          </label>
          <label className="field field-narrow">
            <span>Longitude</span>
            <input
              type="number"
              step="0.001"
              min="-360"
              max="360"
              value={customLon}
              onChange={(e) => onCustomLon(e.target.value)}
            />
          </label>
        </>
      )}
    </>
  );
}
