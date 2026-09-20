from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.windows import from_bounds

DEM = Path(__file__).resolve().parent / "data" / "LDEM_80S_80MPP_ADJ.TIF"
MOON_R = 1737400.0  # m, reference sphere of the LOLA products

FIGURES = Path(__file__).resolve().parents[1] / "docs" / "figures"
FIGURES.mkdir(parents=True, exist_ok=True)
with rasterio.open(DEM) as ds:
    print("size (px):", ds.width, "x", ds.height)
    print("pixel size (m):", ds.res)
    print("bounds (m):", ds.bounds)
    print("dtype:", ds.dtypes[0], "| nodata:", ds.nodata,
          "| scale/offset:", ds.scales[0], ds.offsets[0])
    print("CRS:", ds.crs)

    to_xy = Transformer.from_crs(f"+proj=longlat +R={MOON_R} +no_defs", ds.crs, always_xy=True)
    x0, y0 = to_xy.transform(0.0, -90.0)
    print(f"South pole maps to x={x0:.1f} m, y={y0:.1f} m (expect ~0, ~0)")

    def height_at(lat, lon):
        x, y = to_xy.transform(lon, lat)
        val = next(ds.sample([(x, y)], masked=True))[0]
        if np.ma.is_masked(val):
            return float("nan")
        return float(val) * ds.scales[0] + ds.offsets[0]

    for lat, lon in [(-89.9, 0), (-89.0, 0), (-89.0, 90), (-85.0, 0), (-85.0, 180)]:
        print(f"height at lat {lat}, lon {lon}: {height_at(lat, lon):9.1f} m")

    half = 60_000  # 60 km around the pole
    win = from_bounds(x0 - half, y0 - half, x0 + half, y0 + half, ds.transform)
    dem = ds.read(1, window=win, masked=True).astype("float64")
    dem = dem * ds.scales[0] + ds.offsets[0]

km = half / 1000
plt.figure(figsize=(7, 6))
plt.imshow(dem, cmap="terrain", extent=[-km, km, -km, km])
plt.colorbar(label="height above 1737.4 km sphere (m)")
plt.xlabel("x (km)")
plt.ylabel("y (km)")
plt.title("LOLA 80 m DEM around the south pole")
plt.savefig(FIGURES / "pole_dem.png", dpi=120)
plt.show()