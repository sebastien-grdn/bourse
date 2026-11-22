const DAY = 86400000;
const parisClock = new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Paris', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit'});
const iso = date => date.toISOString().slice(0, 10);

// Gregorian Easter (Meeus/Jones/Butcher) for the two movable exchange holidays.
function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const g = Math.floor((b - Math.floor((b + 8) / 25) + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const l = (32 + 2 * e + 2 * Math.floor(c / 4) - h - c % 4) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return Date.UTC(year, Math.floor(n / 31) - 1, n % 31 + 1);
}

export function latestSession(now = new Date()) {
  const [today, time] = parisClock.format(now).split(' ');
  let day = Date.parse(today + 'T00:00:00Z');
  const early = /-12-(24|31)$/.test(today);
  // Allow for the closing auction and publication delay before using today's candle.
  if (time < (early ? '14:25' : '18:00')) day -= DAY;
  for (;; day -= DAY) {
    const date = new Date(day), weekday = date.getUTCDay(), key = iso(date);
    const easter = easterSunday(date.getUTCFullYear());
    if (weekday > 0 && weekday < 6 && !/-(01-01|05-01|12-25|12-26)$/.test(key)
        && day !== easter - 2 * DAY && day !== easter + DAY) return key;
  }
}

export function candles(chart) {
  const rows = new Map();
  const prices = chart.indicators.quote[0].close;
  for (const [i,t] of chart.timestamp.entries()) {
    const p = prices[i];
    if (Number.isFinite(p) && p > 0) rows.set(iso(new Date(t * 1000)), p);
  }
  return rows;
}

export function evaluate(chart, sessions, end) {
  const dates = sessions.filter(d => d <= end);
  if (dates.at(-1) !== end) throw Error('La clôture de référence manque.');
  const series = candles(chart);
  const values = dates.map(d => series.get(d));
  if (values.length < 101 || values.slice(-101).some(p => p === undefined))
    throw Error('Historique incomplet sur les 101 dernières séances.');
  function average(index, period) {
    const sample = values.slice(Math.max(0, index - period + 1), index + 1);
    if (sample.length !== period || sample.includes(undefined)) return null;
    return sample.reduce((a,b) => a+b, 0) / period;
  }
  const i = dates.length - 1;
  function signal(period) {
    const previous = average(i-1, period), current = average(i, period);
    return {previous, current, crossed: values[i-1] <= previous && values[i] > current};
  }
  const start = iso(new Date(Date.parse(end) - 29 * DAY));
  return {date:end, prevDate:dates[i-1], close:values[i], prevClose:values[i-1],
    mm50:signal(50), mm100:signal(100), currency:chart.meta.currency,
    history:dates.flatMap((d,j) => d < start ? [] : [{date:d, close:values[j], m50:average(j,50), m100:average(j,100)}])};
}

export async function fetchChart(symbol) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) + '?range=1y&interval=1d';
  const response = await fetch(url, {headers:{'User-Agent':'Mozilla/5.0',Accept:'application/json'},signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw Error('Cours indisponible auprès de Yahoo Finance (' + response.status + ').');
  const chart = (await response.json()).chart?.result?.[0];
  if (!chart?.timestamp?.length || chart.meta.symbol !== symbol) throw Error('Ticker ou historique indisponible.');
  return chart;
}
