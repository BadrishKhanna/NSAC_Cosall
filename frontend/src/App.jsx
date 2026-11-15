import { Suspense, lazy, useEffect, useState } from "react";
import { API_URL, IS_LOCAL_API, getJSON } from "./api.js";
import HomeTab from "./HomeTab.jsx";
import SiteWorkspace from "./SiteWorkspace.jsx";
// Three.js is sizeable, so the orbit scene is loaded only when the tab is opened,
// rather than blocking the initial page load.
const OrbitScene = lazy(() => import("./OrbitScene.jsx"));

const WAKE_HINT_MS = 2500; // show the "waking" message if the server has not answered by then
const RETRY_MS = 3000;
const GIVE_UP_MS = 120000; // stop retrying after two minutes

const TABS = ["home", "orbit", "planner"];

// Reads the current tab from the URL hash (#orbit, #planner), so each tab has its own
// shareable, bookmarkable, reload-safe link, with no server-side routing configuration
// needed (the hash never reaches the server).
function useHashTab() {
  const read = () => {
    const h = window.location.hash.replace("#", "");
    return TABS.includes(h) ? h : "home";
  };
  const [tab, setTab] = useState(read);
  useEffect(() => {
    const onHash = () => setTab(read());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const go = (id) => {
    window.location.hash = id;
  };
  return [tab, go];
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
    case "nodata":
      return `The server is running but is missing data files: ${server.health.missing.join(", ")}. Check the build log on Render, or run python backend/download_data.py locally.`;
    default:
      return IS_LOCAL_API
        ? `Cannot reach the local server at ${API_URL}. Start it in a second terminal: cd backend, then uvicorn api:app --reload.`
        : `Cannot reach the server at ${API_URL}. Check that the service is live on Render, then reload this page.`;
  }
}

export default function App() {
  const [tab, go] = useHashTab();
  const server = useServer();
  const [presets, setPresets] = useState(null);
  const [presetError, setPresetError] = useState(false);
  const serverUp = server.phase === "ready" || server.phase === "nodata";

  // The site picker's raw selection lives here (not inside SiteWorkspace) so it survives
  // switching tabs, and the derived site (lat/lon/name) is shared with the Orbit tab so
  // it can mark the chosen site on the Moon.
  const [siteSelection, setSiteSelection] = useState({ presetId: "", customLat: "-89.49", customLon: "-138.67" });
  const [selectedSite, setSelectedSite] = useState(null);

  useEffect(() => {
    if (!serverUp) return;
    getJSON("/api/presets")
      .then(setPresets)
      .catch(() => setPresetError(true));
  }, [serverUp]);

  // Give the Orbit tab a sensible default (the first preset) even if the Planner tab
  // has never been opened yet, so a visitor who goes straight to Orbit still sees a
  // marked site rather than nothing.
  useEffect(() => {
    if (presets && !selectedSite) {
      const p = presets[0];
      if (p) setSelectedSite({ lat: p.lat, lon: p.lon, name: p.name });
    }
  }, [presets, selectedSite]);

  return (
    <div className={`app app-${tab}`}>
      <nav className="tabbar" aria-label="Sections">
        <button type="button" className={tab === "home" ? "active" : ""} onClick={() => go("home")}>
          Cosall
        </button>
        <button type="button" className={tab === "orbit" ? "active" : ""} onClick={() => go("orbit")}>
          Orbit view
        </button>
        <button type="button" className={tab === "planner" ? "active" : ""} onClick={() => go("planner")}>
          Site planner
        </button>
      </nav>

      {server.phase !== "ready" && (
        <p className={`status-banner status ${server.phase}`} role="status">
          {statusText(server)}
        </p>
      )}

      {tab === "home" && <HomeTab go={go} />}

      {tab === "orbit" && (
        <Suspense fallback={<div className="orbit-fullscreen orbit-loading" aria-hidden="true" />}>
          <OrbitScene site={selectedSite} />
        </Suspense>
      )}

      {tab === "planner" && (
        <main className="page planner-page">
          {presets && (
            <SiteWorkspace
              presets={presets}
              selection={siteSelection}
              onSelectionChange={setSiteSelection}
              onSiteChange={setSelectedSite}
            />
          )}
          {serverUp && !presets && !presetError && <p className="note-line">Loading the site list&hellip;</p>}
          {presetError && (
            <p className="note-line error-line">The site list could not be loaded. Reload the page to try again.</p>
          )}
        </main>
      )}
    </div>
  );
}
