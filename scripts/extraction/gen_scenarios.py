# -*- coding: utf-8 -*-
"""
gen_scenarios.py — Krok 5: Generátor rodinných scénářů z golden datasetu.

Z golden_dataset_v2.json poskládá pro 5 modelových rodin týdenní rutiny
(odvoz do školy/školky → práce → kroužek → nákup → lékař → domů) a vyexportuje
je do scenarios_data.json formátu, který umí přehrát simulační engine.

Každé rodině přiřadí konkrétní místa z datasetu (jejich školka, jejich pediatr...)
deterministicky podle seedu, aby běhy byly opakovatelné. Ke každému kroku přidá
golden truth (truthName, truthLat, truthLon, category) pro pozdější vyhodnocení
detekce, a stopJitterM = realistický rozptyl parkoviště podle kategorie.

    python3 gen_scenarios.py [golden_dataset_v2.json] [vystup.json]
Výstup:
    scenarios_generated.json — nová kategorie "rodiny" se scénáři
    (slouci se do scenarios_data.json pres PUT /scenarios nebo rucne)
"""

import json
import math
import random
import sys
import unicodedata
from datetime import datetime

HOME = {"name": "Náš domeček", "lat": 50.7793, "lon": 15.0581, "icon": "🏠"}

# rozptyl mista zastaveni (parkoviste/vchod) podle kategorie — simuluje stop bod
JITTER_M = {
    "skola": 90, "skolka": 70, "obchod": 110, "kultura": 130, "sport": 100,
    "lekar": 60, "zubar": 60, "lekarna": 50, "zus": 70, "krouzky": 80, "logoped": 50,
}

# typicka delka navstevy v minutach podle kategorie
STAY_MIN = {
    "skola": 5, "skolka": 8, "obchod": 35, "kultura": 110, "sport": 75,
    "lekar": 40, "zubar": 45, "lekarna": 10, "zus": 60, "krouzky": 75, "logoped": 45,
}

ICON = {
    "skola": "🏫", "skolka": "🧸", "obchod": "🛒", "kultura": "🎭", "sport": "⚽",
    "lekar": "🩺", "zubar": "🦷", "lekarna": "💊", "zus": "🎻", "krouzky": "🎨",
    "logoped": "🗣",
}

# ── profily rodin: kdo a jakou ma tydenni rutinu ───────────────────────────────
# clenove: tatka, mamka, misak (starsi - skola), kubik (mladsi - skolka)
PROFILES = [
    {
        "id": "strachonovi", "title": "Strachoňovi (základ)", "seed": 1,
        "desc": "Mišák do školy, Kubík do školky, oba rodiče do práce, odpoledne kroužek a nákup.",
        "days": {
            "po": [("misak", "skola"), ("kubik", "skolka"), ("mamka", "obchod"), ("misak", "krouzky")],
            "ut": [("misak", "skola"), ("kubik", "skolka"), ("kubik", "zus")],
            "st": [("misak", "skola"), ("kubik", "skolka"), ("mamka", "obchod"), ("misak", "sport")],
        },
    },
    {
        "id": "novakovi", "title": "Novákovi (dvě školky)", "seed": 2,
        "desc": "Dvě malé děti ve školkách, máma na rodičovské, časté návštěvy lékárny a pediatra.",
        "days": {
            "po": [("kubik", "skolka"), ("misak", "skolka"), ("mamka", "lekarna"), ("mamka", "obchod")],
            "ut": [("kubik", "skolka"), ("misak", "skolka"), ("kubik", "lekar")],
            "st": [("kubik", "skolka"), ("misak", "skolka"), ("mamka", "obchod")],
        },
    },
    {
        "id": "svobodovi", "title": "Svobodovi (sportovní)", "seed": 3,
        "desc": "Starší dítě intenzivně sportuje, kroužky každý den, k tomu zubař a kultura o víkendu.",
        "days": {
            "po": [("misak", "skola"), ("misak", "sport"), ("mamka", "obchod")],
            "ut": [("misak", "skola"), ("misak", "krouzky"), ("misak", "zubar")],
            "st": [("misak", "skola"), ("misak", "sport")],
            "so": [("mamka", "kultura"), ("tatka", "obchod")],
        },
    },
    {
        "id": "dvorakovi", "title": "Dvořákovi (zaneprázdnění)", "seed": 4,
        "desc": "Oba rodiče pracují, hodně přejezdů, nákupy ve více řetězcích, ZUŠ a logoped.",
        "days": {
            "po": [("kubik", "skolka"), ("misak", "skola"), ("kubik", "zus"), ("mamka", "obchod")],
            "ut": [("kubik", "skolka"), ("misak", "skola"), ("kubik", "logoped"), ("tatka", "obchod")],
            "st": [("kubik", "skolka"), ("misak", "skola"), ("misak", "krouzky"), ("mamka", "lekar")],
        },
    },
    {
        "id": "prochazkovi", "title": "Procházkovi (zdravotní kolečko)", "seed": 5,
        "desc": "Týden s mnoha návštěvami lékařů — pediatr, zubař, lékárna — k otestování detekce ordinací.",
        "days": {
            "po": [("misak", "skola"), ("kubik", "skolka"), ("kubik", "lekar"), ("mamka", "lekarna")],
            "ut": [("misak", "skola"), ("kubik", "skolka"), ("misak", "zubar"), ("mamka", "lekarna")],
            "st": [("misak", "skola"), ("kubik", "skolka"), ("mamka", "lekar"), ("misak", "logoped")],
        },
    },
]

