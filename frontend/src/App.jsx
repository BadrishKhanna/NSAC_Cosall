import { useEffect, useState } from "react";
import { API_URL, IS_LOCAL_API, getJSON } from "./api.js";

const WAKE_HINT_MS = 2500; // show the "waking" message if the server has not answered by then
const RETRY_MS = 3000;
const GIVE_UP_MS = 120000; // stop retrying after two minutes

function formatCoords(lat, lon) {
  return `${Math.abs(lat).toFixed(3)}° ${lat < 0 ? "S" : "N"}, ${Math.abs(lon).toFixed(3)}° ${lon < 0 ? "W" : "E"}`;
}

// Asks the server whether it is up. Free hosting sleeps when idle, so a slow first answer
// is normal: keep retrying and tell the visitor what is happening.
function useServer() {
  const [server, setServer] = useState({ phase: "checking", health: null });

  useEffect(() => {
    let cancelled = false;
    const started = Date.now();
    const hint = setTimeout(
      () => setServer((s) => (s.phase === "checking" ? { ...s, phase: "waking" } : s)),
      IS_LOCAL_API ? 1e9 : WAKE_HINT_MS,
    );

    async function attempt() {
      if (cancelled) return;
      try {
        const health = await getJSON("/api/health", { timeoutMs: 10000 });
        if (cancelled) return;
        clearTimeout(hint);
        setServer({ phase: health.data_ready ? "ready" : "nodata", health });
      } catch {
        if (cancelled) return;
        if (IS_LOCAL_API || Date.now() - started > GIVE_UP_MS) {
          clearTimeout(hint);
          setServer({ phase: "offline", health: null });
        } else {
          setServer((s) => ({ ...s, phase: "waking" }));
          setTimeout(attempt, RETRY_MS);
        }
      }
    }

    attempt();
    return () => {
      cancelled = true;
      clearTimeout(hint);
    };
  }, []);

  return server;
}

function statusText(server) {
  switch (server.phase) {
    case "checking":
      return "Checking the server.";
    case "waking":
      return "Waking the server. Free hosting sleeps when idle, so the first visit can take up to a minute.";
    case "ready":
      return "Server ready. Ephemeris and terrain data are loaded.";
    case "nodata":
      return `The server is running but is missing data files: ${server.health.missing.join(", ")}. Check the build log on Render, or run python backend/download_data.py locally.`;
    default:
      return IS_LOCAL_API
        ? `Cannot reach the local server at ${API_URL}. Start it in a second terminal: cd backend, then uvicorn api:app --reload.`
        : `Cannot reach the server at ${API_URL}. Check that the service is live on Render, then reload this page.`;
  }
}

export default function App() {
  const server = useServer();
  const [presets, setPresets] = useState(null);
  const [presetError, setPresetError] = useState(false);
  const serverUp = server.phase === "ready" || server.phase === "nodata";

  useEffect(() => {
    if (!serverUp) return;
    getJSON("/api/presets")
      .then(setPresets)
      .catch(() => setPresetError(true));
  }, [serverUp]);

  return (
    <main className="page">
      <header>
        <h1>Cosall</h1>
        <p className="lede">
          Compare lunar south-pole landing sites and dates: how much sunlight, how long Earth is in view,
          and the terrain in between.
        </p>
      </header>

      <section className="sheet" aria-labelledby="server-h">
        <h2 id="server-h">Server</h2>
        <p className={`status ${server.phase}`} role="status">
          {statusText(server)}
        </p>
        <p className="caption">{API_URL.replace(/^https?:\/\//, "")}</p>
      </section>

      <section aria-labelledby="sites-h">
        <h2 id="sites-h">Sites to start from</h2>
        {presets ? (
          <ul className="sites">
            {presets.map((p) => (
              <li key={p.id}>
                <div>
                  <h3>{p.name}</h3>
                  <p className="caption">{p.note}</p>
                </div>
                <p className="coords">{formatCoords(p.lat, p.lon)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="caption">
            {presetError ? "The site list could not be loaded. Reload the page to try again." : "The site list appears when the server is ready."}
          </p>
        )}
      </section>

      <footer>Build step 1 of 8: connecting the app to the server. The results sheet comes next.</footer>
    </main>
  );
}
