import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { getJSON, siteQuery } from "./api.js";
import SnapshotChip from "./SnapshotChip.jsx";

// One scene unit = this many real kilometers. Chosen so the Earth (radius 6371 km)
// renders at a comfortable size; the true Earth-Moon distance then falls out of the
// same scale rather than being chosen separately.
const KM_PER_UNIT = 3185.5;
const EARTH_R = 6371 / KM_PER_UNIT;
const MOON_R = 1737.4 / KM_PER_UNIT;
const COMPRESSED_DISTANCE = 9; // scene units, used only when "compressed" scale is selected
const SUN_MARKER_DISTANCE = 40; // the Sun marker's distance is stylised, not to scale

// Real photographic textures, served from this site (see frontend/public/textures/README.md
// for where to get them). If a file is missing, the sphere falls back to a solid color
// rather than failing, so the scene still works without them.
const EARTH_TEXTURE_URL = "/textures/earth.jpg";
const MOON_TEXTURE_URL = "/textures/moon.jpg";

const SPEEDS = [
  { label: "1 hour / s", hoursPerSec: 1 },
  { label: "6 hours / s", hoursPerSec: 6 },
  { label: "1 day / s", hoursPerSec: 24 },
  { label: "1 week / s", hoursPerSec: 24 * 7 },
];

function toApiTime(date) {
  return date.toISOString().slice(0, 19);
}

function nowClamped() {
  const n = new Date();
  const min = new Date("1960-01-01T00:00:00Z");
  const max = new Date("2050-12-31T00:00:00Z");
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

// Real-data readout shown live over the scene: Moon phase, Earth-Moon distance and the
// sub-Earth point (the spot on the Moon directly facing Earth, which wanders slowly due
// to libration). All derived from the same vectors used to draw the scene -- nothing here
// is a separate or approximate calculation.
function moonReadout(system) {
  const m2e = system.moon_from_earth_km.map((v) => -v); // Moon -> Earth
  const m2s = system.sun_from_moon_km; // Moon -> Sun
  const dot = m2e[0] * m2s[0] + m2e[1] * m2s[1] + m2e[2] * m2s[2];
  const na = Math.hypot(...m2e);
  const nb = Math.hypot(...m2s);
  const phaseAngle = Math.acos(Math.min(1, Math.max(-1, dot / (na * nb))));
  const illumPct = ((1 + Math.cos(phaseAngle)) / 2) * 100;

  // Sub-Earth point: rotate the Moon->Earth direction into the Moon's body-fixed frame
  // (moon_rotation is J2000 -> MOON_ME) and read off latitude/longitude.
  const R = system.moon_rotation;
  const bx = R[0][0] * m2e[0] + R[0][1] * m2e[1] + R[0][2] * m2e[2];
  const by = R[1][0] * m2e[0] + R[1][1] * m2e[1] + R[1][2] * m2e[2];
  const bz = R[2][0] * m2e[0] + R[2][1] * m2e[1] + R[2][2] * m2e[2];
  const r = Math.hypot(bx, by, bz);
  const lat = Math.asin(bz / r) * (180 / Math.PI);
  const lon = Math.atan2(by, bx) * (180 / Math.PI);

  return { illumPct, distanceKm: na, subEarthLat: lat, subEarthLon: lon };
}

// A point on the Moon's body-fixed sphere from lat/lon, in the same convention used
// throughout the backend (x = cos(lat)cos(lon), y = cos(lat)sin(lon), z = sin(lat)).
// Verified as an exact inverse of the sub-Earth-point calculation above.
function bodyFixedPoint(latDeg, lonDeg, radius) {
  const lat = THREE.MathUtils.degToRad(latDeg);
  const lon = THREE.MathUtils.degToRad(lonDeg);
  return new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)).multiplyScalar(
    radius,
  );
}

