FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY *.py .

# Labels
LABEL maintainer="uniHood Team"
LABEL description="Docker Log Monitoring & Alerting Agent"

# Run as non-root user
RUN useradd -m -s /bin/bash monitor
USER monitor

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import docker; docker.from_env().ping()" || exit 1

ENTRYPOINT ["python", "monitor.py"]
