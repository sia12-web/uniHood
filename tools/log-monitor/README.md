# Docker Log Monitor

Real-time log monitoring and alerting for Docker containers.

## Features

- **Real-time Log Streaming**: Attaches to container logs via Docker API
- **Pattern Matching**: Configurable regex patterns for ERROR, WARNING, CRITICAL
- **Multi-container Support**: Monitor all containers or filter by prefix/name
- **Alerting**: Slack, generic webhooks, or console output
- **Metrics Monitoring**: CPU, memory, and restart detection
- **Rate Limiting**: Debounce and rate limit to prevent alert fatigue

## Quick Start

### Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run with defaults (monitors unihood-* containers)
python monitor.py

# Monitor specific containers
python monitor.py -c unihood-backend unihood-activities

# Monitor all containers with a prefix
python monitor.py -p myapp-
```

### Docker Compose

Add to your `docker-compose.yml`:

```yaml
log-monitor:
  build: ./tools/log-monitor
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock:ro
  environment:
    CONTAINER_PREFIX: unihood-
    CONSOLE_ONLY: "true"
    # SLACK_WEBHOOK: https://hooks.slack.com/services/...
  depends_on:
    - backend
    - activities
```

## Configuration

Copy `.env.example` to `.env` and customize:

| Variable | Default | Description |
|----------|---------|-------------|
| `SLACK_WEBHOOK` | - | Slack webhook URL |
| `ALERT_WEBHOOK` | - | Generic webhook URL |
| `CONSOLE_ONLY` | `true` | Print alerts to console |
| `CONTAINER_PREFIX` | `unihood-` | Filter containers by prefix |
| `MONITOR_CONTAINERS` | - | Specific containers to monitor |
| `CPU_THRESHOLD` | `80` | CPU % threshold for alerts |
| `MEMORY_THRESHOLD` | `85` | Memory % threshold for alerts |

## CLI Options

```
python monitor.py --help

Options:
  -c, --containers   Specific container names to monitor
  -p, --prefix       Container name prefix filter
  -t, --tail         Historical log lines to process (default: 100)
  --no-metrics       Disable metrics monitoring
  -v, --verbose      Verbose output
```

## Pattern Matching

Default error patterns:
- `ERROR`, `Exception`, `CRITICAL`, `FATAL`
- `Traceback (most recent call last)`
- `panic:`, `failed to`, `connection refused`, `timeout`

Patterns can be customized in `config.py` or via the `PatternMatcher` class.
