# Fieldline Search Mission Replay

A small browser proof of concept: load a search-area polygon, generate a repeatable search route, synthesize a timestamped flight track, replay it on a map, read descriptive metrics, and export the simulated log as CSV.

**All flight data is simulated.** There is no aircraft, autopilot, or live feed, and no sensor or detection model. Nothing here is flight planning, operational SAR guidance, or evidence that anything was or was not detected. Scenario: nighttime search and rescue only.

Spec: [initial-spec.md](initial-spec.md). Upgrade requirements and status: [UPGRADE-REQUIREMENTS.md](UPGRADE-REQUIREMENTS.md).

## Deploy

Pushes to `main` run `npm test` and publish the static app to GitHub Pages (`.github/workflows/pages.yml`). One-time setup: repo Settings → Pages → Source: GitHub Actions.

## Run

```sh
npm run serve        # python3 -m http.server 8000, then open http://localhost:8000
npm test             # node --test, Node 20+ (no dependencies)
```

Serve over HTTP; opening `index.html` as a file blocks the sample fetch and ES modules. The page loads Leaflet 1.9.4 and OpenStreetMap tiles from the network. Offline, the map shows a notice and mission data, results, replay timing and CSV export keep working.

## Input

GeoJSON `Polygon`, `MultiPolygon`, or a `Feature`/`FeatureCollection` containing only those. Positions are `[longitude, latitude]`. Holes and islands are supported (even-odd fill). Anything else (points, lines, mixed collections) is rejected with a message; nothing is partly analyzed. A rejected file leaves the previous boundary and run untouched.

Limits: at most 10 km across, at least 2,500 m², no self-intersections, and at most 6,000 telemetry samples (about 72 km of route).

## Method (assumptions, all documented in code constants)

- **Projection:** local equirectangular meters around the boundary's bounding-box center.
- **Route:** scan lines spaced at 90% of the swath, aligned with the longer bounding-box axis, clipped to the polygon, flown in alternating directions. Crosshatch adds a perpendicular pass. Segments are typed `search`, `turn` (adjacent lines), or `transit` (everything else). Connectors may cross excluded areas; they are never counted as search, and the count is reported.
- **Telemetry:** constant 12 m/s, 1 s samples, nominal altitude. Observed position = planned position plus seeded, time-correlated noise (RMS 2.5 m; 15 m during the optional GPS dip). Planned and observed positions are separate fields.
- **Deviation:** distance from each observed position to its own planned route segment, over all samples.
- **Coverage (`grid_swath_buffer_v1`):** grid cells (swath/5, at least 2 m) whose centers are inside the boundary and within swath/2 of a planned search leg, divided by eligible cells. "Repeat coverage" is the share covered by two or more legs. A coarse geometric estimate, not usable imagery or detection.
- **Footprint:** a circle of radius swath/2, labeled "assumed footprint".
- **Segment types:** `search` legs, `turn` connectors (adjacent lines of one pass) and `transit` connectors (everything else, including jumps between disjoint clipped intervals). Coverage uses search legs only. Results show search distance, turn and transit distance, and total flown distance separately.
- **Battery (`linear_drain_v1`):** starts at 100 % and drains 4.5 %/min regardless of speed or weather. A single `battery_reserve` event is emitted at the first sample at or below the reserve threshold (default 25 %, configurable). This is an illustrative assumption, not a vehicle model, and never implies the aircraft would return, land, or finish a mission. The seed does not affect battery or the reserve time.
- **Events:** the GPS-quality dip and battery reserve are structured events (`event_id`, `type`, `timestamp_s`, `end_timestamp_s`, `severity`, `value`, `unit`, `summary`, `synthetic`) shown in a clickable timeline that seeks replay.

## Optional context data

Both layers are optional, local-file only, and never change the route, telemetry, or coverage. They are cleared when a different boundary is loaded, and removed or toggled without regenerating the mission.

