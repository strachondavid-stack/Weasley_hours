# -*- coding: utf-8 -*-
"""
qc_server.py — Krok 4 (interaktivni): webove QC nad golden datasetem.

Spusteni na NAS:
    python3 qc_server.py            # port 8765
    python3 qc_server.py 9000       # vlastni port
Pak v prohlizeci:  http://NAS_IP:8765

Funkce:
  - Duplicity: u kazde dvojice tlacitka "Smazat A" / "Smazat B" / "Nechat obe"
  - Tier B: "✓ Overeno" (povysi na tier A) / "Smazat"
  - Kazda akce se ihned zapise do golden_dataset_v2.json
  - Pred prvni zmenou se vytvori zaloha golden_dataset_v2.backup.json
  - Vyrizene dvojice se pamatuji v qc_state.json (po reloadu se neukazou)

Zadne zavislosti, zadne API, bezi jen v lokalni siti.
"""

import json
import math
import os
import re
import shutil
import sys
import unicodedata
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DATASET = "golden_dataset_v2.json"
BACKUP = "golden_dataset_v2.backup.json"
STATE = "qc_state.json"
DUP_DIST = 250  # m

CAT_LABELS = {
    "skola": "🏫 škola", "skolka": "🧸 školka", "lekar": "🩺 lékař",
    "zubar": "🦷 zubař", "lekarna": "💊 lékárna", "obchod": "🛒 obchod",
    "kultura": "🎭 kultura", "sport": "⚽ sport", "zus": "🎻 ZUŠ",
    "krouzky": "🎨 kroužky", "logoped": "🗣 logoped",
}

STOPWORDS = {"zs", "ms", "zakladni", "materska", "skola", "skolka", "mudr", "mddr", "sro",
             "s", "r", "o", "a", "v", "ordinace", "liberec", "prispevkova", "organizace", "po"}


def norm(name):
    n = unicodedata.normalize("NFD", (name or "").lower())
    n = "".join(c for c in n if unicodedata.category(c) != "Mn")
    n = re.sub(r"[^a-z0-9 ]+", " ", n)
    return re.sub(r"\s+", " ", n).strip()


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


# ─── Stav ─────────────────────────────────────────────────────────────────────
def load_ds():
    with open(DATASET, encoding="utf-8") as f:
        return json.load(f)


def save_ds(ds):
    if not os.path.exists(BACKUP):
        shutil.copy(DATASET, BACKUP)
        print("✓ Zaloha: " + BACKUP)
    ds["qc_modified"] = datetime.now().isoformat()
    tmp = DATASET + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(ds, f, ensure_ascii=False, indent=1)
    os.replace(tmp, DATASET)


def load_state():
    try:
        with open(STATE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"kept_pairs": []}


def save_state(st):
    with open(STATE, "w", encoding="utf-8") as f:
        json.dump(st, f, ensure_ascii=False)


def find_dups(places, kept_pairs):
    kept = set(tuple(sorted(p)) for p in kept_pairs)
    dups = []
    for i in range(len(places)):
        for j in range(i + 1, len(places)):
            a, b = places[i], places[j]
            if a["category"] != b["category"]:
                continue
            if tuple(sorted((a["id"], b["id"]))) in kept:
                continue
            d = haversine(a["lat"], a["lon"], b["lat"], b["lon"])
            if d <= DUP_DIST and names_similar(a["name"], b["name"]):
                dups.append((round(d), a, b))
    dups.sort(key=lambda x: x[0])
    return dups


