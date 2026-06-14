# -*- coding: utf-8 -*-
"""
gen_scenarios.py — Krok 5: Generátor REÁLNÝCH rodinných dnů z golden datasetu.

Modeluje skutečný život čtyřčlenné rodiny: rodič odveze dítě (spolujízda),
dítě tam zůstane, rodič paralelně jede dál (práce/doktor), druhý rodič mezitím
veze druhé dítě a později vyzvedne první na kroužek (předávka).

Den se zadává jako seznam JÍZD:
    {"depart": minuty, "who": [členové], "from": ref, "to": ref, "mode": ...}
Z jízd se PER ČLEN automaticky odvodí stání (kde kdo mezi jízdami zůstává).
Spolujízda = víc členů v "who" (sdílí trasu i čas). Předávka = dítě je ráno
v jízdě s jedním rodičem a odpoledne s druhým; mezitím stojí na místě.

    python3 gen_scenarios.py [golden_dataset_v2.json] [scenarios_generated.json]
"""

import json
import math
import random
import sys
import unicodedata
from datetime import datetime

HOME = {"name": "Náš domeček", "lat": 50.7793, "lon": 15.0581}

JITTER_M = {"skola": 90, "skolka": 70, "obchod": 110, "kultura": 130, "sport": 100,
            "lekar": 60, "zubar": 60, "lekarna": 50, "zus": 70, "krouzky": 80,
            "logoped": 50, "prace": 70}
ICON = {"skola": "🏫", "skolka": "🧸", "obchod": "🛒", "kultura": "🎭", "sport": "⚽",
        "lekar": "🩺", "zubar": "🦷", "lekarna": "💊", "zus": "🎻", "krouzky": "🎨",
        "logoped": "🗣", "prace": "💼", "home": "🏠"}

AVG_KMH = 24.0


def haversine(lat1, lon1, lat2, lon2):
    R = 6371000.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) *
         math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def travel_min(a, b):
    d_km = haversine(a["lat"], a["lon"], b["lat"], b["lon"]) / 1000.0
    return max(5, round(d_km / AVG_KMH * 60 + 3))


def pick_near(places, category, rng, near, n=1, exclude_ids=None):
    pool = [p for p in places if p["category"] == category and p.get("lat") and p.get("lon")
            and (not exclude_ids or p["id"] not in exclude_ids)]
    if not pool:
        return []
    pool.sort(key=lambda p: haversine(near["lat"], near["lon"], p["lat"], p["lon"]))
    top = pool[:max(n * 4, 8)]
    rng.shuffle(top)
    return top[:n]


