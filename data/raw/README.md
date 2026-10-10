# Source data

| Data | Source | Licence / terms | Used for |
|---|---|---|---|
| Elevation and bathymetry | AWS Terrain Tiles, Terrarium PNG format, zoom 4: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`. Registry page: https://registry.opendata.aws/terrain-tiles/ | Open data. It's built from several sources (SRTM, GMTED, ETOPO1 and others), and some of them ask for attribution. **To verify:** the exact attribution text on the registry page before launch. | `docs/data/grid.bin`, `docs/data/basemap.webp` |
| Country borders | `world-atlas` npm package v2 (countries-50m), derived from Natural Earth | Natural Earth is described as public domain. **To verify** on naturalearthdata.com. | `docs/data/borders.json` |

| Lakes | Natural Earth 1:50m lakes (`ne_50m_lakes.geojson`) from https://github.com/nvkelso/natural-earth-vector | Natural Earth is described as public domain. **To verify** on naturalearthdata.com. | The lake layer in `docs/data/grid.bin`, lake colour in `docs/data/basemap.webp` |

| Satellite imagery (loaded live, not stored in the repo) | EOxCloudless Sentinel-2 2024, WMTS `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024/default/WGS84/{z}/{row}/{col}.jpg` | CC BY-NC-SA 4.0 for non-commercial use; credit "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)" must be visible (https://cloudless.eox.at/documentation/license, checked 6 Oct 2026) | The satellite layer when zoomed in |

| Ports | Natural Earth 1:10m ports (`ne_10m_ports.geojson`) from https://github.com/nvkelso/natural-earth-vector | Public domain (Natural Earth). **To verify.** | `docs/data/places.json` (built by `tools/build_places.py`) |
| Balloon sites | Typed in by hand in `tools/build_places.py` | — (coordinates approximate, recalled) | `docs/data/places.json` |
| Biomes (desert, grassland, jungle, ice) | Natural Earth 1:10m geography region polygons (`ne_10m_geography_regions_polys.geojson`) from https://github.com/nvkelso/natural-earth-vector, plus hand-typed boxes in `tools/build_biome.py` | Public domain (Natural Earth). **To verify.** Boxes are approximate. | The fifth layer of `docs/data/grid.bin` |
| Streets (loaded live) | OpenStreetMap standard tiles `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | © OpenStreetMap contributors, ODbL; tile usage policy applies | Streets layer |
| Countries and cities (Route Planner) | Natural Earth 1:50m admin-0 countries and populated places from https://github.com/nvkelso/natural-earth-vector | Public domain (Natural Earth). **To verify.** | `docs/data/countries.bin`, `docs/data/planner.json` (built by `tools/build_planner.py`) |
| Airports (Route Planner) | OurAirports `airports.csv`, GitHub mirror https://github.com/davidmegginson/ourairports-data (downloaded 10 Oct 2026) | Described as public domain on ourairports.com/data. **To verify**: I couldn't open that page from here. | `docs/data/planner.json` |

Lakes skipped on purpose (`DRY` in `tools/build_data.py`): Australian salt pans that are dry most of the time (Lake Eyre North and South, Frome, Gairdner, Torrens, Mackay, Disappointment, Barlee).

`tools/build_data.py` downloads the 256 tiles (about 18 MB) into `data/raw/tiles/`, and the lakes file into `data/raw/`. Both are git-ignored.
