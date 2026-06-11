# -*- coding: utf-8 -*-
"""
validate_places.py — Krok 2: Křížová validace OSM datasetu přes Google Places.

Pro každé místo z golden_dataset_v0.json zavolá /nearby endpoint Weasley serveru
(který používá tvůj Google Places API klíč) a porovná názvy fuzzy matchingem.

  shoda názvu do 120 m   → tier A  (ověřeno dvěma nezávislými zdroji)
  žádná shoda            → tier B  (zůstává, na ruční kontrolu)
  Google má jiný název   → tier B + poznámka do review reportu

Spuštění na NAS:
    python3 validate_places.py [http://localhost:3000]
Výstup:
    golden_dataset_v1.json — dataset s tiery A/B
    review_report.txt      — seznam míst na ruční kontrolu (Mapy.cz letecký snímek)
"""

import json
import re
import sys
import time
import unicodedata
import urllib.request
import urllib.parse

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
MATCH_DIST = 120          # m — kandidát z Google musí být do této vzdálenosti
SLEEP = 0.4               # s mezi voláními (šetří Google kvótu i server)

STOPWORDS = {"zs", "ms", "zakladni", "materska", "skola", "skolka", "mudr", "s", "r", "o",
             "a", "the", "liberec", "pobocka", "ordinace", "centrum"}


def norm(name):
    n = unicodedata.normalize("NFD", (name or "").lower())
    n = "".join(c for c in n if unicodedata.category(c) != "Mn")
    n = re.sub(r"[^a-z0-9 ]+", " ", n)
    return re.sub(r"\s+", " ", n).strip()


def tokens(name):
    return set(t for t in norm(name).split() if len(t) > 1 and t not in STOPWORDS)


def names_match(a, b):
    """Fuzzy shoda: substring nebo překryv tokenů >= 50 %."""
    na, nb = norm(a), norm(b)
    if not na or not nb:
        return False
    if na in nb or nb in na:
        return True
    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return False
    overlap = len(ta & tb) / min(len(ta), len(tb))
    return overlap >= 0.5


def nearby(lat, lon, radius):
    url = "%s/nearby?%s" % (BASE, urllib.parse.urlencode(
        {"lat": lat, "lon": lon, "radius": radius}))
    with urllib.request.urlopen(url, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8")).get("places", [])


def main():
    with open("golden_dataset_v0.json", encoding="utf-8") as f:
        ds = json.load(f)

    places = ds["places"]
    total = len(places)
    tier_a = 0
    review = []
    errors = 0

    for i, p in enumerate(places, 1):
        try:
            cands = nearby(p["lat"], p["lon"], MATCH_DIST)
        except Exception as e:
            errors += 1
            p["google"] = {"error": str(e)}
            print("[%3d/%d] %-40s ! chyba: %s" % (i, total, p["name"][:40], e))
            time.sleep(SLEEP)
            continue

        match = None
        for c in cands:
            if c.get("dist", 9999) <= MATCH_DIST and names_match(p["name"], c.get("name", "")):
                match = c
                break

        if match:
            p["tier"] = "A"
            p["sources"] = sorted(set(p.get("sources", []) + ["google"]))
            p["google"] = {"name": match["name"], "dist": match["dist"],
                           "type": match.get("primaryType", "")}
            tier_a += 1
            print("[%3d/%d] %-40s ✓ A (%s, %dm)" % (i, total, p["name"][:40],
                                                    match["name"][:30], match["dist"]))
        else:
            near = cands[0] if cands else None
            p["google"] = ({"nearest": near["name"], "dist": near["dist"]}
                           if near else {"nearest": None})
            review.append(p)
            print("[%3d/%d] %-40s ? B (nejblíž: %s)" % (
                i, total, p["name"][:40], near["name"][:30] if near else "nic"))
        time.sleep(SLEEP)

    ds["version"] = "v1-validated"
    ds["validation"] = {"tier_a": tier_a, "tier_b": total - tier_a, "errors": errors,
                        "match_dist_m": MATCH_DIST}
    with open("golden_dataset_v1.json", "w", encoding="utf-8") as f:
        json.dump(ds, f, ensure_ascii=False, indent=1)

    with open("review_report.txt", "w", encoding="utf-8") as f:
        f.write("Místa tier B na ruční kontrolu (%d) — ověř na Mapy.cz leteckém snímku:\n\n" % len(review))
        for p in review:
            g = p.get("google", {})
            f.write("%-12s %-45s %.6f,%.6f  | Google nejblíž: %s\n" % (
                p["category"], p["name"][:45], p["lat"], p["lon"],
                g.get("nearest") or "nic"))

    print("\n✓ Hotovo: tier A=%d, tier B=%d, chyb=%d (z %d)" % (tier_a, total - tier_a, errors, total))
    print("✓ golden_dataset_v1.json + review_report.txt")


if __name__ == "__main__":
    main()
