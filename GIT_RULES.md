# Git pravidla — Weasley Hours

## Struktura repozitáře
- Repo je v: `/volume1/docker/weasley/`
- Remote: `https://github.com/strachondavid-stack/Weasley_hours`
- Branch: `master`

## Co je v gitu (POUZE tyto soubory)
```
server/index.js
server/public/index.html
.gitignore
GIT_RULES.md
```

## Co NENÍ v gitu (zůstává jen na Synology)
```
server/package.json
server/package-lock.json
server/node_modules/
server/public/img/
server/public/fonts/
mosquitto/
docker-compose.yml
```

## Jak stáhnout změny na Synology
```bash
cd /volume1/docker/weasley && git pull
```
NIKDY nepoužívat `git reset --hard` — smaže lokální soubory!

## Jak pushovat změny
```bash
cd /volume1/docker/weasley
git add server/index.js        # nebo index.html
git commit -m "popis změny"
git push
```

## Remote URL s tokenem (aby nežádal heslo)
```bash
git remote set-url origin https://GITHUB_TOKEN@github.com/strachondavid-stack/Weasley_hours.git
```

## Po každém git pull — restart serveru
```bash
sudo docker restart weasley-server
```

## Struktura na Synology
```
/volume1/docker/weasley/
├── docker-compose.yml
├── GIT_RULES.md
├── .gitignore
├── mosquitto/
│   ├── config/mosquitto.conf
│   ├── data/
│   └── log/
└── server/                    ← mountováno jako /app
    ├── index.js
    ├── package.json
    ├── package-lock.json
    ├── node_modules/
    └── public/
        ├── index.html
        ├── fonts/
        │   └── TopoRucniClean-Regular.ttf
        └── img/
            ├── hodiny.jpg
            ├── places/
            └── motion/
```
