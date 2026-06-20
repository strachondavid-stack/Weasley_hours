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
    if action == "move":
        pid = payload.get("id")
        try:
            lat = float(payload.get("lat"))
            lon = float(payload.get("lon"))
        except (TypeError, ValueError):
            return False, "Neplatne souradnice"
        for p in places:
            if p["id"] == pid:
                p["lat"] = round(lat, 6)
                p["lon"] = round(lon, 6)
                p["sources"] = sorted(set(p.get("sources", []) + ["manual_move"]))
                save_ds(ds)
                return True, "Posunuto " + pid
        return False, "ID nenalezeno: " + str(pid)
    if action == "update":
        pid = payload.get("id")
        for p in places:
            if p["id"] == pid:
                if payload.get("name") is not None:
                    p["name"] = str(payload["name"]).strip() or p["name"]
                if payload.get("category"):
                    p["category"] = str(payload["category"]).strip()
                try:
                    if payload.get("lat") is not None:
                        p["lat"] = round(float(payload["lat"]), 6)
                    if payload.get("lon") is not None:
                        p["lon"] = round(float(payload["lon"]), 6)
                except (TypeError, ValueError):
                    return False, "Neplatne souradnice"
                p["sources"] = sorted(set(p.get("sources", []) + ["manual_edit"]))
                save_ds(ds)
                return True, "Upraveno " + pid
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

    map_places = json.dumps([
        {"id": p["id"], "name": p["name"], "cat": p["category"],
         "lat": p["lat"], "lon": p["lon"], "tier": p.get("tier", "?")}
        for p in places
    ], ensure_ascii=False)
    cat_labels_json = json.dumps(CAT_LABELS, ensure_ascii=False)
    cats_sorted = sorted(counts.keys())
    map_checks = "".join(
        '<label class="catf"><input type="checkbox" checked data-cat="' + c + '" '
        'onchange="toggleCat(this)"> ' + CAT_LABELS.get(c, c) + ' (' + str(counts[c]) + ')</label>'
        for c in cats_sorted)
    list_checks = "".join(
        '<label class="catf"><input type="checkbox" checked data-cat="' + c + '"> '
        + CAT_LABELS.get(c, c) + ' (' + str(counts[c]) + ')</label>'
        for c in cats_sorted)

    list_html = (
        '<div class="mapbar">'
        '<input id="listSearch" placeholder="Hledat n\u00e1zev\u2026">'
        '<label class="meta">\u0158adit: <select id="listSort"><option value="cat">dle kategorie</option>'
        '<option value="tier">tier B prvn\u00ed</option><option value="name">dle n\u00e1zvu</option></select></label>'
        '<span class="meta"><b id="listCount">0</b> bod\u016f</span>'
        '</div>'
        '<div class="catfilters" id="listCatFilter">' + list_checks + '</div>'
        '<div id="listContainer"></div>')

    map_html = (
        '<h2>\U0001F4CD Mapa v\u0161ech bod\u016f (' + str(len(places)) + ')</h2>'
        '<p class="meta">T\u00e1hni \u0161pend\u00edk my\u0161\u00ed pro posun bodu (ulo\u017e\u00ed se hned). '
        'Klikni na \u0161pend\u00edk pro detail / ov\u011b\u0159en\u00ed / smaz\u00e1n\u00ed.</p>'
        '<div class="mapbar">'
        '<input id="mapSearch" placeholder="Hledat n\u00e1zev\u2026 (Enter)" onkeydown="if(event.key===\'Enter\')mapFind()">'
        '<button onclick="mapFind()">Naj\u00edt</button>'
        '<span class="catfilters">' + map_checks + '</span>'
        '</div>'
        '<div id="qcmap"></div>')

    shared_js = ('var PLACES=' + map_places + ';var CATLABELS=' + cat_labels_json + ';' + r'''
var CATCOLOR={skola:"#1f77b4",skolka:"#ff7f0e",lekar:"#d62728",zubar:"#e377c2",lekarna:"#9467bd",obchod:"#2ca02c",kultura:"#8c564b",sport:"#17becf",zus:"#bcbd22",krouzky:"#7f7f7f",logoped:"#aec7e8"};
function toast(m){var t=document.getElementById("toast");t.textContent=m;t.style.display="block";clearTimeout(t._h);t._h=setTimeout(function(){t.style.display="none"},1800);}
function jpost(action,payload,cb){fetch("/api/"+action,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}).then(function(r){return r.json()}).then(function(res){toast(res.msg);if(cb)cb(res);}).catch(function(e){toast("Chyba: "+e)});}
function act(btn,action,payload){jpost(action,payload,function(res){if(!res.ok)return;var tr=btn.closest("tr");tr.classList.add("done");if(action==="delete"){document.querySelectorAll("#tab-check tr[id]").forEach(function(r){if(r.id.indexOf(payload.id)>-1)r.classList.add("done");});}var dc=document.getElementById("dupCount"),bc=document.getElementById("bCount");if(dc)dc.textContent=document.querySelectorAll("#tab-check table:nth-of-type(1) tr[id]:not(.done)").length;if(bc)bc.textContent=document.querySelectorAll("#tab-check table:nth-of-type(2) tr[id]:not(.done)").length;});}
function showTab(t){document.getElementById("tab-list").style.display=(t==="list")?"block":"none";document.getElementById("tab-check").style.display=(t==="check")?"block":"none";document.getElementById("tb-list").classList.toggle("active",t==="list");document.getElementById("tb-check").classList.toggle("active",t==="check");if(t==="check"&&window.qcmap){setTimeout(function(){window.qcmap.invalidateSize()},60);}}
''')

    map_js = r'''
var qcmap=L.map("qcmap").setView([50.7700,15.0600],12);window.qcmap=qcmap;
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"\u00a9 OpenStreetMap"}).addTo(qcmap);
var layers={},markers={};
function mIcon(col,tier){var ring=(tier==="A")?"#222":"#d33";return L.divIcon({className:"",html:'<div style="width:14px;height:14px;border-radius:50%;background:'+col+';border:2px solid '+ring+';box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>',iconSize:[14,14],iconAnchor:[7,7]});}
function popHtml(p){var h='<b>'+p.name+'</b><br><small>'+(CATLABELS[p.cat]||p.cat)+' \u00b7 tier '+p.tier+'</small><br><small>'+p.lat.toFixed(5)+", "+p.lon.toFixed(5)+'</small><br>';h+='<button data-mact="verify" data-id="'+p.id+'">\u2713 Ov\u011b\u0159it</button> <button data-mact="delete" data-id="'+p.id+'" style="color:#d33">Smazat</button>';return h;}
PLACES.forEach(function(p){var col=CATCOLOR[p.cat]||"#555";var mk=L.marker([p.lat,p.lon],{icon:mIcon(col,p.tier),draggable:true,title:p.name});mk.bindPopup(popHtml(p));mk.on("dragend",function(e){var ll=e.target.getLatLng();jpost("move",{id:p.id,lat:ll.lat,lon:ll.lng},function(res){if(res.ok){p.lat=ll.lat;p.lon=ll.lng;mk.setPopupContent(popHtml(p));}});});if(!layers[p.cat])layers[p.cat]=L.layerGroup().addTo(qcmap);layers[p.cat].addLayer(mk);markers[p.id]=mk;});
function toggleCat(cb){var c=cb.getAttribute("data-cat");if(!layers[c])return;if(cb.checked)qcmap.addLayer(layers[c]);else qcmap.removeLayer(layers[c]);}
function mapFind(){var q=document.getElementById("mapSearch").value.toLowerCase().trim();if(!q)return;var hit=PLACES.find(function(p){return p.name.toLowerCase().indexOf(q)>-1;});if(hit){qcmap.setView([hit.lat,hit.lon],17);markers[hit.id].openPopup();}else toast("Nenalezeno");}
document.getElementById("qcmap").addEventListener("click",function(e){var b=e.target.closest("[data-mact]");if(!b)return;var id=b.getAttribute("data-id");var a=b.getAttribute("data-mact");if(a==="verify"){jpost("verify",{id:id});}else if(a==="delete"){if(confirm("Smazat tento bod?"))jpost("delete",{id:id},function(res){if(res.ok&&markers[id])qcmap.removeLayer(markers[id]);});}});
'''

    list_js = r'''
var miniMap=null,miniMarker=null,expandedId=null;
function escH(s){return (""+s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function tierBadge(t){return (t==="A")?'<span class="tA">A</span>':'<span class="tB">B</span>';}
function rowHtml(p){var col=CATCOLOR[p.cat]||"#555";return '<div class="lrow" data-id="'+p.id+'"><div class="lhead"><span class="ldot" style="background:'+col+'"></span><span class="lname">'+escH(p.name)+'</span><span class="lcat">'+(CATLABELS[p.cat]||p.cat)+'</span>'+tierBadge(p.tier)+'<span class="lgps">'+p.lat.toFixed(5)+", "+p.lon.toFixed(5)+'</span></div><div class="ledit" data-edit="'+p.id+'"></div></div>';}
function editHtml(p){var opts=Object.keys(CATLABELS).map(function(k){return '<option value="'+k+'"'+((k===p.cat)?" selected":"")+'>'+CATLABELS[k]+'</option>';}).join("");return '<div class="erow"><label>N\u00e1zev</label><input id="e-name-'+p.id+'" value="'+escH(p.name).replace(/"/g,"&quot;")+'"></div><div class="erow"><label>Kategorie</label><select id="e-cat-'+p.id+'">'+opts+'</select></div><div class="erow"><label>GPS</label><input id="e-lat-'+p.id+'" value="'+p.lat+'" style="width:120px"> <input id="e-lon-'+p.id+'" value="'+p.lon+'" style="width:120px"></div><div id="mini-'+p.id+'" class="mini"></div><p class="meta">T\u00e1hni \u0161pend\u00edk pro posun (p\u0159ep\u00ed\u0161e GPS pole). Po \u00faprav\u011b dej Ulo\u017eit.</p><div class="ebtns"><button class="ok" data-lact="save" data-id="'+p.id+'">\U0001F4BE Ulo\u017eit</button><button data-lact="verify" data-id="'+p.id+'">\u2713 Ov\u011b\u0159it (tier A)</button><button class="del" data-lact="delete" data-id="'+p.id+'">Smazat</button><button data-lact="detect" data-id="'+p.id+'">\U0001F50D Test rozpozn\u00e1n\u00ed</button></div><div id="detect-'+p.id+'" class="detectbox"></div>';}
function renderList(){var q=(document.getElementById("listSearch").value||"").toLowerCase().trim();var checked=[].slice.call(document.querySelectorAll("#listCatFilter input:checked")).map(function(c){return c.getAttribute("data-cat");});var allc=document.querySelectorAll("#listCatFilter input").length;var arr=PLACES.filter(function(p){if(checked.length<allc&&checked.indexOf(p.cat)<0)return false;if(q&&p.name.toLowerCase().indexOf(q)<0)return false;return true;});var sort=document.getElementById("listSort").value;if(sort==="tier")arr.sort(function(a,b){if(a.tier!==b.tier)return (a.tier==="A")?1:-1;return a.name.localeCompare(b.name);});else if(sort==="name")arr.sort(function(a,b){return a.name.localeCompare(b.name);});else arr.sort(function(a,b){if(a.cat!==b.cat)return a.cat.localeCompare(b.cat);return a.name.localeCompare(b.name);});document.getElementById("listContainer").innerHTML=arr.map(rowHtml).join("")||'<p class="meta">Nic nenalezeno</p>';document.getElementById("listCount").textContent=arr.length;expandedId=null;miniMap=null;miniMarker=null;}
function closeRow(){if(miniMap){miniMap.remove();miniMap=null;miniMarker=null;}if(expandedId){var ed=document.querySelector('[data-edit="'+expandedId+'"]');if(ed){ed.innerHTML="";ed.classList.remove("open");}var row=document.querySelector('.lrow[data-id="'+expandedId+'"]');if(row)row.classList.remove("open");}expandedId=null;}
function openRow(id){closeRow();expandedId=id;var p=PLACES.find(function(x){return x.id===id;});var ed=document.querySelector('[data-edit="'+id+'"]');ed.innerHTML=editHtml(p);ed.classList.add("open");var row=document.querySelector('.lrow[data-id="'+id+'"]');if(row)row.classList.add("open");setTimeout(function(){miniMap=L.map("mini-"+id).setView([p.lat,p.lon],16);L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"\u00a9 OSM"}).addTo(miniMap);miniMarker=L.marker([p.lat,p.lon],{draggable:true}).addTo(miniMap);miniMarker.on("drag",function(e){var ll=e.target.getLatLng();document.getElementById("e-lat-"+id).value=ll.lat.toFixed(6);document.getElementById("e-lon-"+id).value=ll.lng.toFixed(6);});miniMap.invalidateSize();},60);}
function saveRow(id){var name=document.getElementById("e-name-"+id).value;var cat=document.getElementById("e-cat-"+id).value;var lat=parseFloat(document.getElementById("e-lat-"+id).value);var lon=parseFloat(document.getElementById("e-lon-"+id).value);jpost("update",{id:id,name:name,category:cat,lat:lat,lon:lon},function(res){if(res.ok){var p=PLACES.find(function(x){return x.id===id;});p.name=name;p.cat=cat;p.lat=lat;p.lon=lon;closeRow();renderList();}});}
function verifyRow(id){jpost("verify",{id:id},function(res){if(res.ok){var p=PLACES.find(function(x){return x.id===id;});p.tier="A";closeRow();renderList();}});}
function deleteRow(id){if(!confirm("Smazat tento bod?"))return;jpost("delete",{id:id},function(res){if(res.ok){var i=PLACES.findIndex(function(x){return x.id===id;});if(i>-1)PLACES.splice(i,1);closeRow();renderList();}});}
function detectRow(id){var lat=parseFloat(document.getElementById("e-lat-"+id).value);var lon=parseFloat(document.getElementById("e-lon-"+id).value);var box=document.getElementById("detect-"+id);if(!box)return;box.innerHTML='<p class="meta">Rozpozn\u00e1v\u00e1m...</p>';var url="http://"+location.hostname+":3000/detect/preview?lat="+lat+"&lon="+lon+"&gap=15";fetch(url).then(function(r){return r.json();}).then(function(d){if(d.error){box.innerHTML='<p style="color:#d33">Chyba: '+escH(d.error)+'</p>';return;}var DC={auto_save:["#1a7f37","AUTO-ULO\u017dENO"],suggest:["#b8860b","N\u00c1VRH (?)"],reject:["#999","ZAHOZENO"]};var dc=DC[d.decision]||["#999",d.decision];var h='<div style="border-top:1px solid #ddd;margin-top:8px;padding-top:8px;font-size:13px">';h+='<div><b style="color:'+dc[0]+'">'+dc[1]+'</b>'+(d.finalName?' \u2192 "'+escH(d.finalName)+'"':'')+'</div>';if(d.geocode){h+='<p class="meta">adresa: '+escH(d.geocode.formatted||"-")+(d.residential?" \u00b7 REZIDEN\u010cN\u00cd":"")+'</p>';}if(d.atAddress){h+='<p class="meta">na adrese: '+escH(d.atAddress.name)+" (shoda "+(d.atAddress.addrScore||0)+")</p>";}if(d.ai){h+='<p class="meta">AI: "'+escH(d.ai.name||"null")+'" conf='+d.ai.confidence+" \u2014 "+escH(d.ai.reason||"")+'</p>';}h+='<p class="meta">n\u00e1v\u0161t\u011bv: '+d.historyVisits+" \u00b7 v\u00fdb\u011br dle adresy: "+(d.addrPick?escH(d.addrPick):"-")+'</p>';if(d.nearby&&d.nearby.length){h+='<p class="meta" style="margin-top:4px"><b>POI v okol\u00ed:</b></p>';d.nearby.slice(0,8).forEach(function(p){h+='<p class="meta">\u2022 '+escH(p.name)+" \u2014 "+(p.primaryType||"?")+" \u00b7 "+p.dist+"m"+(p.addrScore?" \u00b7 adr"+p.addrScore:"")+'</p>';});}h+='</div>';box.innerHTML=h;}).catch(function(e){box.innerHTML='<p style="color:#d33">Nedostupn\u00e9 (b\u011b\u017e\u00ed Node na :3000?): '+escH(""+e)+'</p>';});}
document.getElementById("listContainer").addEventListener("click",function(e){var b=e.target.closest("[data-lact]");if(b){var a=b.getAttribute("data-lact"),id=b.getAttribute("data-id");if(a==="save")saveRow(id);else if(a==="verify")verifyRow(id);else if(a==="delete")deleteRow(id);else if(a==="detect")detectRow(id);return;}var head=e.target.closest(".lhead");if(head){var row=head.closest(".lrow");var id=row.getAttribute("data-id");if(expandedId===id)closeRow();else openRow(id);}});
document.getElementById("listSearch").addEventListener("input",renderList);
document.getElementById("listSort").addEventListener("change",renderList);
[].slice.call(document.querySelectorAll("#listCatFilter input")).forEach(function(c){c.addEventListener("change",renderList);});
renderList();
'''

    scripts = '<script>' + shared_js + '</script><script>' + map_js + '</script><script>' + list_js + '</script>'

    html = """<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>QC \u2014 golden dataset Liberec</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
 body{font-family:system-ui,sans-serif;margin:16px;color:#222;max-width:1250px}
 h1{font-size:19px} h2{font-size:15px;margin-top:26px}
 .meta{color:#777;font-size:13px}
 table{border-collapse:collapse;width:100%%;font-size:13px}
 td,th{border:1px solid #ddd;padding:6px 8px;vertical-align:top;text-align:left}
 th{background:#f5f5f5} small{color:#888} .cat{color:#999;font-size:12px}
 tr:hover{background:#fafafa}
 .acts{white-space:nowrap}
 button{font-size:12px;padding:4px 10px;margin:1px;border:1px solid #aaa;border-radius:4px;background:#fff;cursor:pointer}
 button:hover{background:#f0f0f0}
 button.del{border-color:#d33;color:#d33} button.del:hover{background:#fff5f5}
 button.ok{border-color:#2a7a2a;color:#2a7a2a} button.ok:hover{background:#f3fff3}
 tr.done{opacity:0.35} tr.done button{display:none}
 .tabs{display:flex;gap:4px;margin-top:14px;border-bottom:2px solid #ddd}
 .tabs button{font-size:14px;padding:7px 16px;border:none;border-bottom:2px solid transparent;background:none;margin-bottom:-2px;color:#888;cursor:pointer}
 .tabs button.active{color:#111;border-bottom-color:#333;font-weight:600}
 #qcmap{height:520px;border:1px solid #ccc;border-radius:6px;margin-top:8px}
 .mapbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px}
 .mapbar input{font-size:13px;padding:5px 9px;border:1px solid #ccc;border-radius:5px;min-width:200px}
 .catfilters{display:flex;flex-wrap:wrap;gap:8px;font-size:12px;color:#555;margin-top:6px}
 .catf{white-space:nowrap;cursor:pointer}
 #listContainer{margin-top:10px;border:1px solid #e5e5e5;border-radius:6px}
 .lrow{border-bottom:1px solid #eee}
 .lrow:last-child{border-bottom:none}
 .lrow.open{background:#fafbff}
 .lhead{display:flex;align-items:center;gap:10px;padding:8px 10px;cursor:pointer}
 .lhead:hover{background:#f5f5f5}
 .ldot{width:11px;height:11px;border-radius:50%%;flex-shrink:0;border:1px solid #0003}
 .lname{font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
 .lcat{font-size:12px;color:#999;white-space:nowrap}
 .lgps{font-family:monospace;font-size:11px;color:#aaa;white-space:nowrap}
 .tA{font-size:11px;background:#e7f6e7;color:#2a7a2a;border-radius:8px;padding:1px 7px}
 .tB{font-size:11px;background:#fff0f0;color:#d33;border-radius:8px;padding:1px 7px}
 .ledit{display:none;padding:0 12px 12px 32px}
 .ledit.open{display:block}
 .erow{display:flex;align-items:center;gap:8px;margin:6px 0}
 .erow label{width:80px;font-size:12px;color:#777}
 .erow input,.erow select{font-size:13px;padding:5px 8px;border:1px solid #ccc;border-radius:5px}
 .erow input:first-of-type{flex:1}
 .mini{height:240px;border:1px solid #ccc;border-radius:6px;margin:6px 0}
 .ebtns{display:flex;gap:6px;margin-top:6px}
 #toast{position:fixed;bottom:14px;right:14px;background:#222;color:#fff;padding:8px 14px;border-radius:6px;font-size:13px;display:none}
</style></head><body>
<h1>QC \u2014 golden dataset Liberec</h1>
<p class="meta">%d m\u00edst \u00b7 %s<br>Ka\u017ed\u00e1 akce se ihned ukl\u00e1d\u00e1 do %s (z\u00e1loha: %s)</p>

<div class="tabs">
  <button id="tb-list" class="active" onclick="showTab('list')">\U0001F4CB Seznam</button>
  <button id="tb-check" onclick="showTab('check')">\U0001F50E Kontrola (mapa + duplicity)</button>
</div>

<div id="tab-list">
<!--LIST_HTML-->
</div>

<div id="tab-check" style="display:none">
<!--MAP_HTML-->

<h2>1. Podez\u0159el\u00e9 duplicity (<span id="dupCount">%d</span>)</h2>
<p class="meta">Otev\u0159i leteck\u00fd sn\u00edmek, nech bod bl\u00ed\u017e skute\u010dn\u00e9mu vchodu, druh\u00fd sma\u017e.</p>
<table><tr><th>Vzd\u00e1l.</th><th>M\u00edsto A</th><th>M\u00edsto B</th><th>Akce</th></tr>
%s</table>

<h2>2. Tier B \u2014 ov\u011b\u0159it polohu (<span id="bCount">%d</span>)</h2>
<table><tr><th>M\u00edsto</th><th>GPS</th><th>Akce</th></tr>
%s</table>
</div>

<div id="toast"></div>
<!--SCRIPTS-->
</body></html>""" % (
        len(places), summary, DATASET, BACKUP,
        len(dups), "\n".join(dup_rows),
        len(tier_b), "\n".join(b_rows))

    html = html.replace("<!--LIST_HTML-->", list_html)
    html = html.replace("<!--MAP_HTML-->", map_html)
    html = html.replace("<!--SCRIPTS-->", scripts)
    return html


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
        m = re.match(r"^/api/(delete|verify|keep_both|move|update)$", self.path)
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


def lan_ip():
    """Zjisti lokalni IP NASky (na kterou se pripojit v prohlizeci)."""
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))   # nic se neodesle, jen zjisti vychozi rozhrani
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "IP_NASKY"


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    ip = lan_ip()
    print("✓ QC server bezi (posloucha na vsech rozhranich, port %d)" % port)
    print("  → otevri v prohlizeci:  http://%s:%d" % (ip, port))
    print("    (nebo http://localhost:%d primo na NASce)" % port)
    print("  dataset: %s" % os.path.abspath(DATASET))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nKonec.")


if __name__ == "__main__":
    main()
