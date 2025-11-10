# Nearby Engine (Phase D)

## Search Radius
- If `radius_m <= 10`, bump to `settings.proximity_min_search_radius_10m` (default 15m) to absorb GPS jitter.
- Use Redis GEOSEARCH by campus key with WITHDIST, radius = max(requested_radius, min_search_radius_if_any).

## Post-filter
- Exclude self, exclude ghosted, ensure `presence:{id}` exists.
- Sort by ascending distance; keyset paginate with opaque cursor `base64({ dist, user_id })`.
