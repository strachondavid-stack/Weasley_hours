import json, sys

data = json.load(sys.stdin)
logs = data.get('logs', data) if isinstance(data, dict) else data

for l in logs:
    print(json.dumps(l, ensure_ascii=False, indent=2))
    print()
