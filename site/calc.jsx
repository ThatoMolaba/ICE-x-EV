// calc.jsx — interactive ICE vs EV total-cost-of-ownership calculator (Voltage)
const { useState, useMemo, useEffect, useRef } = React;

/* ---------- helpers ---------- */
const group = (n) => Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const R = (n) => 'R ' + group(n);
const Rk = (n) => 'R ' + (Math.round(n / 100) / 10).toFixed(1).replace(/\.0$/, '') + 'k';

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
function Field({ label, value, onChange, pre, suf, text, span }) {
  return (
    <div className="field" style={span ? { gridColumn: '1 / -1' } : null}>
      <label>{label}</label>
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
function Panel({ kind, d, set }) {
  const ev = kind === 'ev';
  const up = (k) => (v) => set({ ...d, [k]: v });
  return (
    <div className={'panel ' + kind}>
      <div className="panel-head">
        <div className="ico">{ev ? I.bolt : I.fuel}</div>
        <div>
          <h2>{ev ? 'Electric' : 'Combustion'}</h2>
          <div className="sub">{ev ? 'The new line' : 'The old line'}</div>
        </div>
        <div className="badge">{ev ? 'EV' : 'ICE'}</div>
      </div>
      <div className="urlbar">
        {I.link}
        <input placeholder={ev ? 'Paste an EV listing link…' : 'Paste a car listing link…'} />
        <button>Autofill</button>
      </div>
      <div className="fields">
        <Field span text label="Vehicle" value={d.name} onChange={up('name')} />
        <Field span pre="R" label="Purchase price" value={d.price} onChange={up('price')} />
        <div className="frow">
          <Field label={ev ? 'Energy use' : 'Fuel use'} suf={ev ? 'kWh/100' : 'L/100'} value={d.use} onChange={up('use')} />
          <Field pre="R" suf={ev ? '/kWh' : '/L'} label={ev ? 'Electricity' : 'Petrol price'} value={d.fuel} onChange={up('fuel')} />
        </div>
        <div className="frow">
          <Field pre="R" label="Insurance / yr" value={d.ins} onChange={up('ins')} />
          <Field pre="R" label="Maintenance / yr" value={d.maint} onChange={up('maint')} />
        </div>
      </div>
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
  const [ice, setIce] = useState({ name: 'Toyota Corolla 1.8 XS', price: 449900, use: 6.6, fuel: 24.5, ins: 12000, maint: 9000 });
  const [ev, setEv] = useState({ name: 'BYD Dolphin Comfort', price: 539900, use: 15.9, fuel: 3.30, ins: 14000, maint: 3500 });
  const [monthlyKm, setMonthlyKm] = useState(2000);
  const [period, setPeriod] = useState(5);

  const annualKm = monthlyKm * 12;
  const iceFuel = annualKm / 100 * ice.use * ice.fuel;
  const evFuel = annualKm / 100 * ev.use * ev.fuel;
  const iceRun = iceFuel + ice.ins + ice.maint;
  const evRun = evFuel + ev.ins + ev.maint;

  const data = useMemo(() => {
    const a = [];
    for (let yr = 0; yr <= period; yr++) a.push({ ICE: ice.price + yr * iceRun, EV: ev.price + yr * evRun });
    return a;
  }, [ice.price, ev.price, iceRun, evRun, period]);

  const totalICE = data[period].ICE, totalEV = data[period].EV;
  const savings = totalICE - totalEV;
  const be = useMemo(() => {
    for (let i = 1; i < data.length; i++) {
      const d0 = data[i - 1].ICE - data[i - 1].EV, d1 = data[i].ICE - data[i].EV;
      if (d0 < 0 && d1 >= 0) return (i - 1) + (0 - d0) / (d1 - d0);
      if (d0 >= 0 && i === 1) return 0;
    }
    return null;
  }, [data]);

  const evWins = savings > 0;
  const kmPct = ((monthlyKm - 200) / (4000 - 200)) * 100;

  return (
    <div className="calc-page">
      <div className="calc-band" />
      <div className="wrap">
        <div className="calc-head">
          <div className="eyebrow">Total cost of ownership <span className="pp">Live model</span></div>
          <h1>The real cost,<br />side by side.</h1>
          <p>Set both cars and how you drive. The crossover chart shows the exact year electric pulls ahead — in rands.</p>
        </div>

        <div className="calc-grid">
          <Panel kind="ice" d={ice} set={setIce} />
          <Panel kind="ev" d={ev} set={setEv} />
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
            <div className="rk">{I.fuel} ICE total · {period} yr</div>
            <div className="rv mono-num" style={{ color: 'var(--fg)' }}>{R(totalICE)}</div>
            <div className="rs">{R(iceRun)} running cost / year</div>
          </div>
          <div className="rcard">
            <div className="rk">{I.bolt} EV total · {period} yr</div>
            <div className="rv mono-num" style={{ color: 'var(--fg)' }}>{R(totalEV)}</div>
            <div className="rs">{R(evRun)} running cost / year</div>
          </div>
          <div className={'rcard ' + (evWins ? 'win' : '')}>
            <div className="rk">{evWins ? I.down : I.trend} {evWins ? 'Electric saves you' : 'Combustion stays cheaper'}</div>
            <div className="rv mono-num">{R(Math.abs(savings))}</div>
            <div className="rs">{be != null && be <= period ? `Break-even in year ${be.toFixed(1)}` : be != null ? `Break-even past ${period} yr` : 'No break-even in range'}</div>
          </div>
        </div>

        <div className="chart-card">
          <div className="ch-head">
            <span className="t">Cumulative cost of ownership</span>
            <span className="legend">
              <span><i style={{ background: 'var(--fg-3)' }} />{ice.name || 'ICE'}</span>
              <span><i style={{ background: 'var(--accent)' }} />{ev.name || 'EV'}</span>
            </span>
          </div>
          <Chart data={data} period={period} be={be} />
        </div>

        <div className="breakdown">
          <Breakdown title="ICE · annual" kind="ice" total={iceRun}
            items={[{ n: 'Petrol', v: iceFuel, icon: I.fuel }, { n: 'Insurance', v: ice.ins, icon: I.shield }, { n: 'Maintenance', v: ice.maint, icon: I.wrench }]} />
          <Breakdown title="EV · annual" kind="ev" total={evRun}
            items={[{ n: 'Electricity', v: evFuel, icon: I.bolt }, { n: 'Insurance', v: ev.ins, icon: I.shield }, { n: 'Maintenance', v: ev.maint, icon: I.wrench }]} />
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
