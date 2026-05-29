import json, sys

data = json.load(sys.stdin)
unnamed = [p for p in data if not p.get('name')]
named = [p for p in data if p.get('name')]
print(f"Pojmenovaná: {len(named)}, čekají na pojmenování: {len(unnamed)}")
print()
for p in unnamed:
    print(f"{p['id']}")
    print(f"  návrh:    {p.get('suggestedName', '?')}")
    print(f"  confidence: {p.get('aiConfidence', 0):.2f}")
    print(f"  kdo:      {p.get('detectedBy', '?')}")
    print(f"  souřadnice: {p.get('lat', 0):.5f}, {p.get('lon', 0):.5f}")
    print()
