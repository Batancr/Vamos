# Source data

| Data | Source | Licence / terms | Used for |
|---|---|---|---|
| Elevation and bathymetry | AWS Terrain Tiles, Terrarium PNG format, zoom 4: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`. Registry page: https://registry.opendata.aws/terrain-tiles/ | Open data. It's built from several sources (SRTM, GMTED, ETOPO1 and others), and some of them ask for attribution. **To verify:** the exact attribution text on the registry page before launch. | `docs/data/grid.bin`, `docs/data/basemap.webp` |
| Country borders | `world-atlas` npm package v2 (countries-50m), derived from Natural Earth | Natural Earth is described as public domain. **To verify** on naturalearthdata.com. | `docs/data/borders.json` |

| Lakes | Natural Earth 1:50m lakes (`ne_50m_lakes.geojson`) from https://github.com/nvkelso/natural-earth-vector | Natural Earth is described as public domain. **To verify** on naturalearthdata.com. | The lake layer in `docs/data/grid.bin`, lake colour in `docs/data/basemap.webp` |

Lakes skipped on purpose (`DRY` in `tools/build_data.py`): Australian salt pans that are dry most of the time (Lake Eyre North and South, Frome, Gairdner, Torrens, Mackay, Disappointment, Barlee).

`tools/build_data.py` downloads the 256 tiles (about 18 MB) into `data/raw/tiles/`, and the lakes file into `data/raw/`. Both are git-ignored.
