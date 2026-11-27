# Customer and worksite points in both tracking views

Both tracking views show every known place, including both REV sites. Journeys split after **20 minutes** of GPS-confirmed parking; the last valid stationary report remains the end marker, with gaps still handled independently. This change recomputes derived history without altering native Traccar GPS records.

## Address recovery and future persistence

The old Google validation flow returned a coordinate preview but saved only the accepted address text. This release preserves that validation flow and adds a separate durable point store for the Mapbox tracking map.

`TrackingAddressLocation` is keyed by SHA-256 of the normalized Colombian address. Active customer billing addresses and active linked worksites are grouped; existing worksite coordinates are reused. The background synchronizer runs once per minute, serializes its own runs and uses an atomic database claim to avoid duplicate provider requests across replicas. Inactive/deleted or edited sources disappear from the projected map; historical cache entries do not create orphan markers. Marker IDs cannot collide with native Traccar geofence IDs. Automatic points use a 50 m radius for proximity recognition.

`TRACKING_CUSTOMER_GEOCODING_ENABLED=true` explicitly enables Mapbox Geocoding v6 with `permanent=true`, `autocomplete=false`, country `co`, address-only results. A dedicated `TRACKING_GEOCODING_TOKEN` can be supplied; otherwise the existing Mapbox public token is used only from the server. Without enablement, no address is submitted and existing coordinates still appear. The map never calls a geocoding API directly.

Only confident address results with matched street, number and city in Colombia are accepted; city/street centroids, distant ambiguous alternatives and approximate coordinates remain `needs_review`. Transient failures wait at least a day, with at most three attempts per unchanged address; rejected account credentials stop requests for a day. Permanent results and ambiguous results are not queried repeatedly. A changed address gets a new key. No Google fallback or paid road-matching calls are introduced.

Future `Revisar con Maps` validations keep the Google preview, while persisting the permanent map point under both written and normalized spellings. Keeping the written address or accepting the suggested address therefore reuses the saved map location. Failure to persist a point does not invalidate Google's valid address response. The map shows located/pending/review counts, and opening either view does not trigger another provider lookup.

Google Address Validation coordinates are not imported into the Mapbox map: its documented map-display restriction requires Google Maps and its coordinates have a limited caching period. Only existing user-managed worksite coordinates or permanent Mapbox results are used for automatic tracking pins.

References: https://developers.google.com/maps/documentation/address-validation/policies ; https://docs.mapbox.com/api/search/geocoding/ ; https://www.mapbox.com/pricing . Permanent geocoding is a separate product from map display. Price observed 2026-11-27: $5/1000, approximately $0.73 for 146 distinct initial addresses before any free credit/discount; actual bill depends on account configuration and accepted provider requests.

## Verification

Run the address parser, synchronization, persistence, validation and 19/20-minute journey boundary tests, plus API/web builds and runtime checks. The additive migration creates only the new address cache table and index; customer addresses, inventory, attendance coordinates, native places and GPS are not rewritten by recovery. Production activation requires explicit authorization of address submission and permanent geocoding usage.
