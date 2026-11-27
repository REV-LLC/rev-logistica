# Customer coordinates and both tracking views

Both views show REV sites, manually saved places and automatic points from active customer billing addresses and linked worksites. Journeys now split after **20 minutes** of GPS-confirmed parking; signal gaps remain independent. Native GPS, customer address text and attendance coordinates are not rewritten.

The Google validation flow previously returned coordinates for a preview but saved only text. It now stores the same response in `TrackingAddressLocation`, under both written and suggested address keys, without a second provider request. `TrackingAddressStoreService` is shared by future validations and the authorized recovery worker. No Mapbox Geocoding code or token is used; Mapbox remains the cartography renderer.

`TRACKING_CUSTOMER_GEOCODING_ENABLED=true` enables background lookup of missing/new customer addresses through the existing Google Address Validation API and `GOOGLE_MAPS_API_KEY`. The synchronizer runs once per minute, serializes its runs and uses atomic database claims across replicas. Unchanged located/review results are reused. Transient failures wait at least a day, capped at three attempts per unchanged address; provider failures stop the batch and impose a cooldown. Opening a map never calls Google.

Cache keys are SHA-256 of normalized Colombian addresses. Existing manually managed worksite coordinates take precedence. Google coordinates, place ID, precision and expiry are preserved. Coordinate geometry expires after 30 days, is removed and can be refreshed by the worker. Place IDs remain available. Old or inactive sources disappear from the map even if a cache entry still exists.

Predio/subpredio and premise-proximity results are normal pins. Google ROUTE/OTHER results remain available as amber `?` pins labeled approximate. Approximate pins do not trigger the 50 m known-place recognition. Missing/out-of-country coordinates are not plotted. Co-located customer points share a marker and retain their names. Counters describe source addresses, not the merged marker count.

## Recovery

On 2026-11-27 the user explicitly requested a mechanical Google API pass over existing validated addresses. The recovery script records the completed Google responses in a protected local JSON checkpoint and resumes without re-querying completed keys. Import that checkpoint into the new cache only after its additive migration has completed; enable the background worker after import to avoid duplicate initial requests. The checkpoint and all credentials must remain outside Git/build artifacts/logs. Initial measured results: 145 normalized unique addresses, 145 returned coordinates, 0 errors; 105 premise/subpremise/proximity and 40 general results. Actual map counts include any existing manually managed coordinates and active-source changes.

Verification: API/web builds, address synchronization/persistence tests, Google validation regressions, 19/20-minute stop boundaries, runtime import check, and production checks of both views. The migration creates only the address cache and its status index.
