
import sys
import os
import traceback
import importlib

# Add backend to path
sys.path.append(os.getcwd())

MODULES_TO_CHECK = [
    "app.main",
    "app.api.auth",
    "app.api.profile",
    "app.api.social",
    "app.api.chat",
    "app.api.leaderboards",
    "app.api.proximity",
    "app.api.discovery",
    "app.api.activities",
    "app.api.rooms",
    "app.api.meetups",
    "app.api.notifications", # Might not exist as router?
    "app.domain.social.service",
    "app.domain.chat.service",
    "app.domain.leaderboards.service",
    "app.domain.proximity.service",
]

print("=== Starting Backend Health Check ===")
failures = []

for module_name in MODULES_TO_CHECK:
    print(f"Checking {module_name}...", end=" ")
    try:
        importlib.import_module(module_name)
        print("OK")
    except ImportError as e:
        if "No module named" in str(e) and "notifications" in module_name:
             print("SKIPPED (Optional)")
        else:
            print("FAILED")
            failures.append((module_name, str(e)))
            print(f"  Error: {e}")
    except Exception as e:
        print("CRASHED")
        failures.append((module_name, str(e)))
        # traceback.print_exc() 
        print(f"  Error: {e}")

print("\n=== Validation Summary ===")
if failures:
    print(f"Found {len(failures)} issues:")
    for mod, err in failures:
        print(f"  - {mod}: {err}")
    sys.exit(1)
else:
    print("All critical modules imported successfully.")
    sys.exit(0)
