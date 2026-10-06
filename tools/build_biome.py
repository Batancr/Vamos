"""Add a fifth layer to docs/data/grid.bin: the biome of each 0.25 degree cell.

Run from the repo root after tools/build_data.py:  python3 tools/build_biome.py
Needs: numpy and pillow, internet access the first time (Natural Earth region polygons).

Biome codes: 0 = other, 1 = desert, 2 = grassland, 3 = jungle, 4 = ice and snow.
Sources and how rough they are:
  desert     Natural Earth 'Desert' regions (minus Caatinga and Punjab, which are not deserts),
             plus hand-drawn boxes for the Arabian interior, the Australian interior and the Mojave.
  grassland  Natural Earth 'Plain' and 'Wetlands' regions that are steppe, prairie, pampas or savanna,
             plus boxes for the Mongolian and Patagonian steppes.
  jungle     Natural Earth Amazon Basin, Congo Basin, Selvas and Yungas, plus boxes for the other
             rainforests (Central America, Guianas, West Africa, Madagascar, South-East Asia,
             New Guinea, north Queensland). Only lowland cells (under 1,200 m) count.
  ice/snow   The game's existing ice rule (Antarctica, Greenland's ice sheet), all land beyond 60 degrees,
             and Natural Earth 'Tundra' regions north of 55 degrees.
The boxes are typed by hand to about a degree. They are a game approximation, not a land-cover map.
"""
import gzip, json, os, urllib.request
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GRID = os.path.join(ROOT, 'docs', 'data', 'grid.bin')
REG_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_geography_regions_polys.geojson'
REG = os.path.join(ROOT, 'data', 'raw', 'ne_10m_geography_regions_polys.geojson')
R, C, PD = 720, 1440, 4  # rows, cols, cells per degree

NOT_DESERT = {'CAATINGAS', 'PUNJAB'}
GRASS = {'Serengeti Plains', 'Masai Steppe', 'Iwembere Steppe', 'Darling Downs', 'Alföld', 'Llano Estacado',
         'SAHEL', 'PONTIC STEPPE', 'CENTRAL LOWLAND', 'GREAT PLAINS', 'PAMPAS', 'LLANOS', 'KAZAKH STEPPE',
         'NULLARBOR PLAIN', 'Entre Rios', 'PANTANAL'}
JUNGLE = {'AMAZON BASIN', 'CONGO BASIN', 'SELVAS', 'YUNGAS', 'Niger Delta', 'Amazon Delta', 'Sundarbans'}
# (south, north, west, east) in degrees.
DESERT_BOX = [(16, 30, 38, 56), (-30, -20, 118, 141), (34, 37, -118, -114)]
GRASS_BOX = [(45, 50, 98, 118), (-52, -40, -71, -65)]
JUNGLE_BOX = [(7, 17, -92, -77), (0, 8, -62, -51), (4, 8, -13, 8), (-25, -12, 48.5, 50.5),
              (-9, 7, 95, 125), (5, 19, 117, 127), (-9, 0, 130, 151), (8, 22, 97, 109),
              (15, 28, 89, 98), (-19, -15, 144.5, 146.5)]


def layer(features, keep):
    img = Image.new('L', (C, R), 0)
    d = ImageDraw.Draw(img)
    xy = lambda ring: [((lon + 180) * PD, (90 - lat) * PD) for lon, lat in ring]
    for f in features:
        if not keep(f['properties']) or not f['geometry']:
            continue
        g = f['geometry']
        for poly in (g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]):
            d.polygon(xy(poly[0]), fill=1)
    return np.asarray(img).astype(bool)


def boxes(bs, seed=1):
    """Hand-drawn boxes with wobbly edges, so they don't show up as rectangles on the map."""
    m = np.zeros((R, C), np.uint8)
    for s, n, w, e in bs:
        m[int((90 - n) * PD):int((90 - s) * PD), int((w + 180) * PD):int((e + 180) * PD)] = 255
    noise = (np.random.default_rng(seed).random((R // 8, C // 8)) * 255).astype(np.uint8)
    noise = np.asarray(Image.fromarray(noise).resize((C, R), Image.BICUBIC)) / 255
    soft = np.asarray(Image.fromarray(m).filter(ImageFilter.GaussianBlur(6))) / 255
    return soft + (noise - 0.5) * 0.6 > 0.5


def main():
    if not os.path.exists(REG):
        urllib.request.urlretrieve(REG_URL, REG)
    feats = json.load(open(REG))['features']
    raw = gzip.decompress(open(GRID, 'rb').read())
    n = R * C
    elev = np.frombuffer(raw[:n], np.uint8).reshape(R, C).astype(int) * 25
    surf = np.frombuffer(raw[3 * n:4 * n], np.uint8).reshape(R, C)
    land = surf == 1
    lat = 90 - (np.arange(R) + 0.5) / PD
    lon = -180 + (np.arange(C) + 0.5) / PD
    LAT, LON = np.meshgrid(lat, lon, indexing='ij')

    desert = layer(feats, lambda p: p['FEATURECLA'] == 'Desert' and p['NAME'] not in NOT_DESERT)
    desert |= boxes(DESERT_BOX) & (elev < 1500)
    grass = layer(feats, lambda p: p['NAME'] in GRASS) | (boxes(GRASS_BOX) & (elev < 2000))
    jungle = (layer(feats, lambda p: p['NAME'] in JUNGLE) | boxes(JUNGLE_BOX)) & (elev < 1200)
    # Same rule as isIce in docs/phys.js, plus polar land and northern tundra.
    ice = (LAT < -62) | ((LAT > 60) & (LON > -74) & (LON < -12) & (elev > 300)) | (np.abs(LAT) >= 60)
    ice |= layer(feats, lambda p: p['FEATURECLA'] == 'Tundra') & (LAT >= 55)

    b = np.zeros((R, C), np.uint8)
    b[grass] = 2
    b[jungle] = 3
    b[desert] = 1
    # The Sahara polygon reaches into the Sahel; its southern part is savanna, not sand.
    b[layer(feats, lambda p: p['NAME'] == 'SAHEL') & boxes([(0, 15.5, -20, 40)], seed=2) & desert] = 2
    b[ice] = 4
    b[~land] = 0
    for k, name in enumerate(['other', 'desert', 'grassland', 'jungle', 'ice/snow']):
        print(f'{name:10s} {int((b == k).sum()):7d} cells')
    with open(GRID, 'wb') as f:
        f.write(gzip.compress(raw[:4 * n] + b.tobytes(), 9))
    print('Wrote', GRID, 'with', 5, 'layers')


if __name__ == '__main__':
    main()
