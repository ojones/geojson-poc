# Fieldline Upgrade Requirements

**Status:** Handoff requirements for the next coding session  
**Product:** Fieldline Search Mission Replay  
**Version:** 0.1  
**Date:** 2026-10-26  
**Parent specification:** [`POC-SPEC.md`](POC-SPEC.md)  
**Purpose:** Add credible real-world geographic context and richer, clearly labeled mission-analysis visuals to the existing simulated nighttime SAR proof of concept.

## 1. Goal

Extend the current app with optional real trail and terrain datasets, a terrain-aware visualization, and a few realistic synthetic mission events. The user should be able to watch a simulated search, understand where the route passes relative to terrain, trails, and data-quality events, and see why coverage estimates can be uncertain.

This remains a **simulation and visualization**. It does not control an aircraft, predict actual sensor detection, or provide operational SAR recommendations.

## 2. Scope and priorities

Implement in this order. P0 is the release target for this upgrade; P1 follows if the terrain work proves manageable. Do not add unrelated wildfire or wildlife scenarios in this upgrade.

| Priority | Upgrade | Outcome |
|---|---|---|
| **P0** | Real trail overlay from GeoJSON | Geographic context from a public dataset, displayed with attribution. |
| **P0** | DEM terrain context and profile | Real terrain shown as hillshade/elevation profile along the simulated mission. |
| **P0** | Route segment classification | Search, transit, and turn segments are distinguishable and metrics use the correct types. |
| **P0** | Mission event timeline | GPS-quality dip and synthetic battery reserve event are visible and synchronized with replay. |
| **P1** | Simplified terrain line-of-sight occlusion | Illustrative ridge obstruction flags based on DEM elevations and declared geometry. |

## 3. Stable requirement IDs and component references

Keep IDs stable and cite them in commits, PRs, or implementation notes. Existing component IDs from `POC-SPEC.md` are reused: C-01 setup, C-02 boundary validation, C-03 configuration, C-04 route planner, C-05 telemetry simulator, C-06 mission state, C-07 map renderer, C-08 replay, C-09 metrics, C-10 results, C-11 export, C-12 base map, C-13 sample data, C-14 status/provenance.

New upgrade component IDs:

| ID | Component | Responsibility |
|---|---|---|
| **C-15** | Context GeoJSON Loader | Load, validate, clip, and store optional contextual vector data such as trails. |
| **C-16** | Terrain DEM Loader | Load a user-supplied DEM, validate supported raster/CRS metadata, and sample elevations. |
| **C-17** | Terrain Renderer & Profile | Render terrain hillshade/elevation context and a profile synchronized with mission replay. |
| **C-18** | Terrain Occlusion Estimator | Optionally estimate whether terrain blocks a straight line from assumed sensor position to a ground sample. |
| **C-19** | Segment & Event Model | Preserve route segment types and store timed synthetic mission events. |
| **C-20** | Battery Model | Generate a deterministic illustrative battery state-of-charge series and reserve event. |
| **C-21** | Mission Event Timeline | Show and navigate mission events, synchronized with playback. |

## 4. Data sources and provenance

### 4.1 Trails / context vector data

The initial recommended regional source is the Marin County Trails feature service, covering trails in the Marin area and combining features from partner agencies. The app must treat it as optional context, not a flight obstacle layer. The county GIS open-data portal is another discovery/download entry point. The implementation may consume a downloaded GeoJSON file or a user-provided export. If using an ArcGIS feature service directly, observe service limits and handle failures gracefully.

