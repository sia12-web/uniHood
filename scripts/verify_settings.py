
import json
import os

def verify():
    with open('.vscode/settings.json', 'r') as f:
        content = f.read() # Read as string to check comments too if any, though standard json load might fail with comments
    
    # Simple string check for legacy names
    if 'Divan' in content:
        print("Found 'Divan' in settings.json")
    else:
        print("No 'Divan' in settings.json")
        
    if 'Radius' in content:
        print("Found 'Radius' in settings.json")
    else:
        print("No 'Radius' in settings.json")

    if 'uniHood' in content:
        print("Found 'uniHood' in settings.json")

if __name__ == "__main__":
    verify()
