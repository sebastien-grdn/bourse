"""Calcul des signaux de clôture et accès aux historiques Yahoo Finance."""
import json
import math
import re
from functools import lru_cache
import ssl
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

import certifi

ROOT = Path(__file__).resolve().parent
COMPANIES = {item["ticker"]: item["name"] for item in
             json.loads((ROOT / "data/cac40.json").read_text(encoding="utf8"))}
PARIS = ZoneInfo("Europe/Paris")
MAX_WINDOW = 100
TLS = ssl.create_default_context(cafile=certifi.where())


def easter_sunday(year):
    """Algorithme grégorien de Meeus pour les fermetures de Pâques."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    g = (b - (b + 8) // 25 + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    k, i = divmod(c, 4)
    l = (32 + 2 * e + 2 * k - h - i) % 7
    m = (a + 11 * h + 22 * l) // 451
    month, day = divmod(h + l - 7 * m + 114, 31)
    return date(year, month, day + 1)


def latest_session(now=None):
    now = (now or datetime.now(PARIS)).astimezone(PARIS)
    day = now.date()
    half_day = day.month == 12 and day.day in (24, 31)
    if now.time() < (time(14, 25) if half_day else time(18)):
        day -= timedelta(days=1)
    while True:
        easter = easter_sunday(day.year)
        if (day.weekday() < 5 and (day.month, day.day) not in
            {(1, 1), (5, 1), (12, 25), (12, 26)} and
            day not in (easter - timedelta(days=2), easter + timedelta(days=1))):
            return day.isoformat()
        day -= timedelta(days=1)


def parse_symbols(text):
    short = {symbol.split(".")[0]: symbol for symbol in COMPANIES}
    symbols = []
    for raw in re.split(r"[\s,;]+", text.strip().upper()):
        if not raw:
            continue
        symbol = raw if "." in raw else short.get(raw, raw + ".PA")
        if not re.fullmatch(r"[A-Z0-9-]{1,16}\.(PA|AS|BR|LS)", symbol):
            raise ValueError(f"Ticker invalide ou place non prise en charge : {raw}")
        if symbol not in symbols:
            symbols.append(symbol)
    if not symbols:
        raise ValueError("Saisis au moins un ticker.")
    return symbols


def fetch_chart(symbol):
    url = "https://query1.finance.yahoo.com/v8/finance/chart/" + quote(symbol, safe="")
    request = Request(url + "?range=1y&interval=1d", headers={
        "User-Agent": "Mozilla/5.0", "Accept": "application/json"})
    try:
        with urlopen(request, timeout=15, context=TLS) as response:
            chart = json.load(response)["chart"]["result"][0]
        if chart["meta"]["symbol"] != symbol or not chart["timestamp"]:
            raise ValueError
        return chart
    except HTTPError as exc:
        raise ValueError(f"Cours indisponible auprès de Yahoo Finance (HTTP {exc.code}).") from exc
    except (OSError, URLError, ValueError, KeyError, IndexError, TypeError) as exc:
        raise ValueError("Historique Yahoo Finance indisponible.") from exc


def candles(chart):
    prices = chart["indicators"]["quote"][0]["close"]
    return {datetime.fromtimestamp(t, timezone.utc).date().isoformat(): p
            for t, p in zip(chart["timestamp"], prices)
            if isinstance(p, (int, float)) and math.isfinite(p) and p > 0}


def evaluate(chart, sessions, end):
    dates = sorted(d for d in sessions if d <= end)
    if not dates or dates[-1] != end:
        raise ValueError("La clôture de référence manque.")
    series = candles(chart)
    prices = [series.get(d) for d in dates]
    if len(prices) < 101 or None in prices[-101:]:
        raise ValueError("Historique incomplet sur les 101 dernières séances.")

    @lru_cache(maxsize=None)
    def average(stop, period):
        sample = prices[max(0, stop-period):stop]
        if len(sample) == period and None not in sample:
            return math.fsum(sample) / period
        return None

    def signal(period):
        previous = average(len(prices)-1, period)
        current = average(len(prices), period)
        result = {"previous": previous, "current": current, "crossed": False,
                  "event": None, "coverage": MAX_WINDOW}
        if prices[-1] <= current:
            return result

        # Remonter uniquement la séquence ininterrompue au-dessus de la moyenne.
        for age in range(1, MAX_WINDOW + 1):
            stop = len(prices) - age + 1
            before = average(stop-1, period)
            if before is None:
                result["coverage"] = age - 1
                break
            if prices[stop-2] <= before:
                result["crossed"] = age == 1
                result["event"] = {"age": age, "date": dates[stop-1],
                                   "close": prices[stop-1], "average": average(stop, period),
                                   "previous_date": dates[stop-2], "previous_close": prices[stop-2],
                                   "previous_average": before}
                break
        return result

    start = (date.fromisoformat(end) - timedelta(days=29)).isoformat()
    history = [{"date": d, "close": prices[i], "m50": average(i+1, 50),
                "m100": average(i+1, 100)} for i, d in enumerate(dates) if d >= start]
    return {"date": end, "prevDate": dates[-2], "prevClose": prices[-2], "close": prices[-1],
            "currency": chart["meta"]["currency"], "mm50": signal(50), "mm100": signal(100),
            "history": history}


def scan(symbols, end, fetch=fetch_chart):
    sessions = candles(fetch("^FCHI"))
    if end not in sessions:
        raise ValueError("La clôture de référence du CAC 40 est en attente.")

    def read(symbol):
        row = {"ticker": symbol, "name": COMPANIES.get(symbol, symbol)}
        try:
            chart = fetch(symbol)
            row["name"] = COMPANIES.get(symbol) or chart["meta"].get("shortName") or symbol
            row.update(evaluate(chart, sessions, end))
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            row["error"] = str(exc) if isinstance(exc, ValueError) else "Historique incomplet."
        return row

    with ThreadPoolExecutor(max_workers=4) as pool:
        return {"date": end, "rows": list(pool.map(read, symbols))}
