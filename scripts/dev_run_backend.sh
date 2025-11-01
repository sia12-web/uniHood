#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."/backend
poetry run uvicorn app.main:socket_app --host 0.0.0.0 --port 8000 --reload