DAY_PLANS = {
    "klasicky_den": {
        "title": "Klasický všední den",
        "dayOfWeek": 1,  # pondělí — typický školní/pracovní den
        "desc": "Táta veze Kubíka do školky a jede do práce, máma veze Mišáka do školy "
                "a na nákup; odpoledne předávka — máma vyzvedne Kubíka, táta Mišáka z kroužku.",
        "trips": [
            {"depart": 10,  "who": ["tatka", "kubik"], "from": "home",   "to": "skolka", "mode": "driving-car"},
            {"depart": 28,  "who": ["tatka"],          "from": "skolka", "to": "prace_tatka", "mode": "driving-car"},
            {"depart": 15,  "who": ["mamka", "misak"], "from": "home",   "to": "skola",  "mode": "driving-car"},
            {"depart": 33,  "who": ["mamka"],          "from": "skola",  "to": "obchod", "mode": "driving-car"},
            {"depart": 80,  "who": ["mamka"],          "from": "obchod", "to": "home",   "mode": "driving-car"},
            {"depart": 420, "who": ["mamka"],          "from": "home",   "to": "skola",  "mode": "driving-car"},
            {"depart": 440, "who": ["mamka", "misak"], "from": "skola",  "to": "krouzky","mode": "driving-car"},
            {"depart": 470, "who": ["mamka"],          "from": "krouzky","to": "skolka", "mode": "driving-car"},
            {"depart": 495, "who": ["mamka", "kubik"], "from": "skolka", "to": "home",   "mode": "driving-car"},
            {"depart": 510, "who": ["tatka"],          "from": "prace_tatka", "to": "krouzky", "mode": "driving-car"},
            {"depart": 535, "who": ["tatka", "misak"], "from": "krouzky","to": "home",   "mode": "driving-car"},
        ],
    },
    "den_s_doktorem": {
        "title": "Den s návštěvou lékaře",
        "dayOfWeek": 2,  # úterý — běžný den na objednání k lékaři
        "desc": "Máma vezme Kubíka k pediatrovi a do lékárny, táta odveze Mišáka do školy "
                "a jede do práce; odpoledne táta vyzvedne obě děti.",
        "trips": [
            {"depart": 12,  "who": ["tatka", "misak"], "from": "home",   "to": "skola",  "mode": "driving-car"},
            {"depart": 30,  "who": ["tatka"],          "from": "skola",  "to": "prace_tatka", "mode": "driving-car"},
            {"depart": 20,  "who": ["mamka", "kubik"], "from": "home",   "to": "lekar",  "mode": "driving-car"},
            {"depart": 75,  "who": ["mamka", "kubik"], "from": "lekar",  "to": "lekarna","mode": "driving-car"},
            {"depart": 95,  "who": ["mamka", "kubik"], "from": "lekarna","to": "home",   "mode": "driving-car"},
            {"depart": 430, "who": ["tatka"],          "from": "prace_tatka", "to": "skola", "mode": "driving-car"},
            {"depart": 450, "who": ["tatka", "misak"], "from": "skola",  "to": "sport",  "mode": "driving-car"},
            {"depart": 540, "who": ["tatka", "misak"], "from": "sport",  "to": "home",   "mode": "driving-car"},
        ],
    },
    "krouzkovy_den": {
        "title": "Nabitý kroužkový den",
        "dayOfWeek": 3,  # středa — den nabitý odpoledními kroužky
        "desc": "Obě děti mají odpoledne kroužky na různých místech, oba rodiče se střídají "
                "v odvozech a vyzvedávání, mezitím nákup.",
        "trips": [
            {"depart": 10,  "who": ["mamka", "kubik"], "from": "home",   "to": "skolka", "mode": "driving-car"},
            {"depart": 28,  "who": ["mamka", "misak"], "from": "skolka", "to": "skola",  "mode": "driving-car"},
            {"depart": 45,  "who": ["mamka"],          "from": "skola",  "to": "prace_mamka", "mode": "driving-car"},
            {"depart": 400, "who": ["tatka"],          "from": "home",   "to": "skola",  "mode": "driving-car"},
            {"depart": 420, "who": ["tatka", "misak"], "from": "skola",  "to": "zus",    "mode": "driving-car"},
            {"depart": 450, "who": ["tatka"],          "from": "zus",    "to": "obchod", "mode": "driving-car"},
            {"depart": 490, "who": ["tatka"],          "from": "obchod", "to": "skolka", "mode": "driving-car"},
            {"depart": 512, "who": ["tatka", "kubik"], "from": "skolka", "to": "krouzky","mode": "driving-car"},
            {"depart": 525, "who": ["mamka"],          "from": "prace_mamka", "to": "zus", "mode": "driving-car"},
            {"depart": 550, "who": ["mamka", "misak"], "from": "zus",    "to": "home",   "mode": "driving-car"},
            {"depart": 585, "who": ["tatka", "kubik"], "from": "krouzky","to": "home",   "mode": "driving-car"},
        ],
    },
}

PROFILES = [
    {"id": "strachonovi", "title": "Strachoňovi", "seed": 1, "plans": ["klasicky_den", "krouzkovy_den"]},
    {"id": "novakovi",    "title": "Novákovi",    "seed": 2, "plans": ["klasicky_den", "den_s_doktorem"]},
    {"id": "svobodovi",   "title": "Svobodovi",   "seed": 3, "plans": ["krouzkovy_den", "den_s_doktorem"]},
    {"id": "dvorakovi",   "title": "Dvořákovi",   "seed": 4, "plans": ["klasicky_den", "krouzkovy_den"]},
    {"id": "prochazkovi", "title": "Procházkovi", "seed": 5, "plans": ["den_s_doktorem", "klasicky_den"]},
]

WORK = {
    "prace_tatka": {"name": "Práce – táta", "lat": 50.7665, "lon": 15.0560, "category": "prace"},
    "prace_mamka": {"name": "Práce – máma", "lat": 50.7702, "lon": 15.0820, "category": "prace"},
}


def resolve_places(profile, plans, places):
    rng = random.Random(profile["seed"])
    needed = set()
    for plan_id in plans:
        for trip in DAY_PLANS[plan_id]["trips"]:
            needed.add(trip["from"]); needed.add(trip["to"])
    resolved = {"home": dict(HOME, category="home")}
    used = set()
    fixed_cats = {"skola", "skolka", "zus"}
    for ref in sorted(needed):
        if ref == "home":
            continue
        if ref in WORK:
            resolved[ref] = dict(WORK[ref]); continue
        cat = ref
        sel = pick_near(places, cat, rng, HOME, n=1, exclude_ids=used)
        if not sel:
            resolved[ref] = None; continue
        p = sel[0]
        if cat in fixed_cats:
            used.add(p["id"])
        resolved[ref] = {"name": p["name"], "lat": p["lat"], "lon": p["lon"],
                         "category": cat, "id": p["id"]}
    return resolved


