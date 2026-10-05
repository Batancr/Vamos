"""Build the map data in docs/data/ from AWS Terrain Tiles.

Run from the repo root:  python3 tools/build_data.py
Needs: numpy and pillow (python3 -m pip install numpy pillow), internet access.

Outputs
  docs/data/grid.bin      gzip of four 720x1440 byte layers (0.25 degree cells, rows 90N->90S, cols 180W->180E):
                          mean land elevation (25 m units, 0 at sea), highest point (40 m units),
                          elevation spread / roughness (5 m units), land flag (1 = land)
  docs/data/basemap.webp  2880x1440 cartoon relief map, same projection (plain lat/lon)
"""
import gzip, os, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TILES = os.path.join(ROOT, 'data', 'raw', 'tiles')
OUT = os.path.join(ROOT, 'docs', 'data')
Z, N, T = 4, 16, 256  # zoom 4 = 16x16 tiles of 256 px, about 10 km per pixel at the equator
URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'


def fetch(xy):
    x, y = xy
    path = os.path.join(TILES, f'{Z}_{x}_{y}.png')
    if not os.path.exists(path):
        urllib.request.urlretrieve(URL.format(z=Z, x=x, y=y), path)
    return path


def mosaic():
    os.makedirs(TILES, exist_ok=True)
    with ThreadPoolExecutor(16) as ex:
        list(ex.map(fetch, [(x, y) for x in range(N) for y in range(N)]))
    m = np.zeros((N * T, N * T), np.float32)
    for x in range(N):
        for y in range(N):
            a = np.asarray(Image.open(os.path.join(TILES, f'{Z}_{x}_{y}.png')).convert('RGB')).astype(np.float32)
            m[y * T:(y + 1) * T, x * T:(x + 1) * T] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768  # terrarium encoding
    return m


def to_latlon(m, per_deg=16):
    """Resample the Web Mercator mosaic to a plain lat/lon grid."""
    W = m.shape[0]
    H, Wd = 180 * per_deg, 360 * per_deg
    lats = 90 - (np.arange(H) + 0.5) / per_deg
    lons = -180 + (np.arange(Wd) + 0.5) / per_deg
    latc = np.clip(lats, -85.05, 85.05)
    my = (1 - np.log(np.tan(np.pi / 4 + np.radians(latc) / 2)) / np.pi) / 2 * W
    E = m[np.clip(my.astype(int), 0, W - 1)][:, np.clip(((lons + 180) / 360 * W).astype(int), 0, W - 1)]
    E[lats > 85.05] = -2000  # Arctic Ocean beyond the tiles
    E[lats < -85.05] = 2600  # Antarctic plateau beyond the tiles
    return E


def grid(E):
    C = 4
    b = E.reshape(E.shape[0] // C, C, E.shape[1] // C, C)
    mean, mx, sd = b.mean(axis=(1, 3)), b.max(axis=(1, 3)), b.std(axis=(1, 3))
    land = (b > 0).mean(axis=(1, 3)) >= 0.5
    ec = np.where(land, np.clip(np.round(np.maximum(mean, 0) / 25), 0, 255), 0).astype(np.uint8)
    mxc = np.clip(np.round(np.maximum(mx, 0) / 40), 0, 255).astype(np.uint8)
    rc = np.clip(np.round(sd / 5), 0, 255).astype(np.uint8)
    buf = ec.tobytes() + mxc.tobytes() + rc.tobytes() + land.astype(np.uint8).tobytes()
    with open(os.path.join(OUT, 'grid.bin'), 'wb') as f:
        f.write(gzip.compress(buf, 9))


def blur(a, k):
    for ax in (0, 1):
        c = np.cumsum(np.pad(a, [(k, k) if i == ax else (0, 0) for i in (0, 1)], mode='edge'), axis=ax)
        a = (np.take(c, range(2 * k, c.shape[ax]), axis=ax) - np.take(c, range(0, c.shape[ax] - 2 * k), axis=ax)) / (2 * k)
    return a


def ramp(v, stops):
    out = np.zeros(v.shape + (3,))
    for i in range(3):
        out[..., i] = np.interp(v, [s[0] for s in stops], [s[1][i] for s in stops])
    return out


def basemap(E):
    e = E.reshape(E.shape[0] // 2, 2, E.shape[1] // 2, 2).mean(axis=(1, 3))
    es = blur(np.where(e > 0, e, 0), 3)[:e.shape[0], :e.shape[1]]
    gy, gx = np.gradient(es)
    shade = np.clip(1 + (-gx + gy) / 90, 0.7, 1.25)
    lat = 90 - (np.arange(e.shape[0]) + 0.5) / 8
    lon = -180 + (np.arange(e.shape[1]) + 0.5) / 8
    LAT, LON = np.meshgrid(lat, lon, indexing='ij')
    ice = (e > 0) & ((LAT < -62) | ((LAT > 60) & (LON > -74) & (LON < -12) & (e > 300)))  # Antarctica, Greenland
    landc = ramp(e, [(0, (168, 201, 140)), (300, (190, 208, 140)), (800, (222, 207, 150)), (1800, (201, 163, 112)),
                     (3200, (160, 120, 92)), (4800, (236, 232, 226)), (6500, (255, 255, 255))])
    seac = ramp(e, [(-8000, (70, 128, 160)), (-4000, (102, 160, 186)), (-200, (150, 200, 214)), (0, (176, 216, 224))])
    landc = np.where(ice[..., None], np.array([238, 244, 247]) * np.ones(e.shape + (3,)), landc)
    rgb = np.where((e > 0)[..., None], landc * shade[..., None], seac)
    Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).save(os.path.join(OUT, 'basemap.webp'), quality=78, method=6)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    E = to_latlon(mosaic())
    grid(E)
    basemap(E)
    print('Wrote', os.path.join(OUT, 'grid.bin'), 'and basemap.webp')
