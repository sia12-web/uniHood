import os
from app.settings import Settings

# Simulate the env var exactly as it is in Render
os.environ["CORS_ALLOW_ORIGINS"] = "https://unihood.app,https://www.unihood.app,https://unihood-frontend.onrender.com"
os.environ["SECRET_KEY"] = "dummy"
os.environ["SERVICE_SIGNING_KEY"] = "dummy"
os.environ["REFRESH_PEPPER"] = "dummy"

try:
    s = Settings()
    print(f"RAW TYPE: {type(s.cors_allow_origins)}")
    print(f"PARSED VALUE: {s.cors_allow_origins}")
    
    expected = ("https://unihood.app", "https://www.unihood.app", "https://unihood-frontend.onrender.com")
    if tuple(s.cors_allow_origins) == expected:
        print("SUCCESS: Parsing works correctly.")
    else:
        print("FAILURE: Parsing mismatch.")
except Exception as e:
    print(f"ERROR: {e}")
