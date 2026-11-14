# Decisions

## Challenge
Compare lunar south-pole landing sites and dates quickly: an intuitive tool for
mission planners, educators and the public, visualizing Sun and Earth positions
relative to the horizon to assess power generation potential and direct-to-Earth
communication windows. (Source: official challenge text, pasted by the team.)

## Scope
Tiers, built in order. Stopping after any tier still leaves a complete project.
0. Required: Sun/Earth elevation and azimuth over time for a site, terrain horizon
   mask, power and comms metrics (percent lit, longest darkness, Earth-visible
   percent, longest comms gap), horizon view and timeline.
1. Comparison (the inventive part): side-by-side sites, calendar heatmap of
   sunlight and Earth visibility, "best dates for this site".
2. Polish: 3D Moon globe (terminator, sub-Earth point, site pins, all from real
   SPICE data), presets (Apollo 11, Chandrayaan-3, polar sites), plain-language
   summaries for educators and the public.
Parked as future work (off-topic for the challenge text): transfer trajectories
and delta-v, far-side relay recommendation.
Fidelity statement: geometric Sun/Earth visibility from a spherical-Moon model
with LOLA terrain horizon masks. Not a full illumination, thermal or power simulation.

## Architecture: live API, precomputed terrain
- Backend: FastAPI + spiceypy computes Sun/Earth geometry for any date in the
  supported range on demand.
- Horizon masks are precomputed offline from LOLA per curated site (date-independent)
  and committed as small JSON.
- Frontend: static site (Vite + React), hosted separately. Default view and presets
  are cached as static JSON so the first screen does not depend on server wake-up.
- Range and step limits enforced per request. Kernels fetched by
  backend/download_kernels.py (to be written).
- Deploy early (around week 3), not at the end.
- Landing site input: click on a hillshaded polar map, or type lat/lon, or choose a preset.
  Horizon masks computed on demand and cached (was: curated precomputed list), if
  horizon_profile is fast enough on the real DEM (to be timed). Sites outside the
  terrain product (north of 80S) get geometry only, labelled "no terrain data".

## Data
SPICE kernels in backend/data/ (gitignored, downloaded from NAIF):
de440s.bsp, naif0012.tls, pck00011.tpc, moon_pa_de440_200625.bpc, moon_de440_220930.tf
Kernel coverage (confirmed with check_kernels.py): positions 1849-2150,
Moon orientation 1549-2650.
Supported user date range: 1960-2050 (documented in the UI).
Terrain: LOLA south-polar DEM, LDEM_80S_80MPP_ADJ.TIF (80 m/px, 80S to pole), from
NASA PGDA. Cloud-optimized GeoTIFF, south polar stereographic, heights in meters
above the 1737.4 km reference sphere. Also gitignored.
Citation: Barker et al. 2023, Planetary Science Journal 4, 183,
doi:10.3847/PSJ/acf3e1. Data DOI: 10.60903/gsfcpgda-lola-spole

## Approximations (current)
- Spherical Moon for site geometry; terrain enters only through the horizon mask
- Geometric positions, no light-time or aberration correction
- Sun treated as a point at its center. The ~0.5 deg solar disk is not yet handled,
  which matters at the pole where the Sun grazes the horizon
- Moon-fixed frame: MOON_ME (DE440). LOLA products use the DE421 MOON_ME.
  Difference not yet quantified (expected small)
- Hourly time steps are coarse near the pole; metrics will need finer sampling
- Terrain limited to sites south of 80S (edge of the LOLA 80S product)
- Terrain: LOLA south-polar DEM (Barker et al. 2023, PGDA), 80 m/px, heights above the 1737.4 km sphere
- LOLA products use the DE421 MOON_ME frame; our geometry uses the DE440 MOON_ME. Difference not yet quantified (expected small).
- Horizon mask: rays every 1 deg azimuth, sampled every 80 m out to 100 km on the 80 m LOLA DEM, bilinear interpolation, exact spherical curvature, observer at surface (height 0). Terrain beyond 100 km ignored.
- Projected meters treated as true meters, straight rays in the projected plane (scale error not yet checked against the DEM's CRS)
- Sun and Earth treated as points against the horizon (disk sizes ignored)
- Illumination scan: 1 km grid, terrain within 30 km, 2 deg azimuth steps, hourly for one year (2027). Coarser than the per-site demo. Sun-limb offset is a parameter (default 0, point Sun).

## Validation log
- Apollo 11 (0.674 N, 23.473 E, 1969-07-20 20:17:40 UTC; coordinates not yet
  verified against a primary source)
  computed Sun elevation 10.70 deg, Earth elevation 59.22 deg
  published Sun elevation <find source>, difference <fill in>
- South-pole baseline (-89.5, 0.0, 2027-01-01 for 365 days, hourly, no terrain,
  Sun center only): Sun above horizon 52.2 %, Earth 49.5 %, both 25.7 %.
  Sun elevation range -2.02 to 2.02 deg, Earth -6.60 to 7.07 deg.
  Consistent with axial tilt (~1.5 deg) and libration (~6.7 deg) plus the 0.5 deg
  site offset. Sun 52.2 % is probably the 365-day window not being a whole number
  of Sun cycles (~346.6 d expected). Pending: rerun with 1040 days, expect ~50 %.
- Planned: Chandrayaan-3 (about 69.4 S, 2023-08-23), sunrise/sunset timing.
  Verify site coordinates and landing time from a primary source first. The site is
  outside the 80S terrain product, so this is a geometry-only check.
- horizon_profile on synthetic terrain (independent spherical construction): mesa bearings recovered within 0.5 deg at four sites, elevation angles within ~0.3 deg of analytic values. Not yet compared against published illumination maps.
- Site: lat -89.534, lon -135.000
Terrain horizon elevation: min -3.91, max 20.29, mean 6.26 deg
Sun   above flat horizon  52.1 %   above terrain horizon  33.4 %
Earth above flat horizon  45.6 %   above terrain horizon  64.8 %
Both above terrain horizon:  23.6 %
Longest Sun-dark stretch:     21.4 days
Longest Earth-gap stretch:    10.1 days , Not very good.
- - Zoom scan at the best cell (200 m grid, 4 km box, 2027, 80 m DEM, terrain within 30 km):
  Sun center, ground level:        72.4 % at x -10.2, y -11.6 km (lat -89.491, lon -138.67)
  + Sun upper edge (0.27 deg):     77.2 %
  + observer height 2 m:           87.9 %
  Same top cell in all three runs. Published average illumination for persistently
  lit polar regions: 77-88 % (20-year hourly simulations, different DEM, assumptions
  not checked). Verdict: consistent under stated assumptions; absolute percentages
  depend on Sun-disk and height assumptions by ~15 points, so the tool exposes both.
- Best cell is ~1.8 km from the published 89.44 S, 218.2 E point.

## Open questions
- Event date and submission deadline
- This year's official judging criteria (the criteria pasted so far were labelled 2014)
- Curated list of polar sites for terrain masks
- Frontend details (charting library, globe approach)