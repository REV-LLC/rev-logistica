# REV tracking: Mapbox and private Valhalla

The tracking release preserves Traccar ingestion, original positions and its database. Mapbox GL JS only renders cartography. Matching uses the same Valhalla 3.9.3 block matching, validation, discontinuity handling and incremental cache tested in the local demo. There are no Google tracking loaders, Roads adapters, route planning or ETA calls.

The default view shows clients and live assets. Vehicle view adds colored history, journeys, sites and a journey selector beside the period. The separate known-places management section is removed. Native Traccar remains accessible with the existing authenticated integration.

## Runtime

- API: `MAPBOX_ACCESS_TOKEN` must be public (`pk.`); secret Mapbox tokens are never returned.
- API: `TRACKING_VALHALLA_URL=http://tracking-valhalla.railway.internal:8002`. The URL is restricted to Railway internal/loopback hosts and is never returned to browsers.
- Railway service `tracking-valhalla`: official image `ghcr.io/valhalla/valhalla-scripted@sha256:ef30a71658c1b372d301153c35cf31fccaf90d817e7815d12200b6354fb4f805`, persistent `/custom_files`, Colombia OpenStreetMap graph. No public domain or TCP proxy.
- Variables: `server_threads=2`, `build_elevation=False`, `build_time_zones=False`, `use_default_speeds_config=False`, `tile_urls=https://download.geofabrik.de/south-america/colombia-latest.osm.pbf`.
- Native GPS data, JWTs, Traccar passwords and session cookies never become matching usage logs. Only GPS coordinates and times required for matching are sent over the private network to Valhalla.

`/tracking/events`, `/tracking/fleet`, `/tracking/history`, `/tracking/map-config`, `/tracking/map-matching` and `/tracking/matching-usage` require active ADMIN/OFFICE access. The existing fetch-based SSE stream sends the REV Bearer token as a header, with reconnect and authorization rechecks. The local no-login server is not deployed.

`apps/api/src/tracking/engine/tracking-policy.json` declares vehicles 2 (GVU047) and 3 (ZNN938). New IDs default to machinery; register future road vehicles explicitly. Vehicle processing is continuous Mon–Fri 07:30–12:00 and 13:00–16:00; Sat 07:00–11:00, America/Bogota. Other times and all machinery: 30 seconds. Machines keep original GPS, with no road matching. This controls REV processing and publication, not device upload configuration.

History reads a bounded selected day from Traccar within the 30-day window. It does not ship the demo's SQLite archive or load all 30 days into Node memory. Concurrent reads reuse a short bounded cache, invalidated by new device positions. Stops still require 15 minutes of GPS evidence; signal gaps are independent. Traccar is the durable system of record; API restarts do not erase history. Retention in Traccar is preserved by its existing configuration.

Matching block cache is in memory for 15 minutes, maximum 256 blocks; completed blocks are reused and only the tail is updated. Failed matches expire after 10 seconds, expose raw GPS as a dashed reference, and never fall back to a paid matching provider. Postgres TrackingUsage holds daily aggregate calls, latency, success/error and map configuration openings; these counters are not invoices.

## Validation and recovery

Run API/web builds, existing Jest and web regressions, and `node --test apps/api/test/tracking-engine/*.test.cjs`. CI runs the matching and schedule regressions. Nest copies the CJS engine and policy into `dist/src/tracking/engine`; runtime import verification exercises the actual artifact.

Verify motor `/status` internally, both active device histories, matching source `valhalla`, unauthorized requests rejected, map cartography on the production domain and SSE updates. Keep the existing API image promotion staging gate. On failure restore the previous API image and web deployment; no schema migration or GPS mutation is required by this release. Preserve the engine volume and Traccar records.