- [Marin County GIS Open Data](https://gisopendata.marincounty.gov/)
- [Marin County Trails FeatureServer](https://services5.arcgis.com/tdQLEzq0fgVElWN3/ArcGIS/rest/services/MarinCountyTrails/FeatureServer)

OpenStreetMap is an acceptable alternative for a small locally exported trail set. Preserve required attribution and follow its ODbL licensing terms.

- [OpenStreetMap export and license information](https://www.openstreetmap.org/export)

### 4.2 Elevation data

Use a small DEM covering the selected search area. For U.S. areas, the default source should be USGS 3DEP, preferably a 10 m DEM for the first interactive prototype. DEM products are generally GeoTIFF/Cloud Optimized GeoTIFF, not GeoJSON. Record source, resolution, coordinate reference system, vertical units/datum where available, retrieval date, and source URL in metadata.

- [USGS elevation data formats and download information](https://www.usgs.gov/faqs/what-types-elevation-datasets-are-available-what-formats-do-they-come-and-where-can-i-download)
- [USGS 3DEP](https://www.usgs.gov/3d-elevation-program)

The sample app may bundle a clipped, appropriately licensed DEM for its sample search area if size permits. Otherwise provide clear instructions and let users load a local DEM. Do not silently fetch large rasters on every page load.

## 5. Verifiable requirements

### 5.1 Trail and context layer (P0)

- **UR-001 (C-01/C-15):** The user can optionally load a local GeoJSON `FeatureCollection` containing `LineString` and/or `MultiLineString` trail features. If a narrower supported geometry is chosen, document it and reject unsupported geometry with a visible message.
- **UR-002 (C-15):** GeoJSON coordinates are interpreted as `[longitude, latitude]`; trail features appear geographically aligned with the search boundary and basemap.
- **UR-003 (C-15):** The map renders context trails in a distinct, subdued style that remains visually subordinate to planned route and simulated flown track. A legend identifies the layer as “Trail context.”
- **UR-004 (C-15):** Loading trails is optional. If no file is loaded, the mission generation and analysis workflow remains usable.
- **UR-005 (C-15/C-14):** Invalid file, unsupported geometry, empty layer, or failed remote request produces an actionable status message. Existing valid mission and boundary data remain intact.
- **UR-006 (C-15/C-14):** The user can toggle the trail layer on/off and can remove or replace it without regenerating the mission.
- **UR-007 (C-15/C-14):** The application displays data source/attribution for loaded trails. For OpenStreetMap-derived data, include visible attribution and a link to OSM copyright/license information.
- **UR-008 (C-15):** Context vector features are for situational display only in this release. The app must not label trails as obstacles, safe corridors, or validated search routes.

**Acceptance check:** Load a small trail GeoJSON covering the sample polygon; verify alignment, toggle behavior, legend, and attribution. Then load malformed GeoJSON and verify the existing map state remains intact with an error message.

### 5.2 Terrain input, relief map, and profile (P0)

- **UR-009 (C-01/C-16):** The user can optionally load a local elevation raster in the documented supported format. Preferred v0 format is GeoTIFF/COG. If browser support requires preprocessing, provide a documented conversion workflow or support a compact derived raster format; do not pretend an arbitrary TIFF was read if it was not.
- **UR-010 (C-16):** Validate raster dimensions, georeferencing/CRS, extent overlap with search area, no-data values, and vertical units before analysis. Unsupported CRS or missing georeferencing must produce a clear recoverable error.
- **UR-011 (C-16/C-14):** Show DEM metadata used by the run: source/name, pixel spacing or stated resolution, elevation units, and whether the DEM fully or partially covers the search area.
- **UR-012 (C-17):** When a valid DEM is loaded, render terrain relief or elevation shading clipped/masked to the DEM extent and search area. The layer can be toggled without affecting route or telemetry.
- **UR-013 (C-17):** Render an elevation profile sampled along the planned or simulated route, with horizontal distance/time and elevation axes with units. The profile playhead follows the map replay marker.
- **UR-014 (C-17):** If the track exits DEM coverage or crosses no-data cells, mark the profile interval as unavailable; do not interpolate silently across large missing regions.
- **UR-015 (C-17/C-14):** Without a DEM, hide the profile/relief controls or show a clear “No terrain data loaded” state; the baseline mission still works.
- **UR-016 (C-14):** Label terrain data as a geographic elevation model and disclose resolution/source. Do not imply that the raster represents trees, buildings, wires, or all surface obstacles unless the chosen dataset actually includes those features.

**Acceptance check:** Load a DEM that overlaps the sample area. Verify relief display, unit-bearing profile, synchronized playhead during play and seeking, and no-data behavior. Try a non-overlapping DEM and an unsupported/missing CRS and verify useful errors.

### 5.3 Terrain line-of-sight visualization (P1)

- **UR-017 (C-18):** When terrain data and a valid assumed sensor altitude are available, the app may estimate terrain-only line of sight from a point on the simulated flight track to ground sample points in the assumed footprint.
- **UR-018 (C-18):** The algorithm must use a documented coordinate projection, sample spacing, sensor height above ground/sea level convention, and DEM resolution. The run metadata records the method and parameters.
- **UR-019 (C-18):** If intermediate terrain elevations exceed the line from sensor to ground sample, render that sample/sector as “terrain occluded”; otherwise render as “terrain-visible under model.” Use a third “unknown” state for no-data/out-of-extent samples.
- **UR-020 (C-18):** The visualization and narrative must call this a simplified terrain-only line-of-sight estimate. It must not claim that real imagery, thermal sensing, target detection, canopy penetration, atmospheric visibility, or operational search coverage has been modeled.
- **UR-021 (C-18/C-09):** Any terrain-aware coverage metric must be separately named from geometric route coverage and must not count unknown terrain samples as visible.
- **UR-022 (C-18):** If the browser/runtime cannot perform this model within documented performance bounds, show a graceful “terrain visibility not calculated” state rather than blocking replay.

**Acceptance check:** Use a test DEM containing a known synthetic ridge and a known unobstructed route. Confirm samples behind the ridge are flagged occluded, unobstructed samples are visible under the model, and no-data samples remain unknown. Confirm UI labels include the method limitations.

### 5.4 Search / transit / turn route semantics (P0)

- **UR-023 (C-04/C-19):** Planned route output must distinguish `search`, `transit`, and `turn` segments (or an equivalently explicit representation). A line connecting disjoint clipped search intervals must never be misclassified as a search pass.
- **UR-024 (C-07):** Planned search legs, transit connectors, turns, and simulated flown track have distinguishable map styling and legend entries. If visual clutter requires hiding some types, provide layer toggles.
- **UR-025 (C-09):** Geometric coverage calculations use search segments only, except where the declared sensor footprint method intentionally includes another segment type. Transit and turn distance/time may be reported separately.
- **UR-026 (C-09/C-10):** Results show search distance and total flown distance separately, or explain which distance feeds the coverage estimate.

**Acceptance check:** Generate a concave polygon producing multiple scan-line intervals. Verify route legs remain within intended segments, jumps are labeled transit, and adding transit distance does not inflate search coverage.

### 5.5 Synthetic battery and mission event model (P0)

- **UR-027 (C-05/C-19/C-20):** Add a deterministic battery state-of-charge series to synthetic telemetry. The model must declare initial charge, nominal drain rule, and any event effects in scenario settings or run metadata.
- **UR-028 (C-20):** Same seed and settings produce identical battery values; changing the seed only changes battery/event variation if the model explicitly uses random variation. Prefer deterministic drain for v0.
- **UR-029 (C-20/C-19):** Provide a configurable reserve threshold (default 25%). When estimated state of charge reaches or crosses the threshold, emit one `battery_reserve` event with timestamp and value.
- **UR-030 (C-19):** Store GPS-quality and battery events as structured events with stable type, start/end timestamps (or event timestamp), severity/state, and human-readable summary. Do not infer events only from UI text.
- **UR-031 (C-21):** Show a mission event timeline/list with event type, time, and short explanation. Clicking an event seeks replay to its timestamp; current event is highlighted during playback.
- **UR-032 (C-08/C-21):** Event highlighting, map marker, elevation profile playhead (when loaded), event list, and mission clock stay synchronized during play, pause, seek, restart, and replay completion.
- **UR-033 (C-09/C-10):** Interpretation may state that the simulated battery crossed its assumed reserve threshold. It must not imply the aircraft actually would return, land, or complete a mission.
- **UR-034 (C-11):** CSV export includes `battery_pct` and event indicator/type fields for each sample where applicable. Export also includes a run-level metadata header or companion JSON recording threshold and event details.

**Acceptance check:** Generate the same run twice and compare battery/event series; verify event time is stable. Set a scenario long enough for reserve crossing and confirm it appears in the timeline, map/replay state, narrative, and CSV. Generate a short run that does not cross reserve and confirm no reserve event is claimed.

### 5.6 Mission report and provenance (P0)

- **UR-035 (C-10/C-14):** Every displayed and exported layer/metric identifies whether it is real source data, synthetic telemetry, or a model assumption.
- **UR-036 (C-10):** The result summary distinguishes (a) geometric route coverage, (b) terrain-only visibility if P1 exists, and (c) actual sensor detection, which is not modeled.
- **UR-037 (C-11/C-14):** Exported run metadata records app/spec version, scenario settings, input filenames/source URLs, seed, dataset provenance, DEM resolution/units/CRS where used, metric method identifiers, synthetic flag, and event configuration.
- **UR-038 (C-14):** README documents any external data source, attribution/license obligations, online service dependency, processing/conversion steps, and limitations.

## 6. Interface/data model additions

Add the following concepts to the current `MissionScenario`, `TelemetrySample`, and `MissionAnalysis` contracts in `POC-SPEC.md`.

### 6.1 Optional layers

```json
{
  "context_layers": [
    {
      "layer_id": "trails-1",
      "type": "trail_context",
      "source_name": "Marin County Trails",
      "source_url": "https://services5.arcgis.com/tdQLEzq0fgVElWN3/ArcGIS/rest/services/MarinCountyTrails/FeatureServer",
      "format": "GeoJSON",
      "attribution": "...",
      "enabled": true
    }
  ],
  "terrain": {
    "loaded": true,
    "source_name": "USGS 3DEP",
    "source_url": "...",
    "format": "GeoTIFF",
    "horizontal_resolution_m": 10,
    "vertical_units": "m",
    "crs": "...",
    "no_data_value": null
  }
}
```

### 6.2 Telemetry and event additions

```json
{
  "timestamp_s": 120,
  "planned_latitude": 37.82,
  "planned_longitude": -122.48,
  "latitude": 37.8201,
  "longitude": -122.4799,
  "altitude_m": 60,
  "position_quality": "degraded",
  "horizontal_uncertainty_m": 10,
  "battery_pct": 72.4,
  "segment_type": "search",
  "events": ["gps_quality_degraded"],
  "synthetic": true
}
```

Run-level `MissionEvent`:

```json
{
  "event_id": "event-002",
  "type": "battery_reserve",
  "timestamp_s": 540,
  "end_timestamp_s": null,
  "severity": "notice",
  "value": 25,
  "unit": "%",
  "summary": "Simulated battery estimate reached the configured reserve threshold.",
  "synthetic": true
}
```

## 7. Implementation guidance and guardrails

- Keep trail geometry and DEM loading optional; the sample mission must still run with neither loaded.
- Avoid direct dependence on a live external GIS API at runtime for the showcase path. Prefer bundled/saved sample data, and provide a local file import path. Live service access can be an optional convenience.
- Use a small clipped DEM to control download and rendering cost. Record provenance and do not commit large raw datasets without checking size and license.
- For browser-side GeoTIFF, use a maintained parser/library or preprocess to a documented compact format. Keep raster dimensions/resolution bounded and guard memory use.
- Separate conversion of geographic coordinates to metric coordinates from Leaflet display coordinates. Never calculate area/distance in degrees.
- Generate the route once, then generate telemetry and events from that canonical route. Metrics, replay, and export must all consume the same run data.
- Keep assumptions and algorithm parameters visible enough that a technical viewer can reproduce the result.
- Do not claim trails are obstacles. If adding actual obstacle polygons later, define a separate data type and avoidance requirement.
- Do not use DEM bare-earth elevation as a proxy for trees/buildings. USGS describes DEMs as bare-earth surfaces; surface objects need separate datasets.

## 8. Updated acceptance checklist

An upgrade is ready for handoff when:

1. **UR-001–UR-008:** User can add/toggle a trail context layer; unsupported input is handled; attribution is visible.
2. **UR-009–UR-016:** User can load a documented DEM; relief/profile render and synchronize; invalid/out-of-coverage inputs fail clearly.
3. **UR-023–UR-026:** Route distinguishes search/transit/turn; coverage uses the declared eligible segment type.
4. **UR-027–UR-034:** Battery values and structured events are deterministic, synchronized in replay, and represented in CSV.
5. **UR-035–UR-038:** Provenance and the difference between route coverage, terrain visibility, and detection are explicit in UI, exports, and README.
6. **P1 only:** **UR-017–UR-022** pass the synthetic-ridge and no-data cases before terrain occlusion is exposed as a result.
7. Original POC acceptance criteria and known correctness issues from [`POC-SPEC.md`](POC-SPEC.md) remain addressed; these upgrades do not substitute for fixing them.

## 9. Handoff note for the coding agent

Read `POC-SPEC.md`, `README.md`, and current source before implementation. Implement P0 in order and report each `UR-###` as done, deferred, or blocked, with the check used to verify it. P1 terrain occlusion is optional; do not ship a misleading or unverified visibility result to make the demo appear more realistic. Update this document if format support, data sources, or behavior changes.

## 10. Implementation status (v0.2.0)

| IDs | Status | Verified by |
|---|---|---|
| UR-001 to UR-008 | Done | `context-layer.test.js`; headless-browser load of the demo trails |
| UR-009 to UR-016 | Done, with a documented format change: `fieldline-dem-v1` JSON, not GeoTIFF (see README conversion steps) | `terrain.test.js`, `profile*.test.js`, `terrain-render.test.js`; headless-browser load of the demo DEM |
| UR-017 to UR-022 (P1) | Deferred; results say terrain visibility is not calculated | n/a |
| UR-023 to UR-026 | Done (typed segments already existed; added separate turn/transit styling, per-type lengths, search vs total distance) | `route-planner.test.js` |
| UR-027 to UR-034 | Done | `events.test.js`, `export.test.js` |
| UR-035 to UR-038 | Done | `export.test.js`, README |

Deviations: no real DEM or real trail dataset is bundled (the Marin service layer queried covers Point Reyes, not the sample area); the bundled demos are labeled synthetic. Loading a new boundary clears the context layers.
