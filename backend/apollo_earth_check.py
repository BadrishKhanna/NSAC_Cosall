import numpy as np

from lunar_geometry import _site_basis, body_vectors, utc_to_et

# Diagnostic: is the steady -0.17 deg Earth-altitude offset a parallax effect?
# Compare Earth's altitude seen from the site with its altitude when the direction is
# taken from the Moon's center (what you get if parallax is ignored).
LAT, LON = 0.6875, 23.4333      # the source's nominal site
PUBLISHED_ALT = 59.43           # ALSJ landing row (printed "59:43"; verify)
et = utc_to_et("1969-07-20 20:17:39 UTC")
site, up, east, north = _site_basis(LAT, LON)
v = body_vectors("EARTH", [et])[0]

from_site = (v - site) / np.linalg.norm(v - site)
from_center = v / np.linalg.norm(v)
alt_site = np.degrees(np.arcsin(from_site @ up))
alt_center = np.degrees(np.arcsin(from_center @ up))
print(f"Earth altitude from the site:          {alt_site:6.2f} deg  (diff vs published {alt_site - PUBLISHED_ALT:+.2f})")
print(f"Earth altitude from the Moon's center: {alt_center:6.2f} deg  (diff vs published {alt_center - PUBLISHED_ALT:+.2f})")