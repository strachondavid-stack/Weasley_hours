# -*- coding: utf-8 -*-
"""
extract_liberec.py — Krok 1: Extrakce rodinných POI pro Liberec z OpenStreetMap.

Stáhne přes Overpass API všechny kategorie míst, která rodiny navštěvují
(školy, školky, lékaři, zubaři, lékárny, obchody, kultura, sport),
normalizuje je, deduplikuje a uloží jako golden_dataset_v0.json.

Spuštění (NAS nebo PC s internetem, žádné závislosti):
    python3 extract_liberec.py
Výstup:
    golden_dataset_v0.json   — normalizovaný dataset (tier B = jen OSM)
    raw_osm/<kategorie>.json — surová OSM data pro audit
"""

import json
import math
import os
import re
import sys
import time
import unicodedata
import urllib.request
import urllib.parse
from datetime import datetime, timezone

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

AREA = 'area["name"="Liberec"]["boundary"="administrative"]["admin_level"="8"]->.a;'

# kategorie: (id, overpass filtry, default radius geofence v metrech, ikona)
CATEGORIES = [
    ("skola", [
        'nwr["amenity"="school"](area.a);',
    ], 180, "🏫"),
    ("skolka", [
        'nwr["amenity"="kindergarten"](area.a);',
    ], 120, "🧸"),
    ("lekar", [
        'nwr["amenity"~"^(doctors|clinic|hospital)$"](area.a);',
        'nwr["healthcare"~"^(doctor|clinic|hospital|centre)$"](area.a);',
    ], 90, "🩺"),
    ("zubar", [
        'nwr["amenity"="dentist"](area.a);',
        'nwr["healthcare"="dentist"](area.a);',
    ], 70, "🦷"),
    ("lekarna", [
        'nwr["amenity"="pharmacy"](area.a);',
    ], 70, "💊"),
    ("obchod", [
        'nwr["shop"~"^(supermarket|mall|department_store)$"](area.a);',
    ], 140, "🛒"),
    ("kultura", [
        'nwr["amenity"~"^(cinema|theatre|arts_centre|library)$"](area.a);',
        'nwr["tourism"~"^(zoo|museum|aquarium|theme_park|gallery)$"](area.a);',
        'nwr["leisure"="water_park"](area.a);',
    ], 150, "🎭"),
    ("sport", [
        'nwr["leisure"~"^(sports_centre|sports_hall|swimming_pool|ice_rink|fitness_centre|stadium)$"](area.a);',
        'nwr["sport"="climbing"]["leisure"](area.a);',
    ], 130, "⚽"),
]


def overpass(filters):
    """Spustí Overpass dotaz, zkusí mirror při selhání."""
    body = "[out:json][timeout:90];" + AREA + "(" + "".join(filters) + ");out center tags;"
    data = urllib.parse.urlencode({"data": body}).encode("utf-8")
    last_err = None
    for url in OVERPASS_URLS:
        try:
            req = urllib.request.Request(url, data=data, headers={
                "User-Agent": "WeasleyHours-dataset/1.0 (family test data, contact: github strachondavid-stack)"
            })
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            last_err = e
            print("  ! %s selhal: %s — zkouším další mirror" % (url, e))
            time.sleep(5)
    raise RuntimeError("Vsechny Overpass servery selhaly: %s" % last_err)


def norm_name(name):
    """Normalizace názvu pro dedup/porovnání: lowercase, bez diakritiky a interpunkce."""
    n = unicodedata.normalize("NFD", name.lower())
    n = "".join(c for c in n if unicodedata.category(c) != "Mn")
    n = re.sub(r"[^a-z0-9 ]+", " ", n)
    return re.sub(r"\s+", " ", n).strip()


def haversine(lat1, lon1, lat2, lon2):
    R = 6371000.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def element_coords(el):
    if el["type"] == "node":
        return el.get("lat"), el.get("lon")
    c = el.get("center") or {}
    return c.get("lat"), c.get("lon")


