// calc.jsx — interactive ICE vs EV total-cost-of-ownership calculator (Voltage)
const { useState, useMemo, useEffect, useRef } = React;

// Injected by config.local.js (loaded before this script).
const API_BASE = window.API_BASE || '';

/* ---------- helpers ---------- */
const group = (n) => Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const R = (n) => 'R ' + group(n);
const Rk = (n) => 'R ' + (Math.round(n / 100) / 10).toFixed(1).replace(/\.0$/, '') + 'k';
// Declining-balance book (resale) value after `yr` years.
const book = (price, dep, yr) => price * Math.pow(1 - (dep || 0) / 100, yr);
const insFromPrice = (price) => Math.round((price * 0.038) / 1000) * 1000;

/* ---------- listing autofill ----------
   A browser cannot read another origin's HTML (CORS), so "paste any link and it
   fills in" cannot work in page JavaScript. The link goes to /api/listing,
   which fetches the advert server-side, scrapes make/model/year/price out of
   it, estimates the figures adverts never publish (consumption, servicing,
   depreciation), and returns live electric alternatives in the same price band.
   See api/listing.js. */
async function fetchListing(url) {
  const r = await fetch(API_BASE + '/api/listing?url=' + encodeURIComponent(url));
  let body = null;
  try { body = await r.json(); } catch (e) { /* error page wasn't JSON */ }
  if (!r.ok) {
    throw new Error((body && (body.message || body.error))
      || 'Lookup failed (' + r.status + '). Is the backend running?');
  }
  return body;
}

// Annual running cost and net cost-to-date, shared by the headline result and
// by every alternative card so the numbers on screen always agree.
const runCost = (v, annualKm) => (annualKm / 100) * (v.use || 0) * (v.fuel || 0) + (v.ins || 0) + (v.maint || 0);
const netCost = (v, annualKm, years) =>
  (v.price || 0) - book(v.price || 0, v.dep || 0, years) + years * runCost(v, annualKm);

/* ---------- icons ---------- */
const I = {
  fuel: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 22h12V4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v18z"/><path d="M15 9h2.5A1.5 1.5 0 0 1 19 10.5V16a2 2 0 0 0 4 0V8l-3-3"/><path d="M6 8h6"/></svg>,
  bolt: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg>,
  link: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>,
  shield: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l8 3v6c0 5-3.4 8.5-8 11-4.6-2.5-8-6-8-11V5l8-3z"/></svg>,
  wrench: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a4 4 0 0 0 5 5L21 12l-9 9-4-4 9-9 .7-.7z"/><path d="M3 21l4-4"/></svg>,
  down: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>,
  trend: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M19 7l-6 6-3-3-4 4"/></svg>,
  flag: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22V4M4 4h13l-2 4 2 4H4"/></svg>,
};

/* ---------- field ---------- */
function Field({ label, value, onChange, pre, suf, text, span, est }) {
  return (
    <div className="field" style={span ? { gridColumn: '1 / -1' } : null}>
      <label>{label}{est && <span className="est" title="Estimated — the advert does not publish this">est.</span>}</label>
      <div className="inp">
        {pre && <span className="pre">{pre}</span>}
        <input
          type={text ? 'text' : 'number'}
          value={value}
          onChange={(e) => onChange(text ? e.target.value : (e.target.value === '' ? 0 : Number(e.target.value)))}
        />
        {suf && <span className="suf">{suf}</span>}
      </div>
    </div>
  );
}

