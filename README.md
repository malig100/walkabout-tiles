# walkabout-tiles

Prebuilt street tiles for the WalkAbout app, published at
<https://malig100.github.io/walkabout-tiles/v1/>.

- `v1/index.json` lists the covered regions and the build date.
- `v1/t/<row>/<col>.bin.gz` holds the walkable streets of one tile (0.02° × 0.04°), gzipped binary. `format.js` is the format spec.

A GitHub Actions workflow (`.github/workflows/build.yml`) rebuilds them every Sunday from an OpenStreetMap extract (currently Stockholm, from BBBike), checks that the build has not shrunk by more than 5 %, and deploys it to GitHub Pages. Run it by hand from the Actions tab.

Local use:

```
npm ci
npm test
node build.js Stockholm.osm.pbf --out site --region stockholm:59.1,17.54,59.57,18.56
node serve.js site   # http://127.0.0.1:8787/v1/
```

This builder is a copy of `tools/street-tiles` in the app repo; change it there first.

Map data © OpenStreetMap contributors, available under the [Open Database License](https://www.openstreetmap.org/copyright).
