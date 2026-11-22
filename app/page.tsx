'use client';
import {useEffect, useState} from 'react';
import companies from '../lib/cac40.json';
import initial from '../lib/initial.json';
import {latestSession} from '../lib/market.mjs';

type Result = typeof initial.rows[number];
type Row = Result | {ticker:string, name?:string, error:string};
type Scan = {date:string, rows:Row[], custom:boolean};
const seed:Scan = {...initial,custom:false};
const money = (v:number) => v.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2});
const dateText = (s:string) => new Date(s+'T12:00:00Z').toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const known = new Map(companies.map(c=>[c.ticker,c.name]));
const isResult = (r:Row):r is Result => !('error' in r);
const cacheKey = 'filtre-pea.scan.v1';
const filters = ['Signaux','MM50','MM100','Toutes les valeurs'];

function History({row}:{row:Result}) {
  const points = row.history;
  const keys = ['close','m50','m100'] as const;
  const prices = points.flatMap(p=>keys.map(k=>p[k])).filter(Number.isFinite);
  const lo=Math.min(...prices), hi=Math.max(...prices);
  const x=(i:number)=> 8+320*i/Math.max(1,points.length-1);
  const y=(v:number)=> 88-76*(v-lo)/(hi-lo||1);
  return <section className="detail"><div><span className="label">Détail sur 30 jours</span><h3>{row.name}</h3><small>{row.ticker} · {row.currency}</small></div>
    <div><svg viewBox="0 0 336 100" role="img" aria-label={'Cours et moyennes mobiles de '+row.name+' sur les 30 derniers jours'}>
      {[12,50,88].map(v=><line key={v} x1="0" x2="336" y1={v} y2={v} stroke="#d8dfdc" strokeDasharray="3 4"/>)}
      {keys.map((key,k)=><path key={key} fill="none" stroke={['#172e29','#167e65','#ac6935'][k]} strokeWidth={k===0?2.7:1.8}
        d={points.map((p,i)=>Number.isFinite(p[key]) ? ((i && Number.isFinite(points[i-1][key]))?'L':'M')+x(i)+' '+y(p[key]) : '').join(' ')}/>)}
    </svg><div className="legend"><span>Clôture</span><span>MM50</span><span>MM100</span></div></div>
    <table className="pair"><caption>Vérification du franchissement</caption><thead><tr><th>Séance</th><th>Clôture</th><th>MM50</th><th>MM100</th></tr></thead><tbody>
    {[[row.prevDate,row.prevClose,row.mm50.previous,row.mm100.previous],[row.date,row.close,row.mm50.current,row.mm100.current]].map(([d,...v])=><tr key={d}><td>{String(d).slice(5).split('-').reverse().join('/')}</td>{v.map((n,i)=><td key={i}>{money(Number(n))}</td>)}</tr>)}</tbody></table></section>;
}

