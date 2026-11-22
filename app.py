"""Interface locale du filtre PEA. Démarrage : python app.py."""
import json
import os
import tempfile
import threading
from datetime import date
from pathlib import Path

from flask import Flask, redirect, render_template, request, url_for

from market import COMPANIES, MAX_WINDOW, ROOT, latest_session, parse_symbols, scan

app = Flask(__name__)
CACHE = ROOT / ".cache" / "releve.json"
LOCK = threading.Lock()
FILTERS = {"signaux": "Signaux", "mm50": "MM50", "mm100": "MM100", "tout": "Toutes les valeurs"}


def load_report():
    try:
        return json.loads(CACHE.read_text(encoding="utf8"))
    except (OSError, ValueError):
        return json.loads((ROOT / "data/initial.json").read_text(encoding="utf8"))


def save_report(report):
    CACHE.parent.mkdir(exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=CACHE.parent, mode="w", encoding="utf8", delete=False) as f:
        path = Path(f.name)
        try:
            json.dump(report, f, ensure_ascii=False, allow_nan=False)
            f.close()
            os.replace(path, CACHE)
        finally:
            path.unlink(missing_ok=True)


@app.template_filter("prix")
def price(value):
    return f"{value:,.2f}".replace(",", " ").replace(".", ",")


@app.template_filter("jour")
def french_date(value):
    return date.fromisoformat(value).strftime("%d/%m/%Y")


def graph(history):
    keys = ("close", "m50", "m100")
    values = [p[k] for p in history for k in keys if p[k] is not None]
    if not values:
        return []
    low, high = min(values), max(values)
    paths = []
    for key, color in zip(keys, ("#172e29", "#167e65", "#ac6935")):
        segments = []
        move = True
        for i, point in enumerate(history):
            value = point[key]
            if value is None:
                move = True
                continue
            x = 8 + 320 * i / max(1, len(history)-1)
            y = 88 - 76 * (value-low) / (high-low or 1)
            segments.append(f"{'M' if move else 'L'}{x:.2f} {y:.2f}")
            move = False
        paths.append((color, " ".join(segments)))
    return paths


def page(message="", draft=None):
    report = load_report()
    rows = report["rows"]
    valid = [r for r in rows if "error" not in r]
    window = min(MAX_WINDOW, max(1, request.args.get("seances", 1, type=int)))
    mode = "exact" if request.args.get("mode") == "exact" else "recent"

    def matches(row, key):
        event = row[key]["event"]
        return event and (event["age"] == window if mode == "exact" else event["age"] <= window)

    hits = {k: [r for r in valid if matches(r, k)] for k in ("mm50", "mm100")}
    signals = [r for r in valid if matches(r, "mm50") or matches(r, "mm100")]
    selected = request.args.get("filtre", "signaux")
    if selected not in FILTERS:
        selected = "signaux"
    visible = {"signaux": signals, "tout": rows, **hits}[selected]
    details = [r for r in visible if "error" not in r]
    focus = next((r for r in details if r["ticker"] == request.args.get("titre")),
                 details[0] if details else None)
    criteria = (selected,) if selected in hits else ("mm50", "mm100")
    incomplete = sum(any(r[k]["coverage"] < window for k in criteria) for r in valid)
    return render_template("index.html", report=report, valid=valid, hits=hits, signals=signals,
                           selected=selected, filters=FILTERS, visible=visible, focus=focus,
                           window=window, mode=mode, limit=MAX_WINDOW, matches=matches, incomplete=incomplete,
                           paths=graph(focus["history"]) if focus else [], message=message,
                           editing=draft is not None or "liste" in request.args,
                           draft=draft if draft is not None else ", ".join(r["ticker"] for r in rows),
                           fresh=report["date"] == latest_session())


@app.get("/")
def home():
    return page()


@app.post("/analyser")
def refresh():
    action = request.form.get("action", "actualiser")
    draft = request.form.get("tickers", "") if action == "liste" else None
    try:
        with LOCK:
            previous = load_report()
            if action == "liste":
                symbols = parse_symbols(draft)
            elif action == "cac":
                symbols = list(COMPANIES)
            else:
                symbols = [r["ticker"] for r in previous["rows"]]
            report = scan(symbols, latest_session())
            if all("error" in r for r in report["rows"]):
                raise ValueError("Aucune valeur analysable. " + report["rows"][0]["error"])
            report["custom"] = symbols != list(COMPANIES)
            save_report(report)
    except (ValueError, OSError) as exc:
        return page(f"{exc} Le relevé précédent reste affiché.", draft)
    return redirect(url_for("home", seances=request.args.get("seances"), mode=request.args.get("mode"),
                            filtre=request.args.get("filtre")), code=303)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8792, debug=False)