def build_address(tags):
    street = tags.get("addr:street", "")
    num = tags.get("addr:housenumber", "")
    city = tags.get("addr:city", "Liberec")
    if street and num:
        return "%s %s, %s" % (street, num, city)
    if street:
        return "%s, %s" % (street, city)
    return ""


def main():
    os.makedirs("raw_osm", exist_ok=True)
    places = []
    seq = 0

    for cat_id, filters, radius, icon in CATEGORIES:
        print("→ Stahuji kategorii: %s" % cat_id)
        data = overpass(filters)
        with open("raw_osm/%s.json" % cat_id, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        elements = data.get("elements", [])
        named = 0
        for el in elements:
            tags = el.get("tags") or {}
            name = (tags.get("name") or "").strip()
            if not name:
                continue  # bez názvu je POI pro golden dataset k ničemu
            lat, lon = element_coords(el)
            if lat is None or lon is None:
                continue
            named += 1
            seq += 1
            places.append({
                "id": "lbc_%s_%04d" % (cat_id, seq),
                "name": name,
                "category": cat_id,
                "icon": icon,
                "lat": round(lat, 6),
                "lon": round(lon, 6),
                "address": build_address(tags),
                "radius": radius,
                "tier": "B",
                "sources": ["osm"],
                "osm": "%s/%s" % (el["type"], el["id"]),
                "osm_tags": {k: v for k, v in tags.items()
                             if k in ("amenity", "shop", "leisure", "tourism", "healthcare",
                                      "operator", "opening_hours", "website", "isced:level")},
                # doplní se ručně z leteckého snímku (kde rodina reálně zastaví):
                "stop_lat": None,
                "stop_lon": None,
            })
        print("  %d prvků, z toho %d pojmenovaných" % (len(elements), named))
        time.sleep(3)  # slušnost vůči Overpass

    # ── Deduplikace ──────────────────────────────────────────────────────
    # 1) stejný normalizovaný název do 100 m → jeden záznam (way má přednost před node)
    # 2) napříč kategoriemi: lékař vs zubar se stejným názvem do 50 m → nechat oba? ne, zubar má přednost
    print("\n→ Deduplikace (%d záznamů před)..." % len(places))
    cat_priority = {c[0]: i for i, c in enumerate(CATEGORIES)}
    kept = []
    for p in sorted(places, key=lambda x: (norm_name(x["name"]), 0 if x["osm"].startswith("way") else 1)):
        dup = None
        pn = norm_name(p["name"])
        for k in kept:
            if norm_name(k["name"]) == pn and haversine(p["lat"], p["lon"], k["lat"], k["lon"]) < 100:
                dup = k
                break
        if dup:
            if "osm_dups" not in dup:
                dup["osm_dups"] = []
            dup["osm_dups"].append(p["osm"])
            # specifičtější kategorie vyhrává (zubar > lekar)
            if cat_priority.get(p["category"], 99) > cat_priority.get(dup["category"], 99):
                dup["category"] = p["category"]
        else:
            kept.append(p)
    print("  %d záznamů po deduplikaci" % len(kept))

    # ── Souhrn ───────────────────────────────────────────────────────────
    counts = {}
    for p in kept:
        counts[p["category"]] = counts.get(p["category"], 0) + 1
    print("\nSouhrn podle kategorií:")
    for c, _, _, icon in CATEGORIES:
        print("  %s %-10s %3d" % (icon, c, counts.get(c, 0)))

    out = {
        "version": "v0-osm",
        "generated": datetime.now(timezone.utc).isoformat(),
        "city": "Liberec",
        "note": "Tier B = jen OSM. Spust validate_places.py pro krizovou kontrolu pres Google Places (/nearby).",
        "places": kept,
    }
    with open("golden_dataset_v0.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("\n✓ Uloženo: golden_dataset_v0.json (%d míst)" % len(kept))


if __name__ == "__main__":
    sys.exit(main())
