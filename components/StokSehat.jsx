'use client';
// Stok tersedia & kesehatan stok (server: stock_avail, hold_list, hold_decide, stock_health).
// Tersedia = stok (di lokasi) − dipesan pelanggan grosir − ditahan (rusak/karantina). Kesehatan stok memakai aturan tertulis di stock_health.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Sheet, Field, Loading, Empty, Tile, run, toast } from '@/components/ui';
import { rp, angka, tgl, errMsg } from '@/lib/format';
import { qtyNum } from '@/lib/retail';

const n = (v) => Number(v || 0);

// Baris ringkas di daftar barang: hanya muncul bila ada yang dipesan / ditahan / dalam perjalanan
export function availLine(avail, p, branch) {
  if (!avail) return null;
  const r = branch ? (avail.levels || []).find((x) => x.product_id === p.id && x.branch_id === branch) : (avail.products || []).find((x) => x.product_id === p.id);
  if (!r) return null;
  const parts = [n(r.reserved) > 0 && `dipesan ${angka(r.reserved)}`, n(r.held) > 0 && `ditahan ${angka(r.held)}`,
    n(branch ? r.incoming : r.transit) > 0 && `${branch ? 'akan datang' : 'dalam perjalanan'} ${angka(branch ? r.incoming : r.transit)}`].filter(Boolean);
  if (!parts.length) return null;
  return <span className="small" style={{ color: n(r.available) <= 0 ? 'var(--bad)' : 'var(--att, var(--warn))' }}>Bisa dijual{branch ? ' di sini' : ''} <b>{angka(r.available)} {p.base_unit}</b> · {parts.join(' · ')}</span>;
}

export const KELAS = {
  cepat: ['Cepat laku', 'good', 'terjual 30 hari terakhir & stok cukup ≤ 30 hari'],
  normal: ['Normal', '', 'stok cukup 31–90 hari'],
  lambat: ['Lambat', 'warn', 'stok cukup > 90 hari, atau belum terjual sejak masuk 30–89 hari lalu'],
  mati: ['Tidak bergerak', 'bad', 'ada stok, tidak terjual 90 hari, stok sudah ≥ 90 hari'],
  baru: ['Baru masuk', '', 'masuk < 30 hari dan belum terjual'],
  habis: ['Habis', 'bad', 'stok 0 atau minus'],
};
const HOLD = { rusak: 'Rusak', karantina: 'Karantina', periksa: 'Perlu diperiksa', retur_rusak: 'Retur rusak' };