def apply_action(action, payload):
    """Provede akci nad datasetem; vraci (ok, zprava)."""
    ds = load_ds()
    places = ds["places"]
    if action == "delete":
        pid = payload.get("id")
        before = len(places)
        ds["places"] = [p for p in places if p["id"] != pid]
        if len(ds["places"]) == before:
            return False, "ID nenalezeno: " + str(pid)
        save_ds(ds)
        return True, "Smazano " + pid
    if action == "verify":
        pid = payload.get("id")
        for p in places:
            if p["id"] == pid:
                p["tier"] = "A"
                p["sources"] = sorted(set(p.get("sources", []) + ["manual"]))
                save_ds(ds)
                return True, "Overeno " + pid
        return False, "ID nenalezeno: " + str(pid)
    if action == "keep_both":
        st = load_state()
        pair = sorted([payload.get("idA"), payload.get("idB")])
        if pair not in st["kept_pairs"]:
            st["kept_pairs"].append(pair)
        save_state(st)
        return True, "Dvojice ponechana"
    return False, "Neznama akce"


# ─── HTML ─────────────────────────────────────────────────────────────────────
def esc(s):
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def links(p):
    mapy = "https://mapy.com/zakladni?source=coor&id=%s,%s&x=%s&y=%s&z=19" % (
        p["lon"], p["lat"], p["lon"], p["lat"])
    goog = "https://www.google.com/maps?q=%s,%s" % (p["lat"], p["lon"])
    return ('<a href="%s" target="_blank">Mapy.cz</a> · '
            '<a href="%s" target="_blank">Google</a>') % (mapy, goog)


def place_cell(p):
    return ('<b>%s</b> <span class="cat">%s</span><br>'
            '<small>%s · zdroje: %s · tier %s</small><br>%s'
            % (esc(p["name"]), CAT_LABELS.get(p["category"], p["category"]),
               esc(p.get("address") or "—"), ",".join(p.get("sources", [])),
               p.get("tier", "?"), links(p)))


