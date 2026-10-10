"""Build the Route Planner data: docs/data/countries.bin and docs/data/planner.json.

Run from the repo root:  python3 tools/build_planner.py   (needs numpy and Pillow)
Downloads into data/raw/ (git-ignored):
- Natural Earth 1:50m countries and populated places (public domain), from the natural-earth-vector repo.
- OurAirports airports.csv (described as public domain on ourairports.com/data), from its GitHub mirror.

countries.bin: one byte per 0.25° game cell (same layout as grid.bin), gzipped. 0 = no country,
k = countries[k - 1] in planner.json. A cell belongs to the country its centre falls in.
planner.json: countries [name, label lat, label lon], cities [English name, country index, lat, lon, optional local name],
airports [IATA code, name, city, lat, lon, 1 if large]. Only airports with scheduled service and an IATA code.
"""
import csv, gzip, json, os, urllib.request
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'data', 'raw')
NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/'
SRC = {
    'ne_50m_admin_0_countries.geojson': NE + 'ne_50m_admin_0_countries.geojson',
    'ne_50m_populated_places.geojson': NE + 'ne_50m_populated_places.geojson',
    'airports.csv': 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv',
}
os.makedirs(RAW, exist_ok=True)
for name, url in SRC.items():
    if not os.path.exists(os.path.join(RAW, name)):
        urllib.request.urlretrieve(url, os.path.join(RAW, name))

R, C = 720, 1440
px = lambda lon, lat: ((lon + 180) * 4 - 0.5, (90 - lat) * 4 - 0.5)  # cell centres sit on whole pixels

feats = sorted(json.load(open(os.path.join(RAW, 'ne_50m_admin_0_countries.geojson')))['features'], key=lambda f: f['properties']['NAME_LONG'])
grid = np.zeros((R, C), np.uint8)
countries = []
for k, f in enumerate(feats, 1):
    p, g = f['properties'], f['geometry']
    polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
    mask = Image.new('L', (C, R), 0); d = ImageDraw.Draw(mask)
    for poly in polys:
        d.polygon([px(*xy) for xy in poly[0]], fill=1)
        for hole in poly[1:]: d.polygon([px(*xy) for xy in hole], fill=0)
    m = np.array(mask, bool)
    lat, lon = round(p['LABEL_Y'], 2), round(p['LABEL_X'], 2)
    grid[m] = k  # a country too small to cover a cell centre gets no cells; the page uses its label point
    countries.append([p['NAME_LONG'], lat, lon])
assert len(countries) < 255

index = {f['properties']['ADM0_A3']: k for k, f in enumerate(feats)}
cities = []
for f in json.load(open(os.path.join(RAW, 'ne_50m_populated_places.geojson')))['features']:
    p = f['properties']
    k = index.get(p['ADM0_A3'], -1)
    name = p.get('NAME_EN') or p['NAME']
    alt = p['NAME'] if p['NAME'] != name and p['NAME'] != p['NAMEASCII'] or (p['NAME'] != name and p['NAMEASCII'] != name) else ''
    cities.append([name, k, round(p['LATITUDE'], 3), round(p['LONGITUDE'], 3)] + ([alt] if alt else []))
cities.sort(key=lambda c: c[0])

airports = []
for a in csv.DictReader(open(os.path.join(RAW, 'airports.csv'), encoding='utf-8')):
    if a['scheduled_service'] != 'yes' or a['type'] not in ('large_airport', 'medium_airport') or not a['iata_code']:
        continue
    airports.append([a['iata_code'], a['name'], a['municipality'], round(float(a['latitude_deg']), 3), round(float(a['longitude_deg']), 3), int(a['type'] == 'large_airport')])
airports.sort(key=lambda a: a[0])

out = os.path.join(ROOT, 'docs', 'data')
with open(os.path.join(out, 'countries.bin'), 'wb') as fh: fh.write(gzip.compress(grid.tobytes(), 9, mtime=0))
json.dump({'countries': countries, 'cities': cities, 'airports': airports}, open(os.path.join(out, 'planner.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(f'{len(countries)} countries, {(grid > 0).sum()} cells; {len(cities)} cities; {len(airports)} airports '
      f'({sum(a[5] for a in airports)} large); planner.json {os.path.getsize(os.path.join(out, "planner.json")) // 1024} KB, '
      f'countries.bin {os.path.getsize(os.path.join(out, "countries.bin")) // 1024} KB')
