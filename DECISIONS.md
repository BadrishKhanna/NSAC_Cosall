# DECISIONS.md

## Challenge
Compare lunar south-pole landing sites and dates quickly: an intuitive tool for
mission planners, educators and the public, visualizing Sun and Earth positions
relative to the horizon to assess power generation potential and direct-to-Earth
communication windows. (Source: official challenge text, pasted by the team.)

## Project
Name: Cosall. Submission date: 2026-11-15 (verify against the official event page).
Feature freeze: 2026-11-08. Documentation pass begins 20 days before submission.

## Live
- Site: https://cosall.onrender.com
- API:  https://cosall-api.onrender.com

## Scope / build steps (status)
0. Required (DONE): Sun/Earth elevation and azimuth over time for a site, terrain
   horizon mask, power and comms metrics (percent lit, longest darkness,
   Earth-visible percent, longest comms gap), horizon view, timeline, per-date
   Sun/Earth snapshot.
1. Comparison (Done): the landing-window scan and timeline (Launch planner tab)
   covers date comparison for one site. Side-by-side comparison of multiple sites
   is built.
2. Polish (DONE): 3D Moon/Earth/Sun orbit scene with real textures, site marker,
   equator reference ring, live phase/distance/sub-Earth-point readout; two
   presets (Apollo 11, Shackleton ridge); plain-language summaries throughout.
3. Launch date suggester (DONE, pulled forward from the original later-step plan):
   multi-year landing-window scan, graphical timeline, launch-site and
   transfer-time selection, 3-year mission outlook.
Not yet built: a dedicated validation/"how we know it's
right" page, calendar heatmap with month labels, sunrise/sunset list, ground
station (DSN) passes, power/battery estimator, eclipse events, share/export.
Fidelity statement: geometric Sun/Earth visibility from a spherical-Moon model
with LOLA terrain horizon masks. Not a full illumination, thermal or power
simulation.

## Architecture
- Backend: FastAPI + spiceypy (Python), deployed as a Render web service
  (`cosall-api`). Computes Sun/Earth/Moon geometry and terrain-aware metrics on
  demand; horizon profiles are cached per site in-process (`lru_cache`).
- Frontend: Vite + React static site, deployed as a separate Render static
  service (`cosall`). Four tabs, hash-routed (`#home`, `#orbit`, `#planner`,
  `#launch`), so each is a shareable/bookmarkable link with no server routing
  config needed.
- Both services defined in one `render.yaml` (Blueprint). The API's
  `startCommand` runs `kernels_self_test()` before `uvicorn` starts, so a
  corrupted kernel download fails the deploy loudly instead of serving broken
  500s (see Known issues below for why this was added).
- Kernels and the terrain DEM are downloaded fresh on every Render deploy
  (`backend/download_data.py`), since Render's disk is ephemeral and not
  committed to Git (`.gitignore`).

## Frontend structure
- `App.jsx` — hash-based tab router, server-health polling (handles Render
  free-tier cold starts), shared site-selection state lifted here so it
  persists across tab switches and is visible to the Orbit tab.
- `HomeTab.jsx` — project pitch, nav cards into the other three tabs, data
  sources and fidelity statement.
- `SiteWorkspace.jsx` (Site planner tab) — site/date picker, horizon panorama,
  plain-language summary, metrics table, assumptions panel with sensitivity
  bars, per-date Sun/Earth snapshot chips, year-visibility ribbon.
- `OrbitScene.jsx` (Orbit view tab) — full-screen Three.js scene: real Earth
  and Moon textures (Solar System Scope, CC BY 4.0), Sun direction and lighting
  from live SPICE data, time scrubber with play/speed/"Now", true-scale vs
  compressed distance toggle, equator reference ring, selected-site marker on
  the Moon (inherits real libration), live Moon-phase/distance/sub-Earth-point
  readout, live per-site power/DTE status panel.
- `LaunchPlanner.jsx` (Launch planner tab) — site picker, Earth launch-site
  dropdown (6 real sites) with an inclination note, transfer-time selector
  (direct / low-energy / custom), 5-year landing-window scan, results timeline,
  window cards with a derived launch date, 3-year mission outlook for a
  selected window.
- Shared components: `SitePicker.jsx`, `SnapshotChip.jsx`, `HorizonChart.jsx`,
  `VisibilityRibbon.jsx` (auto-binning visibility strip, any date range),
  `WindowsTimeline.jsx` (Sun/Earth/Both curves with numbered picks), `api.js`
  (fetch helpers, query builders).
- 'CompareSites.jsx' (Addition to site planner) - Site comparison feature is added to 
  the site planner tab.

