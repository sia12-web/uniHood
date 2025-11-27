import urllib.request
import gzip

try:
    req = urllib.request.Request("http://127.0.0.1:8000/docs", headers={"Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req) as response:
        print(f"Status Code: {response.status}")
        print(f"Content-Encoding: {response.headers.get('Content-Encoding')}")
except Exception as e:
    print(e)
