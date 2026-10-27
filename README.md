# Fieldline Search Mission Replay

A small browser proof of concept: load a search-area polygon, generate a repeatable search route, synthesize a timestamped flight track, replay it on a map, read descriptive metrics, and export the simulated log as CSV.

**All flight data is simulated.** There is no aircraft, autopilot, or live feed, and no sensor or detection model. Nothing here is flight planning, operational SAR guidance, or evidence that anything was or was not detected. Scenario: nighttime search and rescue only.

Spec: [initial-spec.md](initial-spec.md).

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

Same boundary, settings and seed reproduce identical route, telemetry, analysis and CSV (the optional `generated_at` metadata line is the only varying field).

## Layout

`src/` holds pure modules (`boundary`, `scenario`, `route-planner`, `telemetry`, `coverage`, `analysis`, `narrative`, `mission`, `export`, `replay`) and browser modules (`app`, `map-view`, `results-view`, `status-view`). Tests sit beside them as `*.test.js`.

## Privacy and attribution

GeoJSON files are read locally and never uploaded. Base-map tile requests go to OpenStreetMap and can reveal the viewed area to that provider. Map data &copy; OpenStreetMap contributors; Leaflet is BSD-2-Clause.

## Data provenance

The files in `data/` are hand-drawn illustrative polygons, not real search areas, and all appear in the sample picker (`src/samples.js`):

- `sample_search_area.geojson`: concave Polygon near the Marin Headlands, California (default).
- `sample_islands_multipolygon.geojson`: MultiPolygon with three separated islands.
- `sample_forest_with_clearing.geojson`: Polygon with a hole that is excluded from the search.
- `sample_river_corridor.geojson`: long, narrow, bending Polygon (about 3 km). At the default swath, crosshatch on this shape is near the sample cap.

## Known gaps

- Not exercised in a browser yet: file upload of an invalid file, and the offline tile state (covered by unit tests and code paths only).
- Connectors between legs are straight lines; they are not routed around excluded areas.
- Coverage precision is limited by the cell size shown in the results.
