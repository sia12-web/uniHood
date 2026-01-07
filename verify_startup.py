
import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

try:
    print("Attempting to import app.main...")
    from app.main import socket_app
    print("Import successful!")
    print(f"socket_app: {socket_app}")
except Exception as e:
    print("Import failed!")
    import traceback
    traceback.print_exc()
    sys.exit(1)
