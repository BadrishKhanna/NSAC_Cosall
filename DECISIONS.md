# Decisions

## Scope: mission window planner
Given a lunar landing site, compute Sun/Earth geometry, power and comms, then
recommend landing windows and approximate transfer options. Tiers:
0. Required: Sun/Earth geometry, power, comms (must be fully correct first)
1. Landing window optimizer (scan dates, score by sun elevation, sunlight remaining, Earth visibility)
2. Transfer families: approximate delta-v and time of flight (patched conic)
3. Far-side relay recommendation
Fidelity statement: "feasible options with approximate delta-v and time of flight",
never "optimal". Validated against Apollo 11 and Chandrayaan-3.

## Data
SPICE kernels in backend/data/ (gitignored, downloaded from NAIF):
de440s.bsp, naif0012.tls, pck00011.tpc, moon_pa_de440_200625.bpc, moon_de440_220930.tf
Kernel coverage: 1849-2150 (positions), 1549-2650 (Moon orientation).
Supported user date range: 1960-2050 (documented in the UI).

## Approximations (current)
- Spherical Moon, no terrain masking
- Geometric positions, no light-time or aberration correction
- Moon-fixed frame: MOON_ME (mean Earth/polar axis)

## Validation log
- Apollo 11 (0.674 N, 23.473 E, 1969-07-20 20:17:40 UTC)
  computed Sun elevation <fill in> deg, Earth elevation <fill in> deg
  published Sun elevation <find source>, difference <fill in>