**Trails.** A GeoJSON `FeatureCollection` (or `Feature`) of `LineString` / `MultiLineString`; other geometry is rejected with a message and the current map is left untouched. Lines within about 1 km of the boundary are kept (limit 100,000 vertices). Trails are drawn subdued, labeled "Trail context", and are never obstacles, safe corridors, or validated routes. Enter attribution in the field before loading; it is shown with the layer and exported. For OpenStreetMap-derived data use `© OpenStreetMap contributors` (ODbL, see the [OSM copyright page](https://www.openstreetmap.org/copyright)); a link appears automatically. Suggested regional source: [Marin County GIS Open Data](https://gisopendata.marincounty.gov/); check that dataset's license yourself. Nothing is fetched from a live GIS service.

**Terrain.** A compact JSON raster, `fieldline-dem-v1`, because arbitrary GeoTIFF/COG files are not parsed in the browser (the app has no dependencies):

```json
{ "format": "fieldline-dem-v1", "source_name": "USGS 3DEP 1/3 arc-second", "source_url": "https://...", "retrieved": "2026-10-26",
  "crs": "EPSG:4326", "bounds": { "west": -122.52, "south": 37.81, "east": -122.48, "north": 37.84 },
  "width": 120, "height": 90, "vertical_units": "m", "no_data_value": -9999, "values": [ "row-major, north row first, width x height numbers" ] }
```

Only `EPSG:4326` is accepted, and the units must be `m` or `ft`. A missing CRS or bounds, an unsupported CRS, a grid over 1,000,000 cells, or a raster that does not overlap the boundary is rejected with a message. Convert a clipped GeoTIFF with GDAL, then `tools/aaigrid-to-dem.js`:

```sh
gdal_translate -of AAIGrid -projwin_srs EPSG:4326 -projwin W N E S -outsize 200 0 in.tif clip.asc
node tools/aaigrid-to-dem.js clip.asc dem.json --crs EPSG:4326 --units m --source "USGS 3DEP" --url https://www.usgs.gov/3d-elevation-program --retrieved 2026-10-26
```

The relief layer is a hillshade plus a light elevation tint, masked to the DEM extent and boundary. The profile samples the nearest cell at each planned position (no interpolation), shows unit-bearing axes, follows the replay playhead, and marks route intervals outside the data or on no-data cells as unavailable. It is a bare-earth elevation model: it does not represent trees, buildings, wires, or other surface obstacles. Resolution, CRS, units, and full/partial coverage are displayed and exported. Coverage of the boundary is judged by bounding box.

`data/context/` holds a **synthetic** demo trail set and a **synthetic** demo DEM (generated hills, not real elevation or trails), loadable from the setup panel. No real DEM is bundled.

Not implemented: terrain line-of-sight occlusion (P1, UR-017 to UR-022). The results state that terrain-only visibility is not calculated and that sensor detection is not modeled.

## Export

The CSV adds `battery_pct` and `event_types` (active event types for that sample, `|`-separated) and a metadata header with app/spec version, settings, battery model, events, and loaded context sources. "Export run metadata (JSON)" adds scenario settings, seed, battery configuration, events, metric method identifiers, context layers, DEM metadata, and a provenance list marking every layer as real source data, synthetic telemetry, or model assumption.

Same boundary, settings and seed reproduce identical route, telemetry, analysis and CSV (the optional `generated_at` metadata line is the only varying field).

## Layout

`src/` holds pure modules (`boundary`, `scenario`, `route-planner`, `telemetry`, `battery`, `events`, `coverage`, `analysis`, `narrative`, `mission`, `context-layer`, `terrain`, `terrain-render`, `profile`, `profile-layout`, `provenance`, `export`, `replay`) and browser modules (`app`, `map-view`, `context-map`, `context-controls`, `profile-view`, `timeline-view`, `results-view`, `status-view`). Tests sit beside them as `*.test.js`.

## Privacy and attribution

GeoJSON and elevation files are read locally and never uploaded. Base-map tile requests go to OpenStreetMap and can reveal the viewed area to that provider. Map data &copy; OpenStreetMap contributors; Leaflet is BSD-2-Clause.

## Data provenance

The files in `data/` are hand-drawn illustrative polygons, not real search areas, and all appear in the sample picker (`src/samples.js`):

- `sample_search_area.geojson`: concave Polygon near the Marin Headlands, California (default).
- `sample_islands_multipolygon.geojson`: MultiPolygon with three separated islands.
- `sample_forest_with_clearing.geojson`: Polygon with a hole that is excluded from the search.
- `sample_river_corridor.geojson`: long, narrow, bending Polygon (about 3 km). At the default swath, crosshatch on this shape is near the sample cap.

## Known gaps

- The upgrade UI was smoke-tested in headless Chrome (demo trails, demo terrain, profile, timeline); file-picker uploads of invalid files and the offline tile state are covered by unit tests only.
- Not exercised in a browser yet: file upload of an invalid file, and the offline tile state (covered by unit tests and code paths only).
- Connectors between legs are straight lines; they are not routed around excluded areas.
- Coverage precision is limited by the cell size shown in the results.