export default function OrbitScene({ site }) {
  const mountRef = useRef(null);
  const stateRef = useRef({}); // holds everything the animation loop needs, so effects don't re-run per frame

  const [time, setTime] = useState(() => nowClamped());
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);
  const [trueScale, setTrueScale] = useState(false);
  const [system, setSystem] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [siteStatus, setSiteStatus] = useState(null);

  // --- Three.js setup: runs once ---------------------------------------
  useEffect(() => {
    const mount = mountRef.current;
    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.05, 4000);
    camera.position.set(8, 5, 10);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 3;
    controls.maxDistance = 800;

    // Starfield: a cheap point cloud, purely decorative.
    const starGeo = new THREE.BufferGeometry();
    const starCount = 1500;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const r = 300 + Math.random() * 400;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPos[i * 3 + 2] = r * Math.cos(phi);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xb9bfc5, size: 0.6, sizeAttenuation: false }),
    );
    scene.add(stars);

    const sunLight = new THREE.DirectionalLight(0xffffff, 2.4);
    scene.add(sunLight);
    scene.add(sunLight.target);
    scene.add(new THREE.AmbientLight(0x1a1c1f, 1)); // faint fill so the night side isn't pure black

    // Textures are loaded asynchronously and swapped in when ready; a solid color shows
    // immediately and stays if the texture file is missing (checked, doesn't reject the
    // load -- it falls back cleanly via the error callback below).
    const loader = new THREE.TextureLoader();
    const earthMat = new THREE.MeshStandardMaterial({ color: 0x1f6a99, roughness: 0.85 });
    const moonMat = new THREE.MeshStandardMaterial({ color: 0xa3a9ae, roughness: 0.95 });
    loader.load(EARTH_TEXTURE_URL, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      earthMat.map = tex;
      earthMat.color.set(0xffffff);
      earthMat.needsUpdate = true;
    }, undefined, () => { /* keep the solid-color fallback */ });
    loader.load(MOON_TEXTURE_URL, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      moonMat.map = tex;
      moonMat.color.set(0xffffff);
      moonMat.needsUpdate = true;
    }, undefined, () => { /* keep the solid-color fallback */ });

    const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 48, 48), earthMat);
    scene.add(earth);

    const moon = new THREE.Mesh(new THREE.SphereGeometry(MOON_R, 40, 40), moonMat);
    scene.add(moon);

    // A faint equator ring on the Moon, purely a visual reference: the Moon's spin axis
    // is tilted only ~1.5 degrees, so its poles sit almost permanently near the day/night
    // line while the equator visibly cycles light and dark over about a month. Without
    // some reference it is easy to mistake that real effect for the picture "not updating".
    const equatorPts = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      equatorPts.push(new THREE.Vector3(Math.cos(a) * MOON_R * 1.002, Math.sin(a) * MOON_R * 1.002, 0));
    }
    const equator = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(equatorPts),
      new THREE.LineBasicMaterial({ color: 0x565c61, transparent: true, opacity: 0.5 }),
    );
    moon.add(equator);

    // The chosen landing site, marked on the Moon's surface. Parented to the moon mesh so
    // it automatically inherits the Moon's real orientation (including libration) --
    // its local position is the only thing this component ever needs to set.
    const siteMarker = new THREE.Group();
    const pin = new THREE.Mesh(
      new THREE.SphereGeometry(MOON_R * 0.045, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    const pinLine = new THREE.Mesh(
      new THREE.CylinderGeometry(MOON_R * 0.008, MOON_R * 0.008, MOON_R * 0.14, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    pinLine.position.y = MOON_R * 0.07;
    pin.position.y = MOON_R * 0.14;
    siteMarker.add(pinLine, pin);
    siteMarker.visible = false;
    moon.add(siteMarker);

    const sunMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xf0c24b }),
    );
    scene.add(sunMarker);

    let raf = null;
    let disposed = false;

    // Earth and Moon position/orientation are set directly from the fetched SPICE
    // vectors and rotation matrices (see the effect below) whenever the simulated time
    // changes -- there is no client-side motion approximation layered on top, so what
    // you see is always the real geometry for the displayed time, never a guess.
    function animate() {
      if (disposed) return;
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    }
    raf = requestAnimationFrame(animate);

    function onResize() {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    stateRef.current = {
      ...stateRef.current,
      scene, camera, renderer, controls, earth, moon, siteMarker, sunMarker, sunLight,
    };

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Fetch real geometry whenever the chosen time changes ------------
  // A request counter guards against a slow response arriving after a newer one
  // has already landed (possible during fast playback) and overwriting it.
  const requestIdRef = useRef(0);
  const fetchAt = useCallback(async (date) => {
    const id = ++requestIdRef.current;
    try {
      const data = await getJSON(`/api/system?time=${encodeURIComponent(toApiTime(date))}`, { timeoutMs: 15000 });
      if (id !== requestIdRef.current) return; // a newer request has since been made
      setSystem(data);
      setErrorMsg("");
    } catch (err) {
      if (id !== requestIdRef.current) return;
      setErrorMsg(err.message || "Could not load the scene for this time.");
    }
  }, []);

  useEffect(() => {
    fetchAt(time);
  }, [time, fetchAt]);

  // --- Apply fetched geometry to the scene ------------------------------
  useEffect(() => {
    if (!system) return;
    const st = stateRef.current;
    if (!st.moon) return;

    const moonKm = system.moon_from_earth_km;
    const distKm = Math.hypot(...moonKm);
    const dir = moonKm.map((v) => v / distKm);
    const distUnits = trueScale ? distKm / KM_PER_UNIT : COMPRESSED_DISTANCE;
    st.moon.position.set(dir[0] * distUnits, dir[1] * distUnits, dir[2] * distUnits);

    // Rotation matrices from the API are J2000 -> body-fixed; a mesh authored in
    // body-fixed axes needs the inverse (transpose, since these are orthonormal).
    const setFromRowsTransposed = (obj, rows) => {
      const m = new THREE.Matrix4();
      m.set(
        rows[0][0], rows[1][0], rows[2][0], 0,
        rows[0][1], rows[1][1], rows[2][1], 0,
        rows[0][2], rows[1][2], rows[2][2], 0,
        0, 0, 0, 1,
      );
      obj.quaternion.setFromRotationMatrix(m);
    };
    setFromRowsTransposed(st.moon, system.moon_rotation);
    setFromRowsTransposed(st.earth, system.earth_rotation);

    const sunKm = system.sun_from_earth_km;
    const sunDist = Math.hypot(...sunKm);
    const sunDir = sunKm.map((v) => v / sunDist);
    st.sunLight.position.set(sunDir[0] * 60, sunDir[1] * 60, sunDir[2] * 60);
    st.sunLight.target.position.set(0, 0, 0);
    st.sunMarker.position.set(
      sunDir[0] * SUN_MARKER_DISTANCE,
      sunDir[1] * SUN_MARKER_DISTANCE,
      sunDir[2] * SUN_MARKER_DISTANCE,
    );
  }, [system, trueScale]);

  // --- Place the landing-site marker (a child of the Moon mesh, so it automatically
  // inherits the Moon's real orientation without any extra math here) -----------------
  useEffect(() => {
    const st = stateRef.current;
    if (!st.siteMarker) return;
    if (!site) {
      st.siteMarker.visible = false;
      return;
    }
    const p = bodyFixedPoint(site.lat, site.lon, MOON_R);
    const outward = p.clone().normalize();
    // Rotate the marker's local "up" (the cylinder's default long axis) to point along
    // the outward surface normal -- both expressed in the Moon's own local space, since
    // siteMarker is a child of the moon mesh, so this needs no world-frame conversion.
    st.siteMarker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward);
    st.siteMarker.position.copy(p);
    st.siteMarker.visible = true;
  }, [site]);

  // --- Advance the simulated clock while playing ------------------------
  useEffect(() => {
    if (!playing) return;
    const hoursPerSec = SPEEDS[speedIdx].hoursPerSec;
    const id = setInterval(() => {
      setTime((t) => {
        const next = new Date(t.getTime() + hoursPerSec * 3600 * 1000 * 0.5); // advances every 500ms tick
        const max = new Date("2050-12-31T00:00:00Z");
        const min = new Date("1960-01-01T00:00:00Z");
        if (next > max) return min;
        if (next < min) return max;
        return next;
      });
    }, 500);
    return () => clearInterval(id);
  }, [playing, speedIdx]);

  // --- Live power/DTE status for the chosen site, at the current simulated time -------
  // Reuses /api/site (the same terrain-aware calculation the Planner tab uses) rather
  // than approximating locally, since only the backend knows the site's terrain horizon.
  // Throttled to once per simulated hour of change (not once per 500ms tick), since the
  // underlying hourly data cannot change faster than that anyway.
  const lastKeyRef = useRef("");
  useEffect(() => {
    if (!site) {
      setSiteStatus(null);
      return;
    }
    const dateStr = time.toISOString().slice(0, 10);
    const hour = time.getUTCHours();
    const key = `${site.lat.toFixed(4)},${site.lon.toFixed(4)},${dateStr},${hour}`;
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    let cancelled = false;
    (async () => {
      try {
        const path = siteQuery({
          lat: site.lat, lon: site.lon, start: dateStr, days: 1, step_hours: 1,
          sun_limb_deg: 0.27, observer_height_m: 2, include_series: true,
        });
        const data = await getJSON(path, { timeoutMs: 15000 });
        if (cancelled || key !== lastKeyRef.current) return;
        const i = Math.min(hour, data.series.sun_el.length - 1);
        setSiteStatus({
          sunUp: !!data.series.sun_up[i],
          sunEl: data.series.sun_el[i],
          earthUp: !!data.series.earth_up[i],
          earthEl: data.series.earth_el[i],
          terrain: data.site.terrain,
        });
      } catch {
        if (!cancelled) setSiteStatus(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [site, time]);

  const readout = system ? moonReadout(system) : null;

  return (
    <div className="orbit-fullscreen">
      <div className="orbit-canvas-full" ref={mountRef} />

      <div className="orbit-overlay orbit-overlay-tl">
        <input
          type="datetime-local"
          value={time.toISOString().slice(0, 16)}
          min="1960-01-01T00:00"
          max="2050-12-31T00:00"
          onChange={(e) => {
            if (e.target.value) setTime(new Date(e.target.value + ":00Z"));
          }}
        />
        <button type="button" className="btn" onClick={() => setPlaying((p) => !p)}>
          {playing ? "Pause" : "Play"}
        </button>
        <select value={speedIdx} onChange={(e) => setSpeedIdx(Number(e.target.value))} aria-label="Playback speed">
          {SPEEDS.map((s, i) => (
            <option key={s.label} value={i}>
              {s.label}
            </option>
          ))}
        </select>
        <button type="button" className="btn" onClick={() => setTime(nowClamped())}>
          Now
        </button>
        <div className="scale-toggle" role="group" aria-label="Distance scale">
          <button type="button" className={!trueScale ? "active" : ""} onClick={() => setTrueScale(false)}>
            Compressed
          </button>
          <button type="button" className={trueScale ? "active" : ""} onClick={() => setTrueScale(true)}>
            True scale
          </button>
        </div>
      </div>

      <div className="orbit-overlay orbit-overlay-tr">
        <h3>Right now, from real data</h3>
        {readout ? (
          <dl>
            <div>
              <dt>Moon phase</dt>
              <dd>{readout.illumPct.toFixed(0)}% illuminated</dd>
            </div>
            <div>
              <dt>Earth&ndash;Moon distance</dt>
              <dd>{Math.round(readout.distanceKm).toLocaleString()} km</dd>
            </div>
            <div>
              <dt>Sub-Earth point on the Moon</dt>
              <dd>
                {Math.abs(readout.subEarthLat).toFixed(1)}&deg;{readout.subEarthLat >= 0 ? "N" : "S"},{" "}
                {Math.abs(readout.subEarthLon).toFixed(1)}&deg;{readout.subEarthLon >= 0 ? "E" : "W"}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="note-line">Loading&hellip;</p>
        )}
        <p className="orbit-hint">
          &ldquo;Illuminated&rdquo; is how much of the Moon&rsquo;s Earth-facing side is
          lit right now (100% = full moon, 0% = new moon).
        </p>
        <p className="orbit-hint">
          The Moon&rsquo;s spin axis is tilted only ~1.5&deg;, so its poles sit almost
          permanently near the day/night line &mdash; watch the <b>equator</b> (the thin
          ring) to see real day and night sweep across it over about a month.
        </p>
      </div>

      {site && (
        <div className="orbit-overlay orbit-overlay-br">
          <h3>{site.name}</h3>
          {siteStatus ? (
            <>
              {!siteStatus.terrain && <p className="orbit-hint">No terrain data here; horizon assumed flat.</p>}
              <SnapshotChip
                kind="sun" up={siteStatus.sunUp} elevation={siteStatus.sunEl} label="Sun"
                upText="power available" downText="no direct sunlight"
              />
              <SnapshotChip
                kind="earth" up={siteStatus.earthUp} elevation={siteStatus.earthEl} label="Earth"
                upText="direct-to-Earth link possible" downText="no direct-to-Earth link"
              />
            </>
          ) : (
            <p className="note-line">Loading&hellip;</p>
          )}
        </div>
      )}

      {errorMsg && <p className="note-line error-line orbit-error">{errorMsg}</p>}
    </div>
  );
}
