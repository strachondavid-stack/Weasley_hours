# -*- coding: utf-8 -*-
"""
registry_merge.py — Krok 3: Oficiální registry (NRPZS + MŠMT) → doplnění datasetu.

1. NRPZS (ÚZIS) — všechna místa poskytování zdravotních služeb v Liberci,
   filtr na rodinně relevantní obory. CSV obsahuje GPS přímo z RÚIAN.
2. MŠMT rejstřík škol — kompletní seznam škol/školek/ZUŠ/DDM pro Liberec
   (ze zákona úplný). Chybějící místa se geokódují přes Nominatim (RÚIAN adresy).
3. Diff proti golden_dataset_v1.json:
   - shoda (název nebo <150 m) → přidá zdroj "registr", tier A
   - chybí v datasetu        → přidá se jako nové místo

Spuštění:
    python3 registry_merge.py
Výstup:
    golden_dataset_v2.json — sloučený dataset
    registry_report.txt    — co se doplnilo / povýšilo, per kategorie
"""

import csv
import io
import json
import math
import re
import sys
import time
import unicodedata
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

NRPZS_CSV = ("https://datanzis.uzis.gov.cz/data/NR-01-NRPZS/NR-01-06/"
             "Otevrena-data-NR-01-06-nrpzs-mista-poskytovani-zdravotnich-sluzeb.csv")
MSMT_XML = "https://rejstriky.msmt.cz/opendata/vrejcz051.xml"   # Liberecky kraj CZ051
NOMINATIM = "https://nominatim.openstreetmap.org/search"
UA = "WeasleyHours-dataset/1.0 (family test data, github strachondavid-stack)"

OBEC = "Liberec"
MATCH_DIST = 150  # m — registrove misto do teto vzdalenosti od existujiciho = stejne misto

# rodinne relevantni obory pece z NRPZS → nase kategorie
OBORY = [
    ("praktické lékařství pro děti a dorost", "lekar",   "🩺", 80),
    ("pediatrie",                             "lekar",   "🩺", 80),
    ("všeobecné praktické lékařství",         "lekar",   "🩺", 80),
    ("zubní lékařství",                       "zubar",   "🦷", 70),
    ("stomatologie",                          "zubar",   "🦷", 70),
    ("ortodoncie",                            "zubar",   "🦷", 70),
    ("klinická logopedie",                    "logoped", "🗣", 70),
    ("lékárenská péče",                       "lekarna", "💊", 70),
]


def norm(name):
    n = unicodedata.normalize("NFD", (name or "").lower())
    n = "".join(c for c in n if unicodedata.category(c) != "Mn")
    n = re.sub(r"[^a-z0-9 ]+", " ", n)
    return re.sub(r"\s+", " ", n).strip()


STOPWORDS = {"zs", "ms", "zakladni", "materska", "skola", "skolka", "mudr", "sro", "s", "r",
             "o", "a", "v", "ordinace", "liberec", "prispevkova", "organizace", "po"}


def tokens(name):
    return set(t for t in norm(name).split() if len(t) > 1 and t not in STOPWORDS)


def names_match(a, b):
    na, nb = norm(a), norm(b)
    if not na or not nb:
        return False
    if na in nb or nb in na:
        return True
    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return False
    return len(ta & tb) / min(len(ta), len(tb)) >= 0.5


def haversine(lat1, lon1, lat2, lon2):
    R = 6371000.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def parse_gps(s):
    """Vytahne lat/lon z libovolneho formatu retezce; vrati (lat, lon) nebo None."""
    nums = re.findall(r"-?\d+\.\d+", (s or "").replace(",", "."))
    if len(nums) < 2:
        return None
    a, b = float(nums[0]), float(nums[1])
    # auto-detekce poradi: lat v CR je 48–51.2, lon 12–19
    if 48 <= a <= 51.5 and 12 <= b <= 19:
        return (a, b)
    if 48 <= b <= 51.5 and 12 <= a <= 19:
        return (b, a)
    return None


# ─── NRPZS ────────────────────────────────────────────────────────────────────
def load_nrpzs():
    print("→ Stahuji NRPZS CSV (cela CR, streamuju a filtruji na %s)..." % OBEC)
    req = urllib.request.Request(NRPZS_CSV, headers={"User-Agent": UA})
    resp = urllib.request.urlopen(req, timeout=600)
    text = io.TextIOWrapper(resp, encoding="utf-8-sig", errors="replace")
    header_line = text.readline()
    delim = ";" if header_line.count(";") > header_line.count(",") else ","
    header = next(csv.reader([header_line], delimiter=delim))
    idx = {h.strip(): i for i, h in enumerate(header)}

    def col(row, name):
        i = idx.get(name)
        return row[i].strip() if i is not None and i < len(row) else ""

    out = {}
    rows = 0
    for row in csv.reader(text, delimiter=delim):
        rows += 1
        if col(row, "ZZ_obec") != OBEC:
            continue
        obory = col(row, "ZZ_obor_pece").lower() + " " + col(row, "ZZ_druh_zarizeni" ).lower() \
            + " " + col(row, "ZZ_druh_nazev_sekundarni").lower()
        cat = None
        for needle, c, icon, radius in OBORY:
            if needle in obory:
                cat, c_icon, c_radius = c, icon, radius
                break
        if not cat:
            continue
        gps = parse_gps(col(row, "ZZ_GPS"))
        if not gps:
            continue
        name = col(row, "ZZ_nazev") or col(row, "poskytovatel_nazev")
        mid = col(row, "ZZ_misto_poskytovani_ID") or (name + col(row, "ZZ_ulice"))
        addr = ("%s %s, %s" % (col(row, "ZZ_ulice"),
                               col(row, "ZZ_cislo_domovni_orientacni"), OBEC)).strip()
        out[mid] = {
            "name": name,
            "provider": col(row, "poskytovatel_nazev"),
            "category": cat, "icon": c_icon, "radius": c_radius,
            "lat": gps[0], "lon": gps[1], "address": addr,
            "registry": "nrpzs",
        }
    print("  prozkoumano %d radku, %d relevantnich mist v %s" % (rows, len(out), OBEC))
    return list(out.values())


# ─── MSMT ─────────────────────────────────────────────────────────────────────
def classify_school(name):
    n = norm(name)
    if "materska skola" in n or "materske skoly" in n or "detska skupina" in n:
        return ("skolka", "🧸", 120)
    if "zakladni umelecka" in n:
        return ("zus", "🎻", 100)
    if "dum deti" in n or "stredisko volneho casu" in n:
        return ("krouzky", "🎨", 110)
    if "zakladni skola" in n or "gymnazium" in n:
        return ("skola", "🏫", 180)
    return None  # stredni/VOS/internaty atd. preskocit


def load_msmt():
    print("→ Stahuji MSMT rejstrik skol (Liberecky kraj)...")
    req = urllib.request.Request(MSMT_XML, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=300) as resp:
        data = resp.read()
    root = ET.fromstring(data)
    out = {}
    # struktura: PravniSubjekt > SkolyZarizeni > SkolaZarizeni > SkolaMistaVykonuCinnosti
    for skola in root.iter():
        if not skola.tag.endswith("SkolaZarizeni"):
            continue
        nazev = ""
        for ch in skola:
            if ch.tag.endswith("SkolaPlnyNazev") or ch.tag.endswith("SkolaNazev"):
                nazev = (ch.text or "").strip()
                break
        cls = classify_school(nazev)
        if not cls:
            continue
        cat, icon, radius = cls
        for misto in skola.iter():
            if not misto.tag.endswith("SkolaMistoVykonuCinnosti"):
                continue
            lines = [(ch.text or "").strip() for ch in misto
                     if "Adresa" in ch.tag and (ch.text or "").strip()]
            full = ", ".join(lines)
            # obec: posledni radek typu "460 01 Liberec 1" / "Liberec XXX-..."
            if not re.search(r"\bLiberec\b", full):
                continue
            key = norm(nazev) + "|" + norm(full)
            out[key] = {
                "name": nazev, "category": cat, "icon": icon, "radius": radius,
                "lat": None, "lon": None, "address": full, "registry": "msmt",
            }
    print("  %d mist vykonu cinnosti v %s" % (len(out), OBEC))
    return list(out.values())


