import warnings
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.enums import Resampling
from rasterio.transform import from_bounds as _tb
from rasterio.windows import Window, from_bounds
from scipy.ndimage import map_coordinates

MOON_R = 1737400.0  # m, reference sphere of the LOLA products
DEM_PATH = Path(__file__).resolve().parent / "data" / "LDEM_80S_80MPP_ADJ.TIF"
# Optional coarser map out to 65S (NASA LDEC_60S_240MPP_ADJ.TIF, downloaded by download_data.py), same projection as DEM_PATH.
WIDE_PATH = Path(__file__).resolve().parent / "data" / "LDEM_60S_240MPP_ADJ.TIF"
_LL = f"+proj=longlat +R={MOON_R} +no_defs"


def same_grid(ds, wd):
    """True when two rasters share a projection (a point maps to the same x, y in both)."""
    if ds.crs == wd.crs:
        return True
    t = Transformer.from_crs(ds.crs, wd.crs, always_xy=True)
    x, y = t.transform(123456.0, -234567.0)
    return abs(x - 123456.0) < 1.0 and abs(y + 234567.0) < 1.0


def site_from_xy(x_m, y_m, dem_path=DEM_PATH):
    """(lat_deg, lon_deg) of a point given in the DEM's polar stereographic meters."""
    with rasterio.open(dem_path) as ds:
        lon, lat = Transformer.from_crs(ds.crs, _LL, always_xy=True).transform(x_m, y_m)
    return lat, lon


def horizon_profile(lat_deg, lon_deg, max_range_m=100_000.0, az_step_deg=1.0,
                    observer_height_m=0.0, dem_path=DEM_PATH, wide_path=WIDE_PATH):
    """Terrain horizon elevation angle (deg) for each azimuth (clockwise from north)
    at a lunar south-polar site. Returns (azimuths_deg, horizon_elevation_deg).
    Approximations: projected meters treated as true meters, straight rays in the
    projected plane, spherical Moon of radius MOON_R. Site must be at least 0.02 deg
    from the pole and inside the DEM."""
    with rasterio.open(dem_path) as ds:
        to_xy = Transformer.from_crs(_LL, ds.crs, always_xy=True)
        x0, y0 = to_xy.transform(lon_deg, lat_deg)

        # Local north/east directions in the projected plane, from the projection
        # itself (no assumption about how the map is oriented).
        eps = 0.01  # degrees, step for the central differences
        d_lon = 0.5 * eps / np.cos(np.radians(lat_deg))
        xn1, yn1 = to_xy.transform(lon_deg, lat_deg + 0.5 * eps)
        xn0, yn0 = to_xy.transform(lon_deg, lat_deg - 0.5 * eps)
        xe1, ye1 = to_xy.transform(lon_deg + d_lon, lat_deg)
        xe0, ye0 = to_xy.transform(lon_deg - d_lon, lat_deg)
        north = np.array([xn1 - xn0, yn1 - yn0])
        north /= np.linalg.norm(north)
        east = np.array([xe1 - xe0, ye1 - ye0])
        east /= np.linalg.norm(east)

        b = ds.bounds
        inside_fine = (x0 - max_range_m >= b.left and x0 + max_range_m <= b.right and
                       y0 - max_range_m >= b.bottom and y0 + max_range_m <= b.top)
        if inside_fine or not Path(wide_path).exists():
            # Whole view inside the 80 m map (or no coarse map): read only that window.
            left, right = max(x0 - max_range_m, b.left), min(x0 + max_range_m, b.right)
            bottom, top = max(y0 - max_range_m, b.bottom), min(y0 + max_range_m, b.top)
            r0, c0 = ds.index(left, top)
            r1, c1 = ds.index(right, bottom)
            r0, c0 = max(r0, 0), max(c0, 0)
            r1, c1 = min(r1, ds.height - 1), min(c1, ds.width - 1)
            win = Window.from_slices((r0, r1 + 1), (c0, c1 + 1))
            dem = ds.read(1, window=win, masked=True).astype("float64")
            dem = (dem * ds.scales[0] + ds.offsets[0]).filled(np.nan)
            inv = ~ds.window_transform(win)
            pixel = abs(ds.res[0])
        else:
            # Site north of 80S (or near the edge): coarse map resampled to the 80 m grid,
            # with the 80 m data laid over it wherever it exists.
            pixel = abs(ds.res[0])
            n = int(np.ceil(2 * max_range_m / pixel))
            tr = _tb(x0 - max_range_m, y0 - max_range_m, x0 + max_range_m, y0 + max_range_m, n, n)
            dem = np.full((n, n), np.nan)
            with rasterio.open(wide_path) as wd:
                if not same_grid(ds, wd):
                    raise ValueError("The 65S map uses a different projection from the 80 m map.")
                wb = wd.bounds
                if not (wb.left < x0 < wb.right and wb.bottom < y0 < wb.top):
                    raise ValueError("Site is outside the DEM or on a no-data pixel.")
                coarse = wd.read(1, window=from_bounds(x0 - max_range_m, y0 - max_range_m,
                                                       x0 + max_range_m, y0 + max_range_m, wd.transform),
                                 out_shape=(n, n), masked=True, boundless=True,
                                 resampling=Resampling.bilinear)
                dem = np.ma.filled(coarse.astype("float64") * wd.scales[0] + wd.offsets[0], np.nan)
            fine = ds.read(1, window=from_bounds(x0 - max_range_m, y0 - max_range_m,
                                                 x0 + max_range_m, y0 + max_range_m, ds.transform),
                           out_shape=(n, n), masked=True, boundless=True,
                           resampling=Resampling.bilinear)
            fine = np.ma.filled(fine.astype("float64") * ds.scales[0] + ds.offsets[0], np.nan)
            dem = np.where(np.isfinite(fine), fine, dem)
            inv = ~tr

    def sample(xs, ys):
        cols, rows = inv * (xs, ys)
        return map_coordinates(dem, [np.ravel(rows - 0.5), np.ravel(cols - 0.5)],
                               order=1, mode="constant", cval=np.nan).reshape(np.shape(xs))

    h0 = float(sample(np.array([x0]), np.array([y0]))[0])
    if np.isnan(h0):
        raise ValueError("Site is outside the DEM or on a no-data pixel.")

    az = np.arange(0.0, 360.0, az_step_deg)
    d = np.arange(pixel, max_range_m, pixel)
    a = np.radians(az)[:, None]
    dirs = np.cos(a) * north + np.sin(a) * east           # (n_az, 2), clockwise from north
    xs = x0 + d[None, :] * dirs[:, 0:1]
    ys = y0 + d[None, :] * dirs[:, 1:2]
    heights = sample(xs, ys)                                # (n_az, n_d)

    phi = d / MOON_R                                        # central angle of each sample
    r_t = MOON_R + heights
    horizontal = r_t * np.sin(phi)
    vertical = r_t * np.cos(phi) - (MOON_R + h0 + observer_height_m)
    angle = np.degrees(np.arctan2(vertical, horizontal))
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", RuntimeWarning)  # all-NaN azimuths handled below
        hor = np.nanmax(angle, axis=1)
    hor = np.where(np.isnan(hor), 0.0, hor)  # no DEM data along this azimuth: treat as flat
    return az, hor


def above_horizon(el_deg, az_deg, horizon_az_deg, horizon_el_deg):
    """True where a body at (elevation, azimuth) is above the terrain horizon."""
    hor = np.interp(az_deg, horizon_az_deg, horizon_el_deg, period=360.0)
    return np.asarray(el_deg) > hor