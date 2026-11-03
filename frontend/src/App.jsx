import { Suspense, lazy, useEffect, useState } from "react";
import { API_URL, IS_LOCAL_API, getJSON } from "./api.js";
import SiteWorkspace from "./SiteWorkspace.jsx";
// Three.js is sizeable, so the orbit scene is loaded only when the browser is
// idle after the first paint, rather than blocking the initial page load.
const OrbitScene = lazy(() => import("./OrbitScene.jsx"));

const WAKE_HINT_MS = 2500; // show the "waking" message if the server has not answered by then
const RETRY_MS = 3000;
const GIVE_UP_MS = 120000; // stop retrying after two minutes

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

      <section className="sheet server-sheet" aria-labelledby="server-h">
        <div>
          <h2 id="server-h">Server</h2>
          <p className={`status ${server.phase}`} role="status">
            {statusText(server)}
          </p>
          <p className="caption">{API_URL.replace(/^https?:\/\//, "")}</p>
        </div>
      </section>

      <Suspense fallback={<div className="orbit-wrap orbit-loading" aria-hidden="true" />}>
        <OrbitScene />
      </Suspense>

      {presets && <SiteWorkspace presets={presets} />}
      {serverUp && !presets && !presetError && <p className="note-line">Loading the site list…</p>}
      {presetError && <p className="note-line error-line">The site list could not be loaded. Reload the page to try again.</p>}

      <footer>Build step 3 of 8: real-time Earth, Moon and Sun. Clicking the Moon to pick a site comes next.</footer>
    </main>
  );
}