def geocode(address):
    """Nominatim geokodovani adresy (RUIAN data); max 1 dotaz/s."""
    q = urllib.parse.urlencode({"q": address + ", Czechia", "format": "json", "limit": 1})
    req = urllib.request.Request(NOMINATIM + "?" + q, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            res = json.loads(resp.read().decode("utf-8"))
        if res:
            return float(res[0]["lat"]), float(res[0]["lon"])
    except Exception as e:
        print("  ! geocode '%s': %s" % (address[:40], e))
    return None


# ─── Merge ────────────────────────────────────────────────────────────────────
def find_in_dataset(places, reg):
    for p in places:
        if reg["lat"] is not None and p.get("lat") is not None:
            if (haversine(reg["lat"], reg["lon"], p["lat"], p["lon"]) < MATCH_DIST
                    and names_match(reg["name"], p["name"])):
                return p
        if names_match(reg["name"], p["name"]):
            # bez souradnic (MSMT) staci shoda nazvu + kontrola ulice pokud je
            return p
    return None


def main():
    src = None
    for fn in ("golden_dataset_v1.json", "golden_dataset_v0.json"):
        try:
            with open(fn, encoding="utf-8") as f:
                ds = json.load(f)
            src = fn
            break
        except FileNotFoundError:
            continue
    if not src:
        print("Chybi golden_dataset_v1.json (spust nejdriv extract + validate)")
        return 1
    print("→ Vstup: %s (%d mist)" % (src, len(ds["places"])))

    registry = load_nrpzs() + load_msmt()

    upgraded, added, geocoded_fail = [], [], []
    seq = 0
    for reg in registry:
        hit = find_in_dataset(ds["places"], reg)
        if hit:
            if "registr" not in hit.get("sources", []):
                hit["sources"] = sorted(set(hit.get("sources", []) + ["registr"]))
            hit["tier"] = "A"
            hit["registry_name"] = reg["name"]
            if not hit.get("address"):
                hit["address"] = reg["address"]
            upgraded.append(reg["name"])
            continue
        # novy zaznam — pripadne geokodovat (jen MSMT, NRPZS ma GPS)
        if reg["lat"] is None:
            time.sleep(1.1)
            gps = geocode(reg["address"])
            if not gps:
                geocoded_fail.append(reg)
                continue
            reg["lat"], reg["lon"] = round(gps[0], 6), round(gps[1], 6)
            tier = "B"      # souradnice z 1 zdroje → na kontrolu
        else:
            tier = "A"      # NRPZS GPS = primo RUIAN, uredni zdroj
        seq += 1
        ds["places"].append({
            "id": "lbc_reg_%s_%04d" % (reg["category"], seq),
            "name": reg["name"],
            "category": reg["category"], "icon": reg["icon"],
            "lat": reg["lat"], "lon": reg["lon"],
            "address": reg["address"], "radius": reg["radius"],
            "tier": tier, "sources": ["registr"],
            "registry": reg["registry"],
            "provider": reg.get("provider", ""),
            "stop_lat": None, "stop_lon": None,
        })
        added.append("%-8s %s" % (reg["category"], reg["name"]))
        print("  + %s: %s" % (reg["category"], reg["name"][:50]))

    counts = {}
    for p in ds["places"]:
        counts[p["category"]] = counts.get(p["category"], 0) + 1

    ds["version"] = "v2-registry"
    ds["generated"] = datetime.now(timezone.utc).isoformat()
    ds["registry_merge"] = {"matched_upgraded": len(upgraded), "added": len(added),
                            "geocode_failed": len(geocoded_fail)}
    with open("golden_dataset_v2.json", "w", encoding="utf-8") as f:
        json.dump(ds, f, ensure_ascii=False, indent=1)

    with open("registry_report.txt", "w", encoding="utf-8") as f:
        f.write("Registry merge — %s\n\n" % datetime.now().isoformat())
        f.write("Povyseno na tier A (shoda s registrem): %d\n" % len(upgraded))
        f.write("Nove pridano z registru: %d\n\n" % len(added))
        for a in added:
            f.write("  + %s\n" % a)
        if geocoded_fail:
            f.write("\nNepodarilo se geokodovat (dopln rucne):\n")
            for g in geocoded_fail:
                f.write("  ! %-8s %s | %s\n" % (g["category"], g["name"], g["address"]))

    print("\nSouhrn po merge:")
    for c in sorted(counts):
        print("  %-10s %3d" % (c, counts[c]))
    print("\n✓ golden_dataset_v2.json (%d mist) + registry_report.txt" % len(ds["places"]))
    print("  povyseno: %d | pridano: %d | geocode selhal: %d"
          % (len(upgraded), len(added), len(geocoded_fail)))


if __name__ == "__main__":
    sys.exit(main())