## Backend API
- `GET /api/health` — always 200 while the server is up; `data_ready` reports
  whether kernel/terrain files are present (file existence only, not validity
  — see `kernels_self_test()` for the validity check).
- `GET /api/presets` — the two named sites.
- `GET /api/system?time=` — Earth/Moon/Sun vectors (J2000) and body-fixed
  rotation matrices (MOON_ME, IAU_EARTH) for one instant; powers the orbit
  scene.
- `GET /api/site?...` — metrics, horizon profile and (optionally) full
  Sun/Earth series for one site over a date range; powers the Site planner and
  the per-site live status in the Orbit tab.
- `GET /api/windows?...` — scans candidate landing dates over N years, returns
  the best `per_year` per year plus the full day-by-day quality curve; powers
  the Launch planner.
- Limits: date range 1960-01-01 to 2050-12-31; at most 20,000 time-steps per
  `/api/site` or `/api/windows` request; terrain only south of 80°S (sites
  north of that get a flat horizon, flagged `terrain: false`).

## Look (approved 2026-09-21, look board step 0)
- Surfaces: dark "scene" (Earth, Moon, Sun, orbit view) plus a light "sheet" for
  results. Sun/Earth charts sit in black "sky windows".
- Fonts: Newsreader (names, plain-language text), Archivo with tabular figures
  (controls, data).
- Color: Highland #F2F3F1 / dark #1E1E1C; Ink #14171A / #E9E7E2; Sky #000000;
  Basalt #23262A, ridge line #A3A9AE; Sunlight #9A6700 on sheets, #F0C24B on
  sky; Earth contact #1F6A99 / #7DB7DA; Both #3F7D5C / #74B996; Risk #A8452B /
  #E0866A. Hue is used only for data; buttons use ink.
- Avoid: gradients, glows, glass panels, KPI-card grids, all-caps labels.

## Data
SPICE kernels in `backend/data/` (gitignored, downloaded by
`backend/download_data.py` from NAIF):
de440s.bsp, naif0012.tls, pck00011.tpc, moon_pa_de440_200625.bpc,
moon_de440_220930.tf.
Kernel coverage (confirmed with `check_kernels.py`): positions 1849–2150, Moon
orientation 1549–2650.
Supported user date range: 1960–2050 (documented in the UI).
Terrain: LOLA south-polar DEM, `LDEM_80S_80MPP_ADJ.TIF` (80 m/px, 80°S to
pole), NASA PGDA. Cloud-optimized GeoTIFF, south polar stereographic, heights
in meters above the 1737.4 km reference sphere.
Earth/Moon textures: Solar System Scope (solarsystemscope.com/textures), based
on NASA imagery, CC BY 4.0 — user must download `earth.jpg`/`moon.jpg` manually
into `frontend/public/textures/` (not auto-fetched).

## Approximations (current)
- Spherical Moon for site geometry; terrain enters only through the horizon
  mask.
- Geometric positions, no light-time or aberration correction.
- Sun disk handled via a limb-offset parameter (default 0.27°, upper edge).
  Earth treated as a point at its center (`earth_limb_deg` parameter
  available, default 0).
- Moon-fixed frame: MOON_ME (DE440). LOLA products use the DE421 MOON_ME;
  difference not quantified (expected small).
- Observer height default 2 m (assumption, adjustable in the UI).
- Hourly time steps for single-site views; 3-hour steps for the multi-year
  landing-window scan (keeps requests under the 20,000-point budget).
- Terrain limited to sites south of 80°S (edge of the LOLA 80°S product).
- Horizon mask: rays every 1° azimuth, sampled every 80 m out to 100 km on the
  80 m LOLA DEM, bilinear interpolation, exact spherical curvature.
