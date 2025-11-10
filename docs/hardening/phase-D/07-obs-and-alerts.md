# Observability and Alerts (Phase D)

## Metrics
- `presence_online_gauge` by campus
- `presence_hb_miss_count`
- `nearby_queries_total`, `nearby_results_avg`, `rate_limited_total`

## Logging
- Logs always include `request_id` if routed via ASGI (for socket, include sid, user_id, session_id).
