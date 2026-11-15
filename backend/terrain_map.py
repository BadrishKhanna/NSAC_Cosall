"""A small top-down elevation grid around a lunar south-polar site, for the terrain map in
the Orbit view. It reads the same LOLA 80 m DEM as the horizon code, and does not use SPICE."""
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.enums import Resampling
from rasterio.windows import from_bounds

MOON_R = 1737400.0  # m, reference sphere of the LOLA products
DEM_PATH = Path(__file__).resolve().parent / "data" / "LDEM_80S_80MPP_ADJ.TIF"
_LL = f"+proj=longlat +R={MOON_R} +no_defs"


def terrain_window(lat_deg, lon_deg, half_km=30.0, size=160, dem_path=DEM_PATH):
    """Heights (m, above the 1737.4 km sphere) in a square of side 2*half_km centered on the
    site, as a size x size grid. Rows run from the top of the map (+y in the DEM's polar
    stereographic plane) to the bottom, columns left (-x) to right (+x), the same picture
    matplotlib's imshow gives for the DEM. Cells with no data are None.
    Raises ValueError when the square does not touch the DEM."""
    half_m = half_km * 1000.0
    with rasterio.open(dem_path) as ds:
        to_xy = Transformer.from_crs(_LL, ds.crs, always_xy=True)
        x0, y0 = to_xy.transform(lon_deg, lat_deg)
        b = ds.bounds
        if not (b.left < x0 < b.right and b.bottom < y0 < b.top):
            raise ValueError("This point is outside the terrain map.")

        # Which way is north on the map? (Polar stereographic: not straight up.)
        eps = 0.01
        xn1, yn1 = to_xy.transform(lon_deg, lat_deg + 0.5 * eps)
        xn0, yn0 = to_xy.transform(lon_deg, lat_deg - 0.5 * eps)
        north = np.array([xn1 - xn0, yn1 - yn0])
        north = north / np.linalg.norm(north)

        win = from_bounds(x0 - half_m, y0 - half_m, x0 + half_m, y0 + half_m, ds.transform)
        data = ds.read(1, window=win, out_shape=(size, size), masked=True, boundless=True,
                       resampling=Resampling.average)
        scale, offset = ds.scales[0], ds.offsets[0]

    heights = np.ma.asarray(data).astype("float64") * scale + offset
    filled = np.ma.filled(heights, np.nan)
    valid = filled[np.isfinite(filled)]
    if valid.size == 0:
        raise ValueError("No terrain data around this point.")
    grid = [[None if not np.isfinite(v) else int(round(v)) for v in row] for row in filled]
    return {
        "half_km": float(half_km),
        "size": int(size),
        "min": int(round(float(valid.min()))),
        "max": int(round(float(valid.max()))),
        "coverage": round(float(valid.size) / filled.size, 3),
        "north": [round(float(north[0]), 4), round(float(north[1]), 4)],
        "heights": grid,
    }