export default function StokSehat({ kosId, ver, kos, multi, onChanged }) {
  const [h, setH] = useState(null);
  const [holds, setHolds] = useState(null);
  const [err, setErr] = useState(null);
  const [k, setK] = useState('');
  const [pick, setPick] = useState(null);
  const load = async () => {
    const [a, b] = await Promise.all([supabase.rpc('stock_health', { p_kos: kosId }), supabase.rpc('hold_list', { p_kos: kosId, p_all: false })]);
    if (a.error) return setErr(errMsg(a.error));
    setErr(null); setH(a.data); setHolds(b.data || []);
  };
  useEffect(() => { load(); }, [kosId, ver]);
  if (err) return <div className="notice bad">{/stock_health/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!h || !holds) return <Loading />;
  const sum = h.ringkas || {};
  const locName = (id) => kos?.locs?.list?.find((b) => b.id === id)?.name;
  const rows = h.rows.filter((r) => (k === 'maks' ? r.over_max : !k || r.kelas === k));
  return (
    <div className="stack">
      {holds.length > 0 && <section className="panel">
        <h3>Barang ditahan ({holds.length})</h3>
        <span className="small muted">Masih tercatat di stok & nilai persediaan, tetapi tidak dihitung bisa dijual. Ketuk untuk memutuskan.</span>
        <div className="list">{holds.map((x) => (
          <button key={x.id} className="li click" onClick={() => setPick(x)} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit' }}>
            <div className="main"><b className="small">{x.name}</b>
              <span className="small muted">{HOLD[x.reason]} · {tgl(String(x.created_at).slice(0, 10))}{multi && locName(x.branch_id) ? ` · ${locName(x.branch_id)}` : ''}{x.ref && !(x.note || '').includes(x.ref) ? ` · ${x.ref}` : ''}{x.note ? ` · ${x.note}` : ''}</span></div>
            <span className="small" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><b>{angka(x.qty)} {x.base_unit}</b><br /><span className="muted">{rp(x.value)}</span></span>
          </button>
        ))}</div>
      </section>}
      <div className="grid">
        {['cepat', 'lambat', 'mati'].map((c) => <Tile key={c} label={KELAS[c][0]} value={angka(sum[c]?.n || 0)} sub={`nilai ${rp(sum[c]?.nilai || 0)}`} tone={c === 'mati' && sum[c]?.n ? 'bad' : ''} />)}
      </div>
      <div className="row" style={{ flexWrap: 'nowrap', overflowX: 'auto', gap: 6, paddingBottom: 2 }} role="group" aria-label="Kelompok">
        {[['', 'Semua'], ...Object.entries(KELAS).map(([c, v]) => [c, `${v[0]} (${sum[c]?.n || 0})`]), ...(n(h.over_max) ? [['maks', `Lewat maks (${h.over_max})`]] : [])].map(([c, l]) =>
          <button key={c} className={'sm' + (k === c ? ' primary' : '')} style={{ flex: 'none' }} onClick={() => setK(c)} aria-pressed={k === c}>{l}</button>)}
      </div>
      {rows.length === 0 ? <Empty title="Tidak ada barang di kelompok ini" /> : <section className="panel"><div className="list">{rows.map((r) => (
        <div className="li" key={r.product_id} style={{ alignItems: 'flex-start' }}>
          <div className="main"><b className="small">{r.name} <span className={'chip ' + KELAS[r.kelas][1]}>{KELAS[r.kelas][0]}</span>{r.over_max && <span className="chip bad" style={{ marginLeft: 4 }}>Lewat maks {angka(r.max_stock)}</span>}{r.consign && <span className="chip" style={{ marginLeft: 4 }}>Titipan</span>}</b>
            <span className="small muted">Stok {angka(r.stock)} {r.base_unit} · terjual 30 hr {angka(r.sold30)} · 90 hr {angka(r.sold90)}{r.cover != null ? ` · cukup ±${angka(r.cover)} hari` : ''}</span>
            <span className="small muted">Umur stok {angka(r.age)} hari · terakhir terjual {r.last_sale ? tgl(String(r.last_sale).slice(0, 10)) : 'belum pernah'}</span></div>
          <span className="small" style={{ whiteSpace: 'nowrap' }}>{rp(r.value)}</span>
        </div>
      ))}</div></section>}
      <span className="small muted">Aturan: {Object.values(KELAS).map((v) => `${v[0]} = ${v[2]}`).join('; ')}. "Stok cukup" = stok ÷ rata-rata terjual per hari selama 90 hari. Barang tidak bergerak bisa didiskon lewat <Link href="/promo">Promo</Link> atau diretur ke supplier.</span>
      {pick && <HoldSheet x={pick} kos={kos} onClose={() => setPick(null)} onDone={() => { setPick(null); load(); onChanged?.(); }} />}
    </div>
  );
}

function HoldSheet({ x, kos, onClose, onDone }) {
  const [act, setAct] = useState('lepas');
  const [qty, setQty] = useState(angka(x.qty));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const q = qtyNum(qty);
    if (!(q > 0) || q > n(x.qty)) return toast(`Jumlah 0 sampai ${angka(x.qty)}.`);
    setBusy(true);
    const call = () => supabase.rpc('hold_decide', { p_hold: x.id, p_action: act, p_qty: q, p_note: note });
    const msg = { lepas: 'Kembali ke stok jual', buang: 'Dibuang (rusak), stok berkurang', buang_exp: 'Dibuang (kedaluwarsa), stok berkurang', diretur: 'Ditandai sudah diretur' }[act];
    // buang perlu izin "Penyesuaian stok" bila aturan persetujuan aktif → pesan server meminta pemilik yang memutuskan
    const ok = await run(call, msg, (e) => errMsg(e).replace(/^PERLU_PERSETUJUAN:\s*/, ''));
    setBusy(false);
    if (ok) onDone();
  };
  return (
    <Sheet title={`${x.name} · ditahan`} onClose={onClose}>
      <span className="small muted">{HOLD[x.reason]} · {angka(x.qty)} {x.base_unit} · nilai {rp(x.value)}{x.note ? ` · ${x.note}` : ''}</span>
      <div className="seg">{[['lepas', 'Bisa dijual lagi'], ['buang', 'Buang (rusak)'], ['buang_exp', 'Buang (kedaluwarsa)'], ['diretur', 'Sudah diretur']].map(([k, l]) => <button key={k} className={act === k ? 'on' : ''} onClick={() => setAct(k)}>{l}</button>)}</div>
      <span className="small muted">{{ lepas: 'Barang dicek dan layak jual: dihitung tersedia lagi.', buang: 'Barang keluar dari stok; nilainya menjadi beban (rugi barang rusak).', buang_exp: 'Barang keluar dari stok sebagai kedaluwarsa; nilainya menjadi beban.', diretur: 'Pakai bila barang ini sudah diretur ke supplier lewat Belanja › Retur ke supplier (stok sudah berkurang di sana). Hanya menutup catatan ini.' }[act]}</span>
      <div className="row">
        <Field label={`Jumlah (${x.base_unit})`}><input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
      </div>
      <Field label="Catatan (opsional)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. sudah dicek, kemasan masih baik" /></Field>
      <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan keputusan'}</button>
    </Sheet>
  );
}
