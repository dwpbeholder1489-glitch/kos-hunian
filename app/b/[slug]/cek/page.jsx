'use client';
// Pelanggan cek status pesanan: nomor pesanan + No. WhatsApp yang dipakai saat memesan. Tidak perlu akun.
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

const rp = (n) => 'Rp' + new Intl.NumberFormat('id-ID').format(Math.round(Number(n) || 0));
const tz = { timeZone: 'Asia/Jakarta' };
const waktu = (ts) => (ts ? new Date(ts).toLocaleString('id-ID', { ...tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const tgl = (d) => (d ? new Date(d + 'T00:00:00+07:00').toLocaleDateString('id-ID', { ...tz, weekday: 'short', day: 'numeric', month: 'short' }) : '');

// Langkah yang relevan untuk pesanan ini saja (tanpa jemput → tidak ada langkah jemput, dst.)
function steps(o) {
  const st = o.status; const rank = { permintaan: 0, diterima: 1, proses: 2, siap: 3, selesai: 4 }[st] ?? -1;
  const picked = !o.pickup || o.pickup_status === 'dijemput';
  const s = [['Permintaan masuk', true, waktu(o.received_at)], ['Dikonfirmasi', rank >= 1, waktu(o.confirmed_at)]];
  if (o.pickup) s.push([o.pickup_status === 'dijemput' ? 'Sudah dijemput' : `Menunggu penjemputan${o.pickup_date ? ` · ${tgl(o.pickup_date)}${o.pickup_slot ? ' ' + o.pickup_slot : ''}` : ''}`, rank >= 1 && picked, '']);
  s.push([rank === 2 && o.stage ? `${o.kuliner ? 'Sedang dimasak' : 'Sedang diproses'} · ${o.stage}` : o.kuliner ? 'Sedang dimasak' : 'Sedang diproses', rank >= 2, '']);
  if (o.deliver) {
    s.push(['Siap diantar', rank >= 3, '']);
    s.push([`Dalam pengantaran${o.delivery_date ? ` · ${tgl(o.delivery_date)}${o.delivery_slot ? ' ' + o.delivery_slot : ''}` : ''}`, o.delivery_status === 'dalam_pengantaran' || rank >= 4, '']);
  } else s.push([o.kuliner && o.dine === 'tempat' ? 'Siap disajikan' : 'Siap diambil', rank >= 3, '']);
  s.push(['Selesai', rank >= 4, waktu(o.completed_at)]);
  return s;
}

export default function Cek() {
  const { slug } = useParams();
  const [no, setNo] = useState('');
  const [hp, setHp] = useState('');
  const [o, setO] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { try { const n = new URLSearchParams(window.location.search).get('no'); if (n) setNo(n); } catch {} }, []);
  const go = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const r = await fetch('/api/publik/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, number: no, phone: hp }) });
      const d = await r.json().catch(() => ({}));
      if (!d.ok) { setO(null); setErr(d.error || 'Pesanan tidak ditemukan.'); } else setO(d);
    } catch { setErr('Koneksi terputus. Coba lagi.'); }
    setBusy(false);
  };
  return (
    <main className="wrap stack" style={{ maxWidth: 560, paddingTop: 20, paddingBottom: 40 }}>
      <a href={`/b/${slug}`} className="small">← Kembali ke halaman</a>
      <h1 style={{ margin: 0, fontSize: 24 }}>Cek status pesanan</h1>
      <form className="panel stack" onSubmit={go}>
        <label className="f">Nomor pesanan<input value={no} onChange={(e) => setNo(e.target.value.toUpperCase())} placeholder="mis. PSN-261107-001" autoCapitalize="characters" required /></label>
        <label className="f">No. WhatsApp yang dipakai saat memesan<input inputMode="tel" value={hp} onChange={(e) => setHp(e.target.value)} placeholder="08…" required autoComplete="tel" /></label>
        {err && <div className="notice bad">{err}</div>}
        <button className="cta" type="submit" disabled={busy}>{busy ? 'Memeriksa…' : 'Cek status'}</button>
      </form>
      {o && (
        <section className="panel stack">
          <div className="row between"><b>{o.number}</b><span className={'chip ' + (o.status === 'batal' ? 'bad' : o.status === 'selesai' ? 'good' : 'gold')}>{{ batal: 'Dibatalkan', permintaan: 'Menunggu konfirmasi', diterima: 'Dikonfirmasi', proses: 'Diproses', siap: o.deliver ? 'Siap diantar' : 'Siap diambil', selesai: 'Selesai' }[o.status]}</span></div>
          <span className="small">{(o.lines || []).map((l) => `${l.name} ${Number(l.qty).toLocaleString('id-ID')} ${l.unit}`).join(', ')}</span>
          {o.status === 'batal' ? <div className="notice bad">Pesanan dibatalkan{o.void_reason ? `: ${o.void_reason}` : ''}.</div> : (
            <ol className="list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>{steps(o).map(([t, on, w], i) => (
              <li key={i} className="li" style={{ opacity: on ? 1 : 0.5 }}><span className="small">{on ? '●' : '○'} {t}</span><span className="small muted">{on ? w : ''}</span></li>
            ))}</ol>
          )}
          {o.due_at && o.status !== 'selesai' && o.status !== 'batal' && <span className="small">Perkiraan selesai: <b>{waktu(o.due_at)}</b></span>}
          {o.status !== 'batal' && <span className="small">Total {rp(o.total)} · {o.lunas ? 'Lunas' : Number(o.paid) > 0 ? `dibayar ${rp(o.paid)}, sisa ${rp(Number(o.total) - Number(o.paid))}` : 'belum dibayar'}{o.status === 'permintaan' ? ' (perkiraan, dikonfirmasi saat barang diterima)' : ''}</span>}
        </section>
      )}
    </main>
  );
}
