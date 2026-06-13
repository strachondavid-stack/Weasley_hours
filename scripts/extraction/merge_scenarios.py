# -*- coding: utf-8 -*-
"""
merge_scenarios.py — vlozi vygenerovanou kategorii 'rodiny' do scenarios_data.json.

Nacte scenarios_generated.json a sloucenim ho zapise do scenarios_data.json:
  - existujici kategorie 'rodiny' se nahradi (idempotentni)
  - ostatni kategorie (vylety, tesco, globus) zustanou nedotcene
  - pred zapisem zaloha scenarios_data.backup.json

    python3 merge_scenarios.py [scenarios_data.json] [scenarios_generated.json]

Po slouceni: bud zkopiruj do /app/public/ a restartuj, NEBO posli pres
    curl -X PUT http://localhost:3000/scenarios -H 'Content-Type: application/json' \\
         --data @scenarios_data.json
"""

import json
import os
import shutil
import sys
from datetime import datetime

TARGET = sys.argv[1] if len(sys.argv) > 1 else "scenarios_data.json"
GEN = sys.argv[2] if len(sys.argv) > 2 else "scenarios_generated.json"


def main():
    with open(GEN, encoding="utf-8") as f:
        gen = json.load(f)
    new_cat = gen["category"]

    try:
        with open(TARGET, encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        print("! %s neexistuje — vytvarim novy" % TARGET)
        data = {"version": 1, "categories": []}

    if not isinstance(data.get("categories"), list):
        print("! %s nema ocekavanou strukturu (categories[])" % TARGET)
        return 1

    # zaloha
    if os.path.exists(TARGET):
        bak = TARGET.replace(".json", ".backup.json")
        shutil.copy(TARGET, bak)
        print("✓ Zaloha: %s" % bak)

    cats = data["categories"]
    existing = next((i for i, c in enumerate(cats) if c.get("id") == new_cat["id"]), None)
    if existing is not None:
        old_n = len(cats[existing].get("scenarios", []))
        cats[existing] = new_cat
        print("✓ Nahrazena kategorie '%s' (%d -> %d scenaru)"
              % (new_cat["id"], old_n, len(new_cat["scenarios"])))
    else:
        cats.append(new_cat)
        print("✓ Pridana kategorie '%s' (%d scenaru)"
              % (new_cat["id"], len(new_cat["scenarios"])))

    data["version"] = data.get("version", 1)
    data["merged"] = datetime.now().isoformat()

    tmp = TARGET + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, TARGET)

    print("\nKategorie v %s:" % TARGET)
    for c in data["categories"]:
        print("  %-16s %3d scenaru" % (c.get("id"), len(c.get("scenarios", []))))
    print("\n✓ Hotovo. Nahraj na server pres PUT /scenarios nebo zkopiruj do /app/public/")


if __name__ == "__main__":
    sys.exit(main())
