# STATE.md

## Done
- Repo, environments, and Git workflow set up (backend `.venv`, frontend
  `npm`); kernels downloaded and verified.
- Geometry engine: `lunar_geometry.py` (vectorized Sun/Earth elevation and
  azimuth, any site/time), `horizon.py` (LOLA-based terrain horizon profiles),
  `metrics.py` (power/comms metrics, landing-window scan).
- Backend API (`api.py`) with `/api/health`, `/api/presets`, `/api/system`,
  `/api/site`, `/api/windows`, deployed on Render (`cosall-api`).
- Frontend (Vite + React) with four tabs — Home, Orbit view, Site planner,
  Launch planner — deployed on Render (`cosall`), hash-routed, real Earth/Moon
  textures, shared site-selection state across tabs.
- Apollo 11 validation (four-event comparison) and a south-pole illumination
  scan validated against published figures.
- Kernel-download hardening and startup self-test shipped and live, after
  diagnosing and fixing a real production incident (truncated leap-seconds
  kernel).
- Launch date suggester: multi-year landing-window scan with a graphical
  Sun/Earth/Both timeline, launch-site and transfer-time selection, 3-year
  mission outlook.

## Next
1. Multi-site compare mode (side-by-side, reusing `/api/site`).
2. Dedicated validation/"how we know it's right" page (surface the
   Validation log above in-app).
3. Calendar heatmap with month labels; sunrise/sunset list.
4. Stretch: DSN ground-station passes, power/battery estimator, eclipse
   events, share/export.
5. Documentation pass: begins 20 days before the submission deadline (per
   plan) — README, architecture doc, demo video, project page.

## Open questions
- Confirm this year's official judging criteria and exact submission deadline.
- Curated list of additional polar candidate sites.