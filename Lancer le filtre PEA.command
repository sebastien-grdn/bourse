#!/bin/zsh
set -eu
cd -- "${0:A:h}"
url="http://127.0.0.1:8792/"
if [[ ! -x .venv/bin/python ]]; then
  python3 -m venv .venv
fi
if ! .venv/bin/python -c 'import flask, certifi; from zoneinfo import ZoneInfo; ZoneInfo("Europe/Paris")' 2>/dev/null; then
  .venv/bin/python -m pip install -r requirements.txt
fi
if curl -fsS --max-time 2 "$url" 2>/dev/null | grep -Fq 'Filtre PEA · Signaux de clôture'; then
  open "$url"
  exit 0
fi
.venv/bin/python app.py &
pid=$!
trap 'kill "$pid" 2>/dev/null || true' EXIT
for attempt in {1..30}; do
  if curl -fsS --max-time 2 "$url" 2>/dev/null | grep -Fq 'Filtre PEA · Signaux de clôture'; then
    open "$url"
    wait "$pid"
    exit 0
  fi
  kill -0 "$pid" 2>/dev/null || exit 1
  sleep 1
done
print "Le serveur local ne répond pas sur le port 8792."
exit 1