/* ---------- vehicle panel ---------- */
// `head` is the slot above the fields: the paste bar on the combustion side,
// the live alternatives list on the electric side.
function Panel({ kind, d, set, head, chips, est }) {
  const ev = kind === 'ev';
  const up = (k) => (v) => set({ ...d, [k]: v });
  const isEst = (k) => !!(est && est.indexOf(k) !== -1);
  return (
    <div className={'panel ' + kind}>
      <div className="panel-head">
        <div className="ico">{ev ? I.bolt : I.fuel}</div>
        <div>
          <h2>{ev ? 'Electric' : 'Combustion'}</h2>
          <div className="sub">{ev ? 'The alternative' : 'The car you found'}</div>
        </div>
        <div className="badge">{ev ? 'EV' : 'ICE'}</div>
      </div>
      {head}
      {chips && chips.length > 0 && (
        <div className="chips">{chips.map((c, i) => <span key={i} className="chip">{c}</span>)}</div>
      )}
      <div className="fields">
        <Field span text label="Vehicle" value={d.name} onChange={up('name')} />
        <Field span pre="R" label="Purchase price" value={d.price} onChange={up('price')} />
        <div className="frow">
          <Field label={ev ? 'Energy use' : 'Fuel use'} suf={ev ? 'kWh/100' : 'L/100'} value={d.use} onChange={up('use')} est={isEst('use')} />
          <Field pre="R" suf={ev ? '/kWh' : '/L'} label={ev ? 'Electricity' : 'Fuel price'} value={d.fuel} onChange={up('fuel')} />
        </div>
        <div className="frow">
          <Field pre="R" label="Insurance / yr" value={d.ins} onChange={up('ins')} est={isEst('ins')} />
          <Field pre="R" label="Maintenance / yr" value={d.maint} onChange={up('maint')} est={isEst('maint')} />
        </div>
        <Field span suf="%/yr" label="Depreciation (sets resale value)" value={d.dep} onChange={up('dep')} est={isEst('dep')} />
      </div>
    </div>
  );
}

/* ---------- paste bar ---------- */
function PasteBar({ onFound, onBusy }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const go = async () => {
    const t = url.trim();
    if (!t) { setMsg({ ok: false, text: 'Paste a link to a car advert first.' }); return; }
    setBusy(true); onBusy(true); setMsg(null);
    try {
      const data = await fetchListing(t);
      onFound(data);
      setMsg({ ok: true, text: 'Loaded “' + data.vehicle.name + '”' });
    } catch (e) {
      setMsg({ ok: false, text: (e && e.message) || 'Could not read that listing.' });
      onFound(null);
    } finally { setBusy(false); onBusy(false); }
  };

  return (
    <div>
      <div className="urlbar">
        {I.link}
        <input placeholder="Paste a car advert link (autotrader.co.za)…" value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !busy) go(); }} />
        <button onClick={go} disabled={busy}>{busy ? 'Reading…' : 'Autofill'}</button>
      </div>
      {msg && <div className={'urlmsg' + (msg.ok ? ' ok' : '')}>{msg.text}</div>}
    </div>
  );
}