def render():
    ds = load_ds()
    places = ds["places"]
    st = load_state()
    dups = find_dups(places, st["kept_pairs"])
    tier_b = sorted([p for p in places if p.get("tier") != "A"],
                    key=lambda p: (p["category"], norm(p["name"])))
    counts = {}
    for p in places:
        counts[p["category"]] = counts.get(p["category"], 0) + 1
    summary = " · ".join("%s %d" % (CAT_LABELS.get(c, c), n) for c, n in sorted(counts.items()))

    dup_rows = []
    for d, a, b in dups:
        dup_rows.append(
            '<tr id="row_%s__%s">'
            '<td>%d m</td><td>%s</td><td>%s</td>'
            '<td class="acts">'
            '<button class="del" onclick="act(this,\'delete\',{id:\'%s\'})">Smazat A</button>'
            '<button class="del" onclick="act(this,\'delete\',{id:\'%s\'})">Smazat B</button>'
            '<button onclick="act(this,\'keep_both\',{idA:\'%s\',idB:\'%s\'})">Nechat obě</button>'
            '</td></tr>'
            % (a["id"], b["id"], d, place_cell(a), place_cell(b),
               a["id"], b["id"], a["id"], b["id"]))

    b_rows = []
    for p in tier_b:
        b_rows.append(
            '<tr id="row_%s">'
            '<td>%s</td><td>%.5f, %.5f<br>%s</td>'
            '<td class="acts">'
            '<button class="ok" onclick="act(this,\'verify\',{id:\'%s\'})">✓ Ověřeno</button>'
            '<button class="del" onclick="act(this,\'delete\',{id:\'%s\'})">Smazat</button>'
            '</td></tr>'
            % (p["id"], place_cell(p), p["lat"], p["lon"], links(p), p["id"], p["id"]))

    return """<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>QC — golden dataset Liberec</title>
<style>
 body{font-family:system-ui,sans-serif;margin:16px;color:#222;max-width:1250px}
 h1{font-size:19px} h2{font-size:15px;margin-top:26px}
 .meta{color:#777;font-size:13px}
 table{border-collapse:collapse;width:100%%;font-size:13px}
 td,th{border:1px solid #ddd;padding:6px 8px;vertical-align:top;text-align:left}
 th{background:#f5f5f5} small{color:#888} .cat{color:#999;font-size:12px}
 tr:hover{background:#fafafa}
 .acts{white-space:nowrap}
 button{font-size:12px;padding:4px 10px;margin:1px;border:1px solid #aaa;border-radius:4px;
        background:#fff;cursor:pointer}
 button:hover{background:#f0f0f0}
 button.del{border-color:#d33;color:#d33} button.del:hover{background:#fff5f5}
 button.ok{border-color:#2a7a2a;color:#2a7a2a} button.ok:hover{background:#f3fff3}
 tr.done{opacity:0.35} tr.done button{display:none}
 #toast{position:fixed;bottom:14px;right:14px;background:#222;color:#fff;padding:8px 14px;
        border-radius:6px;font-size:13px;display:none}
</style></head><body>
<h1>QC — golden dataset Liberec</h1>
<p class="meta">%d míst · %s<br>Každá akce se ihned ukládá do %s (záloha: %s)</p>

<h2>1. Podezřelé duplicity (<span id="dupCount">%d</span>)</h2>
<p class="meta">Otevři letecký snímek, nech bod blíž skutečnému vchodu, druhý smaž.</p>
<table><tr><th>Vzdál.</th><th>Místo A</th><th>Místo B</th><th>Akce</th></tr>
%s</table>

<h2>2. Tier B — ověřit polohu (<span id="bCount">%d</span>)</h2>
<table><tr><th>Místo</th><th>GPS</th><th>Akce</th></tr>
%s</table>

<div id="toast"></div>
<script>
function toast(m){var t=document.getElementById('toast');t.textContent=m;
 t.style.display='block';clearTimeout(t._h);t._h=setTimeout(function(){t.style.display='none'},1800);}
function act(btn,action,payload){
 fetch('/api/'+action,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify(payload)})
 .then(function(r){return r.json()})
 .then(function(res){
   if(!res.ok){toast('Chyba: '+res.msg);return;}
   var tr=btn.closest('tr');tr.classList.add('done');
   // smazane ID muze figurovat i v jinych radcich duplicit -> oznac je taky
   if(action==='delete'){
     var pid=payload.id;
     document.querySelectorAll('tr[id]').forEach(function(r){
       if(r.id.indexOf(pid)>-1)r.classList.add('done');});}
   toast(res.msg);
   var dc=document.getElementById('dupCount'),bc=document.getElementById('bCount');
   dc.textContent=document.querySelectorAll('table:nth-of-type(1) tr[id]:not(.done)').length;
   bc.textContent=document.querySelectorAll('table:nth-of-type(2) tr[id]:not(.done)').length;
 })
 .catch(function(e){toast('Chyba spojení: '+e)});
}
</script></body></html>""" % (
        len(places), summary, DATASET, BACKUP,
        len(dups), "\n".join(dup_rows),
        len(tier_b), "\n".join(b_rows))


# ─── HTTP ─────────────────────────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="text/html; charset=utf-8"):
        data = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            try:
                self._send(200, render())
            except FileNotFoundError:
                self._send(500, "Chybi %s — spust nejdriv extrakci." % DATASET)
        else:
            self._send(404, "404")

    def do_POST(self):
        m = re.match(r"^/api/(delete|verify|keep_both)$", self.path)
        if not m:
            self._send(404, json.dumps({"ok": False, "msg": "404"}), "application/json")
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
            ok, msg = apply_action(m.group(1), payload)
        except Exception as e:
            ok, msg = False, str(e)
        self._send(200, json.dumps({"ok": ok, "msg": msg}, ensure_ascii=False),
                   "application/json; charset=utf-8")

    def log_message(self, fmt, *args):
        pass  # ticho v konzoli


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print("✓ QC server bezi: http://0.0.0.0:%d  (Ctrl+C ukonci)" % port)
    print("  dataset: %s" % os.path.abspath(DATASET))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nKonec.")


if __name__ == "__main__":
    main()
