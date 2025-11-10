# Audit & Alerts

- Log audit for all signed writes:
  - event: "<router>.<action>"
  - user_id, session_id, ip, ua, intent_nonce, idem_key?
- Metrics:
  - intents_verified_total
  - intents_failed_sig_total
  - intents_replay_total
- Alert when failure ratio > 2% over 5m or replay spikes.