/* ---------- electric alternatives ---------- */
// Live EV stock in the same money as the pasted car. Each card carries the one
// number that matters — what it does to the total over the analysis period.
function Alternatives({ list, loading, pickedUrl, onPick, base, annualKm, period, evRate }) {
  if (loading) {
    return <div className="alts"><div className="alt-skel" /><div className="alt-skel" /><div className="alt-skel" /></div>;
  }
  if (!list || !list.length) {
    return (
      <div className="alts empty">
        Paste a car advert on the left and live electric alternatives in the same
        price range appear here, each costed against it.
      </div>
    );
  }
  const baseNet = base && base.price ? netCost(base, annualKm, period) : null;
  return (
    <div className="alts">
      <div className="alts-head">
        <span className="t">Electric alternatives</span>
        <span className="s">live stock · same price range</span>
      </div>
      {list.map((a) => {
        // Must mirror pickAlt exactly, insurance included — the API doesn't
        // return `ins`, and omitting it here made the card promise a saving
        // ~R100k larger than the one you get after clicking it.
        const cand = { price: a.price, use: a.use, fuel: evRate, ins: insFromPrice(a.price), maint: a.maint, dep: a.dep };
        const net = netCost(cand, annualKm, period);
        const delta = baseNet == null ? null : baseNet - net;
        return (
          <button key={a.id} className={'alt' + (pickedUrl === a.url ? ' on' : '')} onClick={() => onPick(a)}>
            <div className="alt-top">
              <span className="nm">{a.name}</span>
              <span className="pr mono-num">{R(a.price)}</span>
            </div>
            <div className="alt-sub">
              {[a.year, a.condition, a.transmission].filter(Boolean).join(' · ')}
            </div>
            {delta != null && (
              <div className={'alt-delta' + (delta > 0 ? ' good' : ' bad')}>
                {delta > 0 ? 'Saves ' : 'Costs '}{R(Math.abs(delta))}<span> over {period} yr vs the car you found</span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- chart ---------- */
function Chart({ data, period, be }) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDrawn(true), 200); return () => clearTimeout(t); }, []);
  const W = 880, H = 300, padL = 52, padR = 12, padT = 16, padB = 26;
  const maxV = Math.max(...data.map((d) => Math.max(d.ICE, d.EV))) * 1.04 || 1;
  const x = (i) => padL + (i / period) * (W - padL - padR);
  const y = (v) => padT + (1 - v / maxV) * (H - padT - padB);
  const line = (key) => data.map((d, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(d[key]).toFixed(1)).join(' ');
  const valAt = (key, t) => { const f = Math.floor(t), c = Math.min(f + 1, data.length - 1); return data[f][key] + (t - f) * (data[c][key] - data[f][key]); };
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((p) => p * maxV);

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className={'ch-svg' + (drawn ? ' drawn' : '')} style={{ overflow: 'visible', display: 'block' }}>
        {yTicks.map((v, i) => (
          <g key={i}>
            <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="var(--line-2)" strokeWidth="1" />
            <text x={padL - 10} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--fg-3)">{v === 0 ? '0' : Rk(v)}</text>
          </g>
        ))}
        {data.map((d, i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--fg-3)">{i === 0 ? 'Yr 0' : i}</text>
        ))}
        <path d={line('ICE')} className="c-ice" stroke="var(--fg-3)" />
        <path d={line('EV')} className="c-ev" stroke="var(--accent)" />
        {be != null && be <= period && (
          <g style={{ opacity: drawn ? 1 : 0, transition: 'opacity .5s ease 2.2s' }}>
            <line x1={x(be)} y1={padT} x2={x(be)} y2={H - padB} stroke="var(--accent)" strokeWidth="1" strokeDasharray="3 4" opacity=".5" />
            <circle cx={x(be)} cy={y(valAt('EV', be))} r="5.5" fill="var(--bg)" stroke="var(--accent)" strokeWidth="2.5" />
          </g>
        )}
      </svg>
      {be != null && be <= period && (
        <div style={{
          position: 'absolute', left: (x(be) / W * 100) + '%', top: '8%', transform: 'translateX(-50%)',
          background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 12, fontWeight: 600,
          padding: '5px 11px', borderRadius: 999, whiteSpace: 'nowrap', opacity: drawn ? 1 : 0,
          transition: 'opacity .5s ease 2.4s', pointerEvents: 'none',
        }}>Break-even · Yr {be.toFixed(1)}</div>
      )}
    </div>
  );
}

/* ---------- breakdown ---------- */
function Breakdown({ title, kind, items, total }) {
  const max = Math.max(...items.map((i) => i.v)) || 1;
  return (
    <div className="bd">
      <h4>{title}<span className="tot">{R(total)} / yr</span></h4>
      {items.map((it) => (
        <div key={it.n}>
          <div className="bd-row">
            <span className="nm">{it.icon}{it.n}</span>
            <span className="amt">{R(it.v)}</span>
          </div>
          <div className="bd-bar"><i style={{ width: (it.v / max * 100) + '%', background: kind === 'ev' ? 'var(--accent)' : 'var(--fg-3)' }} /></div>
        </div>
      ))}
    </div>
  );
}

/* ---------- app ---------- */
function App() {
  const [ice, setIce] = useState({ name: '', price: 0, use: 0, fuel: 24.5, ins: 0, maint: 0, dep: 12 });
  const [ev, setEv] = useState({ name: '', price: 0, use: 0, fuel: 3.30, ins: 0, maint: 0, dep: 18 });
  const [alts, setAlts] = useState([]);          // live EV listings from the API
  const [altsLoading, setAltsLoading] = useState(false);
  const [picked, setPicked] = useState(null);    // which alternative is loaded into `ev`
  const [iceEst, setIceEst] = useState([]);      // fields the API estimated rather than read
  const [evEst, setEvEst] = useState([]);
  const [listing, setListing] = useState(null);  // raw meta of the pasted advert
  const [monthlyKm, setMonthlyKm] = useState(2000);
  const [period, setPeriod] = useState(5);
  const [rates, setRates] = useState(null);

  // Pull current SA fuel + electricity from the backend (falls back silently
  // to the hardcoded defaults if /api/rates isn't reachable).
  useEffect(() => {
    let alive = true;
    fetch(API_BASE + '/api/rates')
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !d || !d.fuel) return;
        setRates(d);
        if (d.fuel.petrol95_inland != null) setIce((v) => ({ ...v, fuel: d.fuel.petrol95_inland }));
        if (d.electricity && d.electricity.home != null) setEv((v) => ({ ...v, fuel: d.electricity.home }));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // A pasted advert replaces the combustion side wholesale and reloads the
  // electric alternatives. Insurance is the one figure we derive from price
  // rather than the ad, using the same heuristic the panel has always used.
  const onListing = (data) => {
    if (!data) { setAlts([]); setPicked(null); setListing(null); return; }
    const v = data.vehicle;
    const est = (v.estimated || []).concat('ins');
    if (v.powertrain === 'ev') {
      setEv((p) => ({ ...p, name: v.name, price: v.price || 0, use: v.use, ins: insFromPrice(v.price), maint: v.maint, dep: v.dep }));
      setEvEst(est);
    } else {
      setIce((p) => ({ ...p, name: v.name, price: v.price || 0, use: v.use, ins: insFromPrice(v.price), maint: v.maint, dep: v.dep }));
      setIceEst(est);
    }
    setListing(v);
    setAlts(data.alternatives || []);
    setPicked(null);
  };

  const pickAlt = (a) => {
    setEv((p) => ({ ...p, name: a.name, price: a.price || 0, use: a.use, ins: insFromPrice(a.price), maint: a.maint, dep: a.dep }));
    setEvEst((a.estimated || []).concat('ins'));
    setPicked(a);
  };

  const annualKm = monthlyKm * 12;
  const iceFuel = annualKm / 100 * ice.use * ice.fuel;
  const evFuel = annualKm / 100 * ev.use * ev.fuel;
  const iceRun = iceFuel + ice.ins + ice.maint;
  const evRun = evFuel + ev.ins + ev.maint;

  const iceResale = book(ice.price, ice.dep, period);
  const evResale = book(ev.price, ev.dep, period);

  // Net cost of ownership to date = cash spent − resale value you'd recover.
  const data = useMemo(() => {
    const a = [];
    for (let yr = 0; yr <= period; yr++) {
      a.push({
        ICE: ice.price - book(ice.price, ice.dep, yr) + yr * iceRun,
        EV: ev.price - book(ev.price, ev.dep, yr) + yr * evRun,
      });
    }
    return a;
  }, [ice.price, ice.dep, ev.price, ev.dep, iceRun, evRun, period]);

  const totalICE = data[period].ICE, totalEV = data[period].EV;
  const savings = totalICE - totalEV;
  const be = useMemo(() => {
    for (let i = 1; i < data.length; i++) {
      const d0 = data[i - 1].ICE - data[i - 1].EV;
      const d1 = data[i].ICE - data[i].EV;
      if (d1 > 0) return d1 === d0 ? i : (i - 1) + (0 - d0) / (d1 - d0);
    }
    return null;
  }, [data]);

  const evWins = savings > 0;
  const kmPct = ((monthlyKm - 200) / (4000 - 200)) * 100;
  const beMarker = be != null && be > 0.05 ? be : null;
  const beLabel = be == null ? 'No break-even in range'
    : be <= 0.05 ? 'EV cheaper from year 1'
    : `Break-even in year ${be.toFixed(1)}`;

  return (
    <div className="calc-page">
      <div className="calc-band" />
      <div className="wrap">
        <div className="calc-head">
          <div className="eyebrow">Total cost of ownership <span className="pp">Live model</span></div>
          <h1>The real cost,<br />side by side.</h1>
          <p>Set both cars and how you drive. The crossover chart shows the exact year electric pulls ahead — in rands, after resale.</p>
          <div className="rates-note">
            {rates ? <span>Fuel &amp; electricity prefilled from <b>{rates.source === 'stub' ? 'indicative SA rates' : 'live rates'} · {rates.asOf}</b>. </span> : null}
            Paste any <b>autotrader.co.za</b> car advert — it fills itself in, and live electric
            alternatives in the same price range appear on the right. Every field stays editable.
          </div>
        </div>

        <div className="calc-grid">
          <Panel kind="ice" d={ice} set={setIce} est={iceEst}
            chips={listing ? [
              listing.year, listing.condition, listing.location,
              listing.fuel, listing.body,
            ].filter(Boolean) : null}
            head={<PasteBar onFound={onListing} onBusy={setAltsLoading} />} />
          <Panel kind="ev" d={ev} set={setEv} est={evEst}
            chips={picked ? [picked.year, picked.condition, picked.transmission].filter(Boolean) : null}
            head={<Alternatives list={alts} loading={altsLoading} pickedUrl={picked && picked.url}
              onPick={pickAlt} base={ice} annualKm={annualKm} period={period} evRate={ev.fuel} />} />
        </div>

        <div className="usage">
          <div className="card-box">
            <h3><span>Monthly distance</span><b className="mono-num">{group(monthlyKm)}<span className="u"> km</span></b></h3>
            <input className="rng" type="range" min="200" max="4000" step="50" value={monthlyKm}
              style={{ '--p': kmPct + '%' }} onChange={(e) => setMonthlyKm(Number(e.target.value))} />
            <div className="rng-scale"><span>200</span><span>~{group(annualKm)} km / yr</span><span>4 000</span></div>
          </div>
          <div className="card-box">
            <h3><span>Analysis period</span></h3>
            <div className="seg">
              {[3, 5, 7, 10].map((p) => (
                <button key={p} className={period === p ? 'on' : ''} onClick={() => setPeriod(p)}>{p} yr</button>
              ))}
            </div>
          </div>
        </div>

        <div className="results">
          <div className="rcard">
            <div className="rk">{I.fuel} ICE · {period} yr net</div>
            <div className="rv mono-num" style={{ color: 'var(--fg)' }}>{R(totalICE)}</div>
            <div className="rs">{R(iceRun)} running / yr · resale {R(iceResale)}</div>
          </div>
          <div className="rcard">
            <div className="rk">{I.bolt} EV · {period} yr net</div>
            <div className="rv mono-num" style={{ color: 'var(--fg)' }}>{R(totalEV)}</div>
            <div className="rs">{R(evRun)} running / yr · resale {R(evResale)}</div>
          </div>
          <div className={'rcard ' + (evWins ? 'win' : '')}>
            <div className="rk">{evWins ? I.down : I.trend} {evWins ? 'Electric saves you' : 'Combustion stays cheaper'}</div>
            <div className="rv mono-num">{R(Math.abs(savings))}</div>
            <div className="rs">{beLabel}</div>
          </div>
        </div>

        <div className="chart-card">
          <div className="ch-head">
            <span className="t">Net cost of ownership · after resale</span>
            <span className="legend">
              <span><i style={{ background: 'var(--fg-3)' }} />{ice.name || 'ICE'}</span>
              <span><i style={{ background: 'var(--accent)' }} />{ev.name || 'EV'}</span>
            </span>
          </div>
          <Chart data={data} period={period} be={beMarker} />
        </div>

        <div className="breakdown">
          <Breakdown title="ICE · annual running" kind="ice" total={iceRun}
            items={[{ n: 'Petrol', v: iceFuel, icon: I.fuel }, { n: 'Insurance', v: ice.ins, icon: I.shield }, { n: 'Maintenance', v: ice.maint, icon: I.wrench }]} />
          <Breakdown title="EV · annual running" kind="ev" total={evRun}
            items={[{ n: 'Electricity', v: evFuel, icon: I.bolt }, { n: 'Insurance', v: ev.ins, icon: I.shield }, { n: 'Maintenance', v: ev.maint, icon: I.wrench }]} />
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
