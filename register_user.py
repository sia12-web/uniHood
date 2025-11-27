import urllib.request
import json

url = "http://localhost:8000/auth/register"
data = {
    "email": "testuser2@example.com",
    "password": "password123",
    "handle": "testuser2",
    "display_name": "Test User 2",
    "campus_id": "33333333-3333-3333-3333-333333333333"
}

req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers={'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(req) as response:
        print(response.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print(f"HTTP Error: {e.code}")
    print(e.read().decode('utf-8'))
