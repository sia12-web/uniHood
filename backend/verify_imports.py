
import sys
import os

# Add backend to path
sys.path.append(os.getcwd())

print("Attempting to import app.main...")
try:
    import app.main
    print("Successfully imported app.main")
except Exception as e:
    print(f"Failed to import app.main: {e}")
    import traceback
    traceback.print_exc()

print("Attempting to import app.api.proximity...")
try:
    import app.api.proximity
    print("Successfully imported app.api.proximity")
except Exception as e:
    print(f"Failed to import app.api.proximity: {e}")
    traceback.print_exc()