- Launch-date suggester: transit time is a user-selected assumption (direct
  ~4.3 days, from Apollo 11's actual transit; low-energy ~40.1 days, from
  Chandrayaan-3's actual transit; or custom), not a computed trajectory.
  Earth launch-site choice only shows a qualitative minimum-inclination note
  (min inclination ≈ launch latitude for direct ascent); no translunar
  injection geometry is modeled.
- Landing-window score = `both_pct − 2×longest_dark_days −
  2×longest_comms_gap_days`, a stated, adjustable heuristic for ranking
  candidates for further inspection, not a mission-design optimum.

## Validation log
- Apollo 11 four-event comparison (ALSJ table, Scotti/Fjeld results, nominal
  site 0.6875°N, 23.4333°E; landing, EVA start, EVA end, liftoff): Sun altitude
  differs 0.01–0.06°, Sun azimuth ≤0.02°, Earth azimuth ≤0.03°. Earth altitude
  low by a steady 0.16–0.18° across all four events (source states its own
  independent calculations differ by up to 0.5°; a parallax check — Earth
  altitude computed from the Moon's center vs. from the site — is consistent
  with this being a center-vs-site convention difference, not an error).
- South-pole baseline (−89.5°, 0.0°, 2027, 365 days hourly, no terrain, Sun
  center only): Sun above horizon 52.2%, Earth 49.5%, both 25.7%. Sun
  elevation range −2.02° to 2.02°, Earth −6.60° to 7.07° — consistent with
  axial tilt (~1.5°) and libration (~6.7°).
- Zoom scan at the best cell near Shackleton (200 m grid, 4 km box, 2027, 80 m
  DEM, terrain within 30 km): Sun center/ground level 72.4% → +Sun upper edge
  77.2% → +2 m observer height 87.9%. Consistent with published persistently-
  illuminated-region averages (77–88%, independent 20-year simulations,
  different DEM/assumptions). Best cell ~1.8 km from a published 89.44°S,
  218.2°E reference point.
- `horizon_profile` on synthetic terrain (independent spherical construction):
  mesa bearings recovered within 0.5° at four sites, elevation angles within
  ~0.3° of analytic values.
- `azel_from_vectors` matches an independent rotation-matrix implementation to
  ~1e-13° on random sites and bodies (vectorization regression check).
- Moon-phase illuminated-fraction formula verified against three known
  reference configurations (new moon → 0%, full moon → 100%, quarter → 50%,
  all exact).
- Lat/lon ↔ body-fixed xyz conversion (used for the sub-Earth point and the
  landing-site marker) verified as an exact inverse pair across six test
  sites (round-trip error ~1e-12°).
- Site-marker rotation math (`setFromUnitVectors`) verified numerically
  against four target surface normals, exact to floating-point precision.
- `landing_windows()` scan algorithm verified against a synthetic scenario
  with hand-engineered, known-correct peaks at specific days in each of 5
  years: all 10 picks matched exactly. Separate test confirmed the minimum-
  separation rule correctly rejects a nearby second-best peak in favor of a
  farther, genuinely distinct one.
- `/api/windows` and `/api/site` (days=1, step_hours=1 pattern used by the
  Orbit tab's live site-status panel) tested end-to-end via FastAPI
  `TestClient` against stubbed SPICE calls: correct response shapes,
  chronological ordering, and all documented error cases (bad date, out of
  range, too many points, site too near the pole).
- Apollo 11 and Chandrayaan-3 transit times (launch date to landing date) used
  in the launch-date suggester's default assumptions were verified via web
  search against primary/reliable mission-timeline sources: Apollo 11 ≈ 4.3
  days (launch 1969-07-16 13:32 UTC, landing 1969-07-20 20:17:40 UTC);
  Chandrayaan-3 ≈ 40.1 days (launch 2023-07-14 09:05 UTC, landing
  2023-08-23 12:33 UTC).
- Earth launch-site coordinates (Kennedy, Kourou, Sriharikota, Tanegashima)
  verified via web search; Baikonur and Vandenberg used from established
  general knowledge.

## Known issues / fixes already applied
- Render wipes disk on every deploy, so kernels are re-downloaded on every
  push. A past deploy's `naif0012.tls` download was silently truncated (byte
  count passed the old size-only check but the file was incomplete),
  causing `SpiceNOLEAPSECONDS` errors on `/api/site` and `/api/system` while
  `/api/health` still reported "ok" (it only checks file existence). Fixed by
  hardening `download_data.py` (exact Content-Length match, not just a size
  floor; file-signature check — `KPL/` for text kernels, `DAF/` for binary
  kernels) and adding `kernels_self_test()`, run from `render.yaml`'s
  `startCommand` before `uvicorn` starts, so a bad kernel now fails the
  deploy loudly instead of serving broken responses.
- A recurring bug class: writing a Unicode escape (`\u00b0`, `\u2026`)
  directly in raw JSX text (outside a `{}` expression) renders as a literal
  backslash sequence instead of the character. Hit three times across
  different components; fixed each time; current files are swept clean
  (checked via `grep -P '>[^<{]*\\\\u[0-9a-fA-F]{4}[^}]*<'` across all
  `.jsx` files).
- Vite's production CSS minifier can emit newer media-query range syntax;
  `vite.config.js` pins `cssTarget` to an older baseline so this never causes
  a compatibility surprise.

## Open questions
- Confirm this year's official judging criteria and exact submission deadline
  against the live Space Apps event page (the only criteria seen so far were
  explicitly labelled 2014).
- Curated list of additional polar candidate sites beyond the two current
  presets.