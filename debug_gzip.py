import requests
try:
    response = requests.get("http://localhost:8000/docs", headers={"Accept-Encoding": "gzip"})
    print(f"Status Code: {response.status_code}")
    print(f"Content-Encoding: {response.headers.get('Content-Encoding')}")
except Exception as e:
    print(e)