export default function Home(){
  const [scan,setScan]=useState<Scan>(seed),[filter,setFilter]=useState(0),[selected,select]=useState('CAP.PA');
  const [edit,setEdit]=useState(false),[draft,setDraft]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[target,setTarget]=useState(initial.date);
  useEffect(()=>{setTarget(latestSession());try{const saved=JSON.parse(localStorage.getItem(cacheKey)||'null');if(saved?.rows?.length && saved?.date && saved.rows.every((r:Row)=>r.ticker && ('error' in r || (r.mm50 && r.mm100 && Array.isArray(r.history)))))setScan(saved);}catch{}},[]);
  const valid=scan.rows.filter(isResult), bad=scan.rows.filter(r=>!isResult(r));
  const hits=valid.filter(r=>r.mm50.crossed||r.mm100.crossed);
  const shown=scan.rows.filter(r=>filter===3 || (isResult(r) && (filter===1?r.mm50.crossed:filter===2?r.mm100.crossed:r.mm50.crossed||r.mm100.crossed)));
  const detail=shown.find(r=>r.ticker===selected && isResult(r)) || shown.find(isResult);
  async function run(symbols:string[], custom:boolean) {
    if(busy)return;
    const expected=latestSession();setTarget(expected);setBusy(true);setEdit(false);setMessage('');
    const rows:Row[]=[];
    try{
      for(let i=0;i<symbols.length;i+=8){
        const batch=symbols.slice(i,i+8);
        setMessage('Analyse en cours · '+i+' / '+symbols.length);
        try{
          const response=await fetch('/api/analyse',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({symbols:batch})});
          const data=await response.json() as {date?:string, rows?:Row[], error?:string};
          if(!response.ok || data.date!==expected || !Array.isArray(data.rows))throw Error(data.error || 'Séance indisponible.');
          rows.push(...data.rows.map((r:Row)=>({...r,name:known.get(r.ticker)||r.name||r.ticker})));
        }catch(e){rows.push(...batch.map(ticker=>({ticker,name:known.get(ticker),error:e instanceof Error?e.message:'Données indisponibles.'})));}
      }
      const next={date:expected,custom,rows};
      if(!rows.some(isResult) && scan.custom===custom && symbols.join(',')===scan.rows.map(r=>r.ticker).join(',')){
        setMessage('Actualisation impossible. Dernier relevé conservé. '+('error' in rows[0]?rows[0].error:''));
      }else{
        setScan(next);setFilter(rows.some(isResult)?0:3);setMessage(rows.some(isResult)?'Analyse terminée.':'Aucune valeur analysable.');
        try{localStorage.setItem(cacheKey,JSON.stringify(next));}catch{}
      }
    }finally{setBusy(false);}
  }
  function applyList(){
    const symbols=[...new Set(draft.trim().toUpperCase().split(/[\s,;]+/).filter(Boolean).map(s=>s.includes('.')?s:(companies.find(c=>c.ticker.split('.')[0]===s)?.ticker || s+'.PA')))];
    if(!symbols.length || symbols.some(s=>!/^[A-Z0-9-]{1,16}\.(PA|AS|BR|LS)$/.test(s))){setMessage('Saisis au moins un ticker de Paris, Amsterdam, Bruxelles ou Lisbonne.');return;}
    void run(symbols,true);
  }
  return <main><header><div className="brand"><b aria-hidden="true">∿</b> Filtre PEA</div><span>Analyse technique</span></header>
    <section className="intro"><div><span className="label">{scan.custom?'Liste personnelle':'Univers CAC 40'}</span><h1>Signaux de clôture</h1><p>Franchissements haussiers des moyennes mobiles à 50 et 100 séances.</p></div>
    <button className="primary" disabled={busy} onClick={()=>run(scan.rows.map(r=>r.ticker),scan.custom)}>{busy?'Analyse en cours…':'Actualiser les cours'}</button></section>
    <div className="asof"><strong>Séance du {dateText(scan.date)}</strong><span>{scan.date!==target?'Relevé antérieur · actualisation nécessaire':'Dernière séance clôturée'}</span></div>
    <section className="stats"><article><span>Valeurs analysées</span><strong>{valid.length}<em> / {scan.rows.length}</em></strong></article><article><span>Franchissements MM50</span><strong>{valid.length?valid.filter(r=>r.mm50.crossed).length:'—'}</strong></article><article><span>Franchissements MM100</span><strong>{valid.length?valid.filter(r=>r.mm100.crossed).length:'—'}</strong></article></section>
    <section className="results"><div className="tools"><h2>Résultats</h2><button disabled={busy} onClick={()=>{setDraft(scan.rows.map(r=>r.ticker).join(', '));setEdit(!edit);setMessage('')}}>{edit?'Fermer':'Modifier la liste'}</button></div>
    {edit && <section className="editor"><label htmlFor="symbols">Tickers à analyser</label><p>Sépare les symboles par des virgules ou des retours à la ligne. Paris (.PA) est la place par défaut hors CAC 40. Amsterdam (.AS), Bruxelles (.BR) et Lisbonne (.LS) sont aussi disponibles.</p><textarea id="symbols" value={draft} onChange={e=>setDraft(e.target.value)} rows={4}/><div><button className="primary" onClick={applyList}>Analyser cette liste</button> <button onClick={()=>run(companies.map(c=>c.ticker),false)}>Reprendre le CAC 40</button></div></section>}
    <div className="filters" aria-label="Filtrer les résultats">{filters.map((f,i)=><button aria-pressed={filter===i} key={f} onClick={()=>setFilter(i)}>{f}{i===0?' · '+hits.length:''}</button>)}</div>
    {message && <p role="status">{message}</p>}
    {bad.length>0 && <p className="warn">{bad.length} valeur(s) indisponible(s). Consulte « Toutes les valeurs » pour le détail.</p>}
    <div className="scroll"><table><thead><tr><th>Entreprise</th><th>Clôture</th><th>MM50</th><th>MM100</th><th>Signal</th></tr></thead><tbody>
    {shown.map(r=><tr key={r.ticker}><td>{isResult(r)?<button className="name" onClick={()=>select(r.ticker)}>{r.name}</button>:r.name||r.ticker}<small>{r.ticker}</small></td>{isResult(r)?<><td>{money(r.close)} <small className="currency">{r.currency}</small></td><td>{money(r.mm50.current)}</td><td>{money(r.mm100.current)}</td><td>{r.mm50.crossed && <b className="tag">MM50</b>}{r.mm100.crossed && <b className="tag">MM100</b>}{!r.mm50.crossed && !r.mm100.crossed?'—':''}</td></>:<td colSpan={4}>{r.error}</td>}</tr>)}</tbody></table></div>
    {shown.length===0 && <p className="empty">{valid.length?'Aucun franchissement pour ce filtre sur les valeurs analysées.':'Aucun cours exploitable pour cette séance.'}</p>}</section>
    {detail && isResult(detail) && <History row={detail}/>}
    <footer><details><summary>Méthode et sources</summary><p>Chaque moyenne mobile simple utilise les clôtures journalières, hors réinvestissement des dividendes. Le signal exige une clôture précédente inférieure ou égale à sa moyenne, puis une dernière clôture strictement supérieure à sa nouvelle moyenne. La comparaison utilise les cours avant arrondi.</p><p>Le graphique couvre 30 jours calendaires. L’analyse exige 101 clôtures consécutives et retient la séance du jour à partir de 18 h à Paris (14 h 25 les demi-séances de fin d’année). Les dates sont contrôlées avec l’historique du CAC 40.</p><p>La liste de test reprend la composition de novembre 2026. Pour ton PEA, utilise la liste éligible fournie par ton courtier.</p><a href="https://live.euronext.com/fr/product/indices/FR0003500008-XPAR">Composition Euronext</a> · <a href="https://fr.finance.yahoo.com/quote/%5EFCHI/history/">Clôtures Yahoo Finance</a></details></footer>
  </main>;
}
