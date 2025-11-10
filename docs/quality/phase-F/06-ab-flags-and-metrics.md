# Flags
- feed.rank.v1.enabled (bool)
- feed.rank.v1.coeff (object {alpha,beta,gamma,delta,epsilon,zeta})
- search.rank.coeff (object {ts,trgm,recency})
- search.beta.multisource (bool)
- anti_gaming.enabled (bool)

# Metrics (Prometheus)
- feed_rank_candidates_total
- feed_rank_duration_ms (histogram)
- feed_rank_score_avg
- search_queries_total{type=...}
- search_results_avg{type=...}
- search_duration_ms
- anti_gaming_flags_total{reason=...}
