from fastapi import FastAPI
import uvicorn
import os

# Test importing main dependencies one by one
# from app.infra import postgres
# from app.settings import settings

import socketio
from app.domain.proximity.sockets import PresenceNamespace

app = FastAPI()

# Add minimal Socket.IO
# Reproduce main.py strict origins
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins=["http://localhost:3000"]) 
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

@app.middleware("http")
async def debug_logging_middleware(request, call_next):
    print(f"DEBUG: Request started: {request.method} {request.url}")
    try:
        response = await call_next(request)
        print(f"DEBUG: Request finished: {request.method} {request.url} - Status: {response.status_code}")
        return response
    except Exception as e:
        print(f"DEBUG: Request failed: {request.method} {request.url} - Error: {e}")
        raise

# Import routers to see if they break things
from app.api import auth
app.include_router(auth.router)
from app.api import profile
app.include_router(profile.router)

@app.get("/")
def read_root():
    return {"Hello": "Debug World"}

@app.get("/health")
def health():
    return {"status": "ok"}