def compile_tracks(plan, resolved):
    members = {}
    for trip in plan["trips"]:
        frm, to = resolved.get(trip["from"]), resolved.get(trip["to"])
        if not frm or not to:
            continue
        dur = travel_min(frm, to)
        for mi, m in enumerate(trip["who"]):
            members.setdefault(m, []).append({
                "depart": trip["depart"], "arrive": trip["depart"] + dur,
                "from": frm, "to": to, "mode": trip["mode"],
            })
    tracks = {}
    for m, trips in members.items():
        trips.sort(key=lambda t: t["depart"])
        segs = []
        for i, t in enumerate(trips):
            segs.append({
                "type": "travel", "startMin": t["depart"],
                "fromLat": round(t["from"]["lat"], 6), "fromLon": round(t["from"]["lon"], 6),
                "lat": round(t["to"]["lat"], 6), "lon": round(t["to"]["lon"], 6),
                "name": t["to"]["name"], "mode": t["mode"],
                "icon": ICON.get(t["to"]["category"], "📍"),
            })
            nxt = trips[i + 1] if i + 1 < len(trips) else None
            stay_start = t["arrive"]
            stay_end = nxt["depart"] if nxt else t["arrive"]
            stay_dur = max(0, stay_end - stay_start)
            if stay_dur >= 5 and t["to"]["category"] != "home":
                cat = t["to"]["category"]
                seg = {"type": "stay", "startMin": stay_start, "durMin": stay_dur,
                       "lat": round(t["to"]["lat"], 6), "lon": round(t["to"]["lon"], 6),
                       "name": t["to"]["name"], "stopJitterM": JITTER_M.get(cat, 80),
                       "icon": ICON.get(cat, "📍"), "category": cat}
                if "id" in t["to"]:
                    seg.update({"truthName": t["to"]["name"], "truthLat": round(t["to"]["lat"], 6),
                                "truthLon": round(t["to"]["lon"], 6), "truthId": t["to"]["id"]})
                segs.append(seg)
        tracks[m] = segs
    return tracks


def build_family(profile, places):
    scenarios = []
    resolved_all = resolve_places(profile, profile["plans"], places)
    for plan_id in profile["plans"]:
        plan = DAY_PLANS[plan_id]
        tracks = compile_tracks(plan, resolved_all)
        if not tracks:
            continue
        n_stays = sum(1 for segs in tracks.values() for s in segs if s["type"] == "stay")
        scenarios.append({
            "id": "%s-%s" % (profile["id"], plan_id),
            "title": "%s — %s" % (profile["title"], plan["title"]),
            "icon": "👨‍👩‍👧‍👦", "type": "family",
            "dayOfWeek": plan.get("dayOfWeek", 1),  # 0=ne,1=po,...,6=so — platnost scénáře
            "tags": ["rodina", profile["id"], plan_id],
            "desc": plan["desc"], "members": sorted(tracks.keys()),
            "tracks": tracks, "_stats": {"stays": n_stays},
        })
    return scenarios


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "golden_dataset_v2.json"
    out = sys.argv[2] if len(sys.argv) > 2 else "scenarios_generated.json"
    with open(src, encoding="utf-8") as f:
        ds = json.load(f)
    places = ds["places"]
    print("→ Načteno %d míst z %s" % (len(places), src))

    all_scenarios = []
    for prof in PROFILES:
        sc = build_family(prof, places)
        all_scenarios += sc
        for s in sc:
            legs = sum(len(t) for t in s["tracks"].values())
            print("  %-30s členů=%d stání=%d segmentů=%d"
                  % (s["title"][:30], len(s["tracks"]), s["_stats"]["stays"], legs))
    for s in all_scenarios:
        s.pop("_stats", None)

    category = {"id": "rodiny", "title": "Rodiny (test)", "icon": "👨‍👩‍👧‍👦",
                "scenarios": all_scenarios}
    result = {"generated": datetime.now().isoformat(), "source": src,
              "note": "Soubezne rodinne dny (type=family, tracks per clen).",
              "category": category}
    with open(out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    print("\n✓ %s — kategorie 'rodiny' s %d rodinnými dny" % (out, len(all_scenarios)))


if __name__ == "__main__":
    sys.exit(main())
