import { candles, evaluate, fetchChart, latestSession } from '../../../lib/market.mjs';

export async function POST(request: Request) {
  let symbols: unknown;
  try { symbols = (await request.json() as {symbols?:unknown}).symbols; } catch {}
  if (!Array.isArray(symbols) || symbols.length === 0 || symbols.length > 8 ||
      !symbols.every(s => typeof s === 'string' && /^[A-Z0-9-]{1,16}\.(PA|AS|BR|LS)$/.test(s))) {
    return Response.json({error:'Lot de tickers invalide.'},{status:400});
  }
  const date = latestSession();
  try {
    const benchmark = await fetchChart('^FCHI');
    const sessions = [...candles(benchmark).keys()].sort();
    if (!sessions.includes(date)) throw Error('La clôture de référence du CAC 40 est en attente.');
    const rows = await Promise.all(symbols.map(async ticker => {
      try {
        const chart = await fetchChart(ticker);
        return {ticker, name:chart.meta.shortName || ticker, ...evaluate(chart,sessions,date)};
      } catch (e) { return {ticker, error:e instanceof Error ? e.message : 'Cours indisponible.'}; }
    }));
    return Response.json({date,rows});
  } catch (e) {
    return Response.json({error:e instanceof Error ? e.message : 'Source indisponible.'},{status:503});
  }
}
