FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Poetry
RUN curl -sSL https://install.python-poetry.org | python3 -
ENV PATH="/root/.local/bin:$PATH"

# Copy dependency files (repo is a monorepo; build context is repo root)
COPY backend/pyproject.toml ./pyproject.toml

# Install dependencies
RUN poetry config virtualenvs.create false \
    && poetry install --no-root --no-interaction --no-ansi

# Copy backend code
COPY backend/ ./

# Copy shared DB migration runner + SQL migrations
COPY scripts/ ./scripts/
COPY infra/migrations/ ./infra/migrations/

# Expose port
EXPOSE 8000

# Command to run the application
CMD ["uvicorn", "app.main:socket_app", "--host", "0.0.0.0", "--port", "8000"]
