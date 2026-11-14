# Textures for the orbit scene

The 3D scene looks for two image files here:

- `earth.jpg`
- `moon.jpg`

If they are missing, the scene still works and falls back to a plain colored
sphere for each body (this is intentional -- see `OrbitScene.jsx`).

## Where to get them

Go to https://www.solarsystemscope.com/textures/ and download:

- **Earth**: "2k_earth_daymap.jpg" -- save it here as `earth.jpg`
- **Moon**: "2k_moon.jpg" -- save it here as `moon.jpg`

These are real NASA-derived imagery (Blue Marble for Earth, LRO/LOLA-derived
for the Moon), distributed by Solar System Scope under a Creative Commons
Attribution 4.0 license. That license permits any use, including this one,
provided credit is given -- which is why the credit line below exists and
should stay in the project's README and About page.

The 2k versions are a few hundred KB each and plenty sharp for a sphere this
size on screen. Do not use the 8k versions here -- they add several MB to
every visitor's first load for no visible difference at this scale.

## Credit (keep this visible somewhere in the app, e.g. the Home tab or README)

Earth and Moon textures: Solar System Scope (solarsystemscope.com/textures),
based on NASA imagery, licensed CC BY 4.0 (creativecommons.org/licenses/by/4.0).
