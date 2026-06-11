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
# MSMT: stary XML export byl zrusen — URL distribuce se zjistuje za behu pres NKOD SPARQL.
NKOD_SPARQL = "https://data.gov.cz/sparql"
MSMT_FALLBACK_URLS = [
    "https://rejstriky.msmt.cz/opendata/vrejcz051.xml",
    "https://rejstriky.msmt.cz/opendata/VREJCZ051.xml",
]
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


def discover_msmt_urls():
    """Najde aktualni download URL rejstriku skol (Liberecky kraj) v NKOD pres SPARQL."""
    query = (
        'PREFIX dcat: <http://www.w3.org/ns/dcat#> '
        'PREFIX dct: <http://purl.org/dc/terms/> '
        'SELECT DISTINCT ?u WHERE { '
        '?ds a dcat:Dataset ; dct:title ?t ; dcat:distribution ?d . '
        '?d dcat:downloadURL ?u . '
        'FILTER(CONTAINS(LCASE(STR(?t)),"rejst") && CONTAINS(LCASE(STR(?t)),"skol") '
        '|| CONTAINS(LCASE(STR(?t)),"\u0161kol")) '
        'FILTER(CONTAINS(STR(?t),"Libereck")) } LIMIT 10'
    )
    try:
        url = NKOD_SPARQL + "?" + urllib.parse.urlencode(
            {"query": query, "format": "application/sparql-results+json"})
        req = urllib.request.Request(url, headers={
            "User-Agent": UA, "Accept": "application/sparql-results+json"})
        with urllib.request.urlopen(req, timeout=60) as resp:
            res = json.loads(resp.read().decode("utf-8"))
        urls = [b["u"]["value"] for b in res.get("results", {}).get("bindings", [])]
        if urls:
            print("  NKOD nasel %d distribuci: %s" % (len(urls), ", ".join(urls)))
        return urls
    except Exception as e:
        print("  ! NKOD SPARQL selhal: %s" % e)
        return []


def _collect_addr(obj, parts, depth=0):
    if depth > 6:
        return
    if isinstance(obj, dict):
        for k, v in obj.items():
            kl = k.lower()
            if isinstance(v, str) and v.strip() and (
                    "adres" in kl or kl in ("ulice", "obec", "psc", "misto", "castobce")):
                parts.append(v.strip())
            elif isinstance(v, (dict, list)) and ("adres" in kl or "mist" in kl):
                _collect_addr(v, parts, depth + 1)
    elif isinstance(obj, list):
        for it in obj:
            _collect_addr(it, parts, depth + 1)


def _find_mist_lists(obj, depth=0):
    """Rekurzivne najde vsechny seznamy pod klici obsahujicimi 'mist' (mista vykonu)."""
    results = []
    if depth > 8:
        return results
    if isinstance(obj, dict):
        for k, v in obj.items():
            if "mist" in k.lower() and isinstance(v, list):
                results.append(v)
            elif isinstance(v, (dict, list)):
                results += _find_mist_lists(v, depth + 1)
    elif isinstance(obj, list):
        for it in obj:
            results += _find_mist_lists(it, depth + 1)
    return results


def _walk_json(obj, out, depth=0):
    """Genericky pruchod JSON-LD: hleda objekty se 'nazev' skoly + adresami mist."""
    if depth > 12:
        return
    if isinstance(obj, dict):
        name = None
        for k, v in obj.items():
            if isinstance(v, str) and "nazev" in k.lower() and classify_school(v):
                name = v.strip()
                break
        if name:
            # mista vykonu cinnosti: seznamy pod klicem obsahujicim 'mist',
            # hledane rekurzivne v celem podstromu (mohou byt zanorena pod 'skoly' apod.)
            places_found = False
            for lst in _find_mist_lists(obj):
                for m in lst:
                    parts = []
                    _collect_addr(m, parts)
                    if parts:
                        out.append((name, ", ".join(parts)))
                        places_found = True
            if not places_found:
                parts = []
                _collect_addr(obj, parts)
                if parts:
                    out.append((name, ", ".join(parts)))
        for v in obj.values():
            if isinstance(v, (dict, list)):
                _walk_json(v, out, depth + 1)
    elif isinstance(obj, list):
        for it in obj:
            _walk_json(it, out, depth + 1)


def _parse_msmt_xml(data):
    root = ET.fromstring(data)
    out = []
    for skola in root.iter():
        if not skola.tag.endswith("SkolaZarizeni"):
            continue
        nazev = ""
        for ch in skola:
            if ch.tag.endswith("SkolaPlnyNazev") or ch.tag.endswith("SkolaNazev"):
                nazev = (ch.text or "").strip()
                break
        if not classify_school(nazev):
            continue
        for misto in skola.iter():
            if not misto.tag.endswith("SkolaMistoVykonuCinnosti"):
                continue
            lines = [(ch.text or "").strip() for ch in misto
                     if "Adresa" in ch.tag and (ch.text or "").strip()]
            if lines:
                out.append((nazev, ", ".join(lines)))
    return out


def load_msmt():
    print("→ Stahuji MSMT rejstrik skol (Liberecky kraj)...")
    urls = discover_msmt_urls() + MSMT_FALLBACK_URLS
    pairs = []
    for u in urls:
        try:
            req = urllib.request.Request(u, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=300) as resp:
                data = resp.read()
        except Exception as e:
            print("  ! %s: %s" % (u[:70], e))
            continue
        # uloz raw pro pripadnou analyzu
        ext = "xml" if data.lstrip()[:1] == b"<" else "json"
        with open("msmt_raw." + ext, "wb") as f:
            f.write(data)
        try:
            if ext == "xml":
                pairs = _parse_msmt_xml(data)
            else:
                doc = json.loads(data.decode("utf-8"))
                _walk_json(doc, pairs)
        except Exception as e:
            print("  ! parsovani %s selhalo: %s" % (u[:70], e))
            continue
        if len(pairs) >= 20:
            print("  zdroj: %s" % u)
            break
        print("  ! %s dalo jen %d zaznamu, zkousim dalsi" % (u[:70], len(pairs)))
        pairs = []

    # filtr na Liberec + klasifikace + dedup
    out = {}
    for nazev, addr in pairs:
        if not re.search(r"\bLiberec\b", addr):
            continue
        cls = classify_school(nazev)
        if not cls:
            continue
        cat, icon, radius = cls
        key = norm(nazev) + "|" + norm(addr)
        out[key] = {
            "name": nazev, "category": cat, "icon": icon, "radius": radius,
            "lat": None, "lon": None, "address": addr, "registry": "msmt",
        }
    print("  %d mist vykonu cinnosti v %s" % (len(out), OBEC))
    if not out:
        print("  ! MSMT zdroj nedostupny/neparsovatelny — posli mi zacatek msmt_raw.* a parser doladim")
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

    registry = load_nrpzs()
    try:
        registry += load_msmt()
    except Exception as e:
        print("  ! MSMT vetev selhala (%s) — pokracuji jen s NRPZS" % e)

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
