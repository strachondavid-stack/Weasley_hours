# -*- coding: utf-8 -*-
"""
qc_report.py — Krok 4: Kontrola kvality golden datasetu.

Vygeneruje review.html se dvema sekcemi:
  1. Podezrele duplicity — dvojice mist stejne kategorie do 250 m s podobnym
     nazvem (typicky OSM centroid vs. RUIAN adresni bod tehoz mista)
  2. Tier B mista — souradnice z jedineho zdroje, na rucni overeni

U kazdeho mista odkazy na Mapy.cz (letecky snimek) a Google Maps.
Bezi offline nad golden_dataset_v2.json, zadne API.

    python3 qc_report.py
"""

import json
import math
import re
import sys
import unicodedata
from datetime import datetime

CAT_LABELS = {
    "skola": "🏫 Školy", "skolka": "🧸 Školky", "lekar": "🩺 Lékaři",
    "zubar": "🦷 Zubaři", "lekarna": "💊 Lékárny", "obchod": "🛒 Obchody",
    "kultura": "🎭 Kultura", "sport": "⚽ Sport", "zus": "🎻 ZUŠ",
    "krouzky": "🎨 Kroužky", "logoped": "🗣 Logopedi",
}

DUP_DIST = 250  # m


def norm(name):
    n = unicodedata.normalize("NFD", (name or "").lower())
    n = "".join(c for c in n if unicodedata.category(c) != "Mn")
    n = re.sub(r"[^a-z0-9 ]+", " ", n)
    return re.sub(r"\s+", " ", n).strip()


STOPWORDS = {"zs", "ms", "zakladni", "materska", "skola", "skolka", "mudr", "mddr", "sro",
             "s", "r", "o", "a", "v", "ordinace", "liberec", "prispevkova", "organizace", "po"}


def tokens(name):
    return set(t for t in norm(name).split() if len(t) > 1 and t not in STOPWORDS)


def names_similar(a, b):
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


def links(p):
    mapy = "https://mapy.com/zakladni?source=coor&id=%s,%s&x=%s&y=%s&z=19" % (
        p["lon"], p["lat"], p["lon"], p["lat"])
    goog = "https://www.google.com/maps?q=%s,%s" % (p["lat"], p["lon"])
    return ('<a href="%s" target="_blank">Mapy.cz</a> · '
            '<a href="%s" target="_blank">Google</a>') % (mapy, goog)


def esc(s):
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def main():
    with open("golden_dataset_v2.json", encoding="utf-8") as f:
        ds = json.load(f)
    places = ds["places"]

    # ── duplicity ────────────────────────────────────────────────────────
    dups = []
    for i in range(len(places)):
        for j in range(i + 1, len(places)):
            a, b = places[i], places[j]
            if a["category"] != b["category"]:
                continue
            d = haversine(a["lat"], a["lon"], b["lat"], b["lon"])
            if d <= DUP_DIST and names_similar(a["name"], b["name"]):
                dups.append((round(d), a, b))
    dups.sort(key=lambda x: x[0])

    tier_b = [p for p in places if p.get("tier") != "A"]
    tier_b.sort(key=lambda p: (p["category"], norm(p["name"])))

    counts = {}
    for p in places:
        counts[p["category"]] = counts.get(p["category"], 0) + 1

    # ── HTML ─────────────────────────────────────────────────────────────
    rows_dup = []
    for d, a, b in dups:
        rows_dup.append(
            '<tr><td>%dm</td>'
            '<td><b>%s</b><br><small>%s · %s · zdroje: %s</small><br>%s</td>'
            '<td><b>%s</b><br><small>%s · %s · zdroje: %s</small><br>%s</td>'
            '<td><code>%s</code><br><code>%s</code></td></tr>'
            % (d,
               esc(a["name"]), a["category"], esc(a.get("address") or "—"),
               ",".join(a.get("sources", [])), links(a),
               esc(b["name"]), b["category"], esc(b.get("address") or "—"),
               ",".join(b.get("sources", [])), links(b),
               a["id"], b["id"]))

    rows_b = []
    for p in tier_b:
        rows_b.append(
            '<tr><td>%s</td><td><b>%s</b><br><small>%s</small></td>'
            '<td>%.5f, %.5f</td><td>%s</td><td><code>%s</code></td></tr>'
            % (p["category"], esc(p["name"]), esc(p.get("address") or "—"),
               p["lat"], p["lon"], links(p), p["id"]))

    summary = " · ".join("%s %d" % (CAT_LABELS.get(c, c), n)
                         for c, n in sorted(counts.items()))

    html = """<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8">
<title>Golden dataset Liberec — QC review</title>
<style>
 body{font-family:system-ui,sans-serif;margin:20px;color:#222;max-width:1200px}
 h1{font-size:20px} h2{font-size:16px;margin-top:28px}
 table{border-collapse:collapse;width:100%%;font-size:13px}
 td,th{border:1px solid #ddd;padding:6px 8px;vertical-align:top;text-align:left}
 th{background:#f5f5f5} small{color:#888} code{font-size:11px;color:#a55}
 .meta{color:#777;font-size:13px}
 tr:hover{background:#fafafa}
</style></head><body>
<h1>Golden dataset Liberec — kontrola kvality</h1>
<p class="meta">%s mist · vygenerovano %s<br>%s</p>

<h2>1. Podezrele duplicity (%d dvojic) — rozhodnout, kterou variantu nechat</h2>
<p class="meta">Typicky OSM centroid vs. RUIAN adresni bod tehoz mista. Otevri letecky snimek,
nech bod bliz reálnemu vchodu, druhe ID smaz z datasetu.</p>
<table><tr><th>Vzdal.</th><th>Misto A</th><th>Misto B</th><th>ID</th></tr>%s</table>

<h2>2. Tier B mista (%d) — overit polohu na leteckem snimku</h2>
<table><tr><th>Kat.</th><th>Nazev</th><th>GPS</th><th>Mapa</th><th>ID</th></tr>%s</table>
</body></html>""" % (
        len(places), datetime.now().strftime("%d.%m.%Y %H:%M"), summary,
        len(dups), "\n".join(rows_dup),
        len(tier_b), "\n".join(rows_b))

    with open("review.html", "w", encoding="utf-8") as f:
        f.write(html)

    print("✓ review.html: %d podezrelych duplicit, %d tier B mist (z %d celkem)"
          % (len(dups), len(tier_b), len(places)))
    print("  otevri v prohlizeci: http://NAS_IP:3000/... nebo zkopiruj na PC")


if __name__ == "__main__":
    sys.exit(main())
