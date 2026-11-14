import warnings
from pathlib import Path

import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.windows import Window
from scipy.ndimage import map_coordinates

MOON_R = 1737400.0  # m, reference sphere of the LOLA products
DEM_PATH = Path(__file__).resolve().parent / "data" / "LDEM_80S_80MPP_ADJ.TIF"
_LL = f"+proj=longlat +R={MOON_R} +no_defs"


def site_from_xy(x_m, y_m, dem_path=DEM_PATH):
    """(lat_deg, lon_deg) of a point given in the DEM's polar stereographic meters."""
    with rasterio.open(dem_path) as ds:
        lon, lat = Transformer.from_crs(ds.crs, _LL, always_xy=True).transform(x_m, y_m)
    return lat, lon


def horizon_profile(lat_deg, lon_deg, max_range_m=100_000.0, az_step_deg=1.0,
                    observer_height_m=0.0, dem_path=DEM_PATH):
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

        # Read only the window around the site, clipped to the raster.
        b = ds.bounds
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