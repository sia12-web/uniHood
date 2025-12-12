
import json
import os

def verify():
    with open('.vscode/mcp.json', 'r') as f:
        data = json.load(f)
    
    servers = data.get('servers', {})
    
    # Check Postgres
    pg = servers.get('postgres', {})
    args = pg.get('args', [])
    pg_url = next((arg for arg in args if 'postgresql://' in arg), None)
    if pg_url:
        print(f"Postgres URL: {pg_url}")
        if '/unihood' in pg_url:
            print("Postgres URL is correct.")
        else:
            print("Postgres URL is WRONG.")
    
    # Check Filesystem if exists
    fs = servers.get('filesystem', {})
    if fs:
        args = fs.get('args', [])
        path = args[0] if args else "N/A"
        print(f"Filesystem Path: {path}")
        if 'uniHood' in path or 'unihood' in path:
             print("Filesystem path appears correct.")
    
    print("Done.")

if __name__ == "__main__":
    verify()
