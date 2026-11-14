import { LogoMark } from '@/components/Logo';

// Dashboard ilustrasi (bukan tangkapan layar asli) — selalu diberi label DATA CONTOH oleh pemanggil / pojok kanan.
const NAV = ['Ringkasan', 'Transaksi', 'Operasional', 'Keuangan', 'Pelanggan', 'Analisis'];

export function linePath(pts, w = 260, h = 70, pad = 6) {
  const max = Math.max(...pts), min = Math.min(...pts), sx = w / (pts.length - 1);
  return pts.map((v, i) => `${i ? 'L' : 'M'}${(i * sx).toFixed(1)} ${(h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2 - 2)).toFixed(1)}`).join(' ');
}

export default function Dash({ d }) {
  const max = d.bars ? Math.max(...d.bars) : 1;
  return (
    <div className="cx-dash" role="img" aria-label={`Ilustrasi layar ${d.title} dengan data contoh`}>
      <div className="cx-dash-side" aria-hidden="true">
        <b><LogoMark size={16} />PRASARA</b>
        {(d.nav || NAV).map((n, i) => <span key={n} className={i === (d.on || 0) ? 'on' : ''}>{n}</span>)}
      </div>
      <div className="cx-dash-main" aria-hidden="true">
        <div className="cx-dash-top"><div><b>{d.title}</b><small>{d.sub}</small></div><i>DATA CONTOH</i></div>
        <div className="cx-kpis">
          {d.kpis.map(([l, v, dl, dn]) => <div key={l} className="cx-kpi"><span>{l}</span><b>{v}</b>{dl && <em className={dn ? 'dn' : ''}>{dl}</em>}</div>)}
        </div>
        <div className="cx-dash-row">
          <div className="cx-box"><b>{d.chartTitle}</b>
            {d.line && <svg className="cx-chart" viewBox="0 0 260 70" preserveAspectRatio="none"><path className="ar" d={linePath(d.line) + ' L260 70 L0 70 Z'} /><path className="ln" pathLength="1" d={linePath(d.line)} /></svg>}
            {d.bars && <div className="cx-bars">{d.bars.map((v, i) => <i key={i} style={{ height: `${Math.max(8, (v / max) * 100)}%`, '--i': i }} />)}</div>}
          </div>
          <div className="cx-box"><b>{d.listTitle}</b><ul>{d.list.map((t) => <li key={t}>{t}</li>)}</ul></div>
        </div>
      </div>
    </div>
  );
}