DAY_NAMES = {"po": "Pondělí", "ut": "Úterý", "st": "Středa", "ct": "Čtvrtek",
             "pa": "Pátek", "so": "Sobota", "ne": "Neděle"}


def norm(name):
    n = unicodedata.normalize("NFD", (name or "").lower())
    n = "".join(c for c in n if unicodedata.category(c) != "Mn")
    return n


def haversine(lat1, lon1, lat2, lon2):
    R = 6371000.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def pick_places(places, category, n, rng, near=None):
    """Vybere n míst dané kategorie; pokud near, preferuje bližší (rodina jezdí poblíž domova)."""
    pool = [p for p in places if p["category"] == category and p.get("lat") and p.get("lon")]
    if not pool:
        return []
    if near:
        # vážený výběr: bližší místa pravděpodobnější, ale ne deterministicky nejbližší
        pool.sort(key=lambda p: haversine(near["lat"], near["lon"], p["lat"], p["lon"]))
        # vyber z bližší poloviny + trocha náhody
        top = pool[:max(n * 4, 8)]
        rng.shuffle(top)
        return top[:n]
    rng.shuffle(pool)
    return pool[:n]


def build_step(place, category, rng, mode="driving-car"):
    jitter = JITTER_M.get(category, 80)
    return {
        "name": place["name"],
        "lat": round(place["lat"], 6),
        "lon": round(place["lon"], 6),
        "stayMin": STAY_MIN.get(category, 20),
        "mode": mode,
        "icon": ICON.get(category, "📍"),
        # ── golden truth + simulacni parametry (cte simulator/vyhodnoceni) ──
        "category": category,
        "stopJitterM": jitter,
        "truthName": place["name"],
        "truthLat": round(place["lat"], 6),
        "truthLon": round(place["lon"], 6),
        "truthId": place["id"],
    }


def home_step():
    s = dict(HOME)
    s.update({"stayMin": 0, "mode": "driving-car"})
    return s


def build_family(profile, places):
    rng = random.Random(profile["seed"])
    # přiřaď rodině konkrétní stálá místa (jejich školka, jejich škola...)
    fixed = {}
    for cat, count in [("skola", 1), ("skolka", 1), ("zus", 1)]:
        sel = pick_places(places, cat, count, rng, near=HOME)
        if sel:
            fixed[cat] = sel[0]

    scenarios = []
    for day, errands in profile["days"].items():
        steps = [home_step()]
        for member, cat in errands:
            # stálé místo pokud existuje, jinak vyber blízké
            if cat in fixed:
                place = fixed[cat]
            else:
                sel = pick_places(places, cat, 1, rng, near=HOME)
                if not sel:
                    continue
                place = sel[0]
            steps.append(build_step(place, cat, rng))
        steps.append(home_step())  # návrat domů
        if len(steps) <= 2:
            continue
        scenarios.append({
            "id": "%s-%s" % (profile["id"], day),
            "title": "%s — %s" % (profile["title"], DAY_NAMES.get(day, day)),
            "icon": "👨‍👩‍👧‍👦",
            "tags": ["rodina", profile["id"], day],
            "desc": profile["desc"],
            "steps": steps,
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
        steps_total = sum(len(s["steps"]) for s in sc)
        print("  %s: %d scénářů, %d kroků" % (prof["title"], len(sc), steps_total))

    category = {
        "id": "rodiny",
        "title": "Rodiny (test)",
        "icon": "👨‍👩‍👧‍👦",
        "scenarios": all_scenarios,
    }
    result = {
        "generated": datetime.now().isoformat(),
        "source": src,
        "note": "Vygenerovane rodinne scenare. Kazdy krok ma truthName/truthLat/truthLon "
                "pro vyhodnoceni detekce + stopJitterM (rozptyl parkoviste).",
        "category": category,
    }
    with open(out, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)

    print("\n✓ %s — kategorie 'rodiny' s %d scénáři" % (out, len(all_scenarios)))
    print("  Sloučení do scenarios_data.json: viz merge_scenarios.py nebo rucne pres /scenarios")


if __name__ == "__main__":
    sys.exit(main())
