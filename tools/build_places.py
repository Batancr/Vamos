"""Build docs/data/places.json: stop points shown on the map (ports and hot air balloon sites).

Run from the repo root:  python3 tools/build_places.py
Ports: Natural Earth 1:10m ports (public domain), downloaded into data/raw/ (git-ignored).
Balloon sites: well-known hot air balloon areas, typed in by hand. Coordinates are approximate
(to about 0.05°) and recalled rather than looked up, so spot-check them before relying on them.
"""
import json, os, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORTS_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_ports.geojson'
PORTS = os.path.join(ROOT, 'data', 'raw', 'ne_10m_ports.geojson')

BALLOONS = [
    ['Cappadocia (Göreme), Türkiye', 38.64, 34.83], ['Albuquerque Balloon Fiesta Park, USA', 35.20, -106.60],
    ['Bagan, Myanmar', 21.17, 94.86], ['Luxor West Bank, Egypt', 25.73, 32.61],
    ["Château-d'Œx, Switzerland", 46.48, 7.13], ['Maasai Mara, Kenya', -1.49, 35.14],
    ['Napa Valley, USA', 38.30, -122.29], ['Teotihuacan, Mexico', 19.69, -98.84],
    ['Hunter Valley, Australia', -32.79, 151.30], ['Bristol (Ashton Court), UK', 51.44, -2.64],
    ['Saga, Japan', 33.25, 130.30], ['Luye, Taiwan', 22.91, 121.12], ['Jaipur, India', 26.92, 75.79],
    ['Marrakesh, Morocco', 31.75, -7.90], ['León, Mexico', 21.12, -101.68],
    ['Saint-Jean-sur-Richelieu, Canada', 45.31, -73.26], ['Serengeti, Tanzania', -2.33, 34.83],
    ['Sossusvlei, Namibia', -24.73, 15.29], ['Canberra, Australia', -35.30, 149.13],
    ['Vang Vieng, Laos', 18.92, 102.45], ['Wadi Rum, Jordan', 29.58, 35.42], ['Siem Reap, Cambodia', 13.36, 103.86],
    ['Loire Valley (Amboise), France', 47.41, 0.98], ['Tuscany (Siena), Italy', 43.32, 11.33],
    ['Segovia, Spain', 40.95, -4.12], ['Mondovì, Italy', 44.39, 7.82], ['Plano, Texas, USA', 33.02, -96.70],
    ['Battle Creek, USA', 42.32, -85.18],
]

if not os.path.exists(PORTS):
    os.makedirs(os.path.dirname(PORTS), exist_ok=True)
    urllib.request.urlretrieve(PORTS_URL, PORTS)
ports = []
for f in json.load(open(PORTS))['features']:
    lon, lat = f['geometry']['coordinates'][:2]
    ports.append([f['properties'].get('name') or 'Port', round(lat, 3), round(lon, 3), f['properties'].get('scalerank', 8)])
ports.sort(key=lambda p: p[3])  # most important first
out = os.path.join(ROOT, 'docs', 'data', 'places.json')
json.dump({'ports': ports, 'balloons': BALLOONS}, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('Wrote', out, len(ports), 'ports,', len(BALLOONS), 'balloon sites,', os.path.getsize(out) // 1024, 'KB')
