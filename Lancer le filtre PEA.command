#!/bin/zsh
set -eu
cd -- "${0:A:h}"
export PATH="/opt/homebrew/opt/node@22/bin:/usr/local/opt/node@22/bin:$PATH"
url="http://127.0.0.1:8792/"
if curl -fsS --max-time 2 "$url" 2>/dev/null | grep -Fq 'Filtre PEA · Signaux de clôture'; then
  open "$url"
  exit 0
fi
if ! command -v node >/dev/null || [[ ! -f dist/server/wrangler.json ]]; then
  print "Le lancement nécessite Node.js 22 et la version construite dans ce dossier."
  read -k 1
  exit 1
fi
npm run start -- --port 8792 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT
for attempt in {1..40}; do
  if curl -fsS --max-time 2 "$url" 2>/dev/null | grep -Fq 'Filtre PEA · Signaux de clôture'; then
    open "$url"
    print "Le filtre est ouvert. Garde cette fenêtre ouverte pendant son utilisation."
    wait "$server_pid"
    exit 0
  fi
  kill -0 "$server_pid" 2>/dev/null || exit 1
  sleep 1
done
print "Le serveur local ne répond pas sur le port 8792."
exit 1
