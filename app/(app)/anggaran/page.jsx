'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import FiturUpgrade from '@/components/FiturUpgrade';
import { Loading, Tile, toast } from '@/components/ui';
import { rp, errMsg, bulan, thisMonth, addMonthsYm, parseRp } from '@/lib/format';
import { canArea } from '@/lib/business';

const KIND = { operasional: 'Operasional', modal: 'Modal/aset', non_operasional: 'Non-operasional' };

// Anggaran & realisasi (V2 §4.1, Paket Bisnis): rencana biaya per kategori per bulan dibanding pengeluaran yang tercatat.
// Realisasi dihitung server dari pengeluaran (budget_report); simpan/salin lewat budget_save/budget_copy (izin & paket dicek di server).
export default function Anggaran() {
  const { kos, kosId } = useKos();
  const [ym, setYm] = useState(thisMonth());
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);
  const owner = canArea(kos, 'team');
  const muat = () => supabase.rpc('budget_report', { p_kos: kosId, p_month: ym + '-01' }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setD(data)));
  useEffect(() => { setD(null); setErr(null); muat(); }, [kosId, ym]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <div className="notice bad">{/budget_report/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;

  const aktif = d.aktif;
  const simpan = async (row, nilai) => {
    const n = nilai === '' ? 0 : parseRp(nilai);
    if (n == null || Number.isNaN(n) || n < 0) return toast('Nominal tidak valid');
    if (Number(row.anggaran || 0) === n) return;
    setBusy(row.id);
    const { error } = await supabase.rpc('budget_save', { p_kos: kosId, p_month: ym + '-01', p_category: row.id, p_amount: n });
    setBusy(null);
    if (error) return toast(errMsg(error));
    toast(n ? 'Anggaran disimpan' : 'Anggaran dihapus'); muat();
  };
  const salin = async () => {
    const dari = addMonthsYm(ym, -1);
    if (!window.confirm(`Salin anggaran ${bulan(dari)} ke ${bulan(ym)}?\nKategori yang sudah punya anggaran di ${bulan(ym)} tidak diubah.`)) return;
    setBusy('salin');
    const { data, error } = await supabase.rpc('budget_copy', { p_kos: kosId, p_from: dari + '-01', p_to: ym + '-01' });
    setBusy(null);
    if (error) return toast(errMsg(error));
    toast(data ? `${data} kategori disalin` : 'Tidak ada yang perlu disalin'); muat();
  };

  const rows = d.baris || [];
  const dianggarkan = rows.filter((x) => x.anggaran != null);
  const totA = dianggarkan.reduce((t, x) => t + Number(x.anggaran), 0);
  const totR = dianggarkan.reduce((t, x) => t + Number(x.realisasi), 0);
  const luar = rows.filter((x) => x.anggaran == null).reduce((t, x) => t + Number(x.realisasi), 0) + Number(d.tanpa_kategori || 0);
  const pctTot = totA > 0 ? Math.round((totR * 100) / totA) : null;
  const warna = (p) => (p == null ? 'var(--line)' : p >= 100 ? 'var(--bad)' : p >= 80 ? 'var(--att)' : 'var(--gold)');

  return (
    <div className="stack">
      <div className="row"><h2>Anggaran</h2><PageHelp page="anggaran" /></div>
      <p className="small muted" style={{ margin: 0 }}>Tetapkan batas biaya per kategori setiap bulan, lalu bandingkan dengan pengeluaran yang benar-benar tercatat. Realisasi dihitung otomatis dari pengeluaran.</p>
      <div className="row between">
        <button className="sm ghost" onClick={() => setYm(addMonthsYm(ym, -1))} aria-label="Bulan sebelumnya">‹</button>
        <b>{bulan(ym)}</b>
        <button className="sm ghost" onClick={() => setYm(addMonthsYm(ym, 1))} aria-label="Bulan berikutnya">›</button>
      </div>

      {!aktif && <FiturUpgrade kosId={kosId} owner={owner} event="BUDGET.CREATE_REQUESTED" title="Anggaran & realisasi tersedia mulai Paket Bisnis" text="Di paket ini Anda tetap bisa melihat pengeluaran per kategori di bawah. Di Paket Bisnis Anda bisa menetapkan anggaran dan melihat sisanya." />}

      <div className="grid">
        {aktif && <Tile label="Anggaran" value={rp(totA)} sub={`${dianggarkan.length} kategori`} />}
        {aktif && <Tile label="Terpakai" value={rp(totR)} sub={pctTot == null ? 'belum ada anggaran' : `${pctTot}% dari anggaran`} />}
        {aktif && <Tile label="Sisa" value={rp(totA - totR)} sub={totA - totR < 0 ? 'melebihi anggaran' : 'belum terpakai'} />}
        <Tile label={aktif ? 'Di luar anggaran' : 'Total pengeluaran'} value={rp(aktif ? luar : luar + totR)} sub={aktif ? 'kategori tanpa anggaran & tanpa kategori' : 'bulan ini'} />
      </div>

      {aktif && d.ada_bulan_lalu && <button className="ghost" disabled={busy === 'salin'} onClick={salin}>{busy === 'salin' ? 'Menyalin…' : `Salin anggaran ${bulan(addMonthsYm(ym, -1))}`}</button>}

      <section className="panel">
        {rows.length === 0 ? <span className="small muted">Belum ada kategori biaya. Kategori dibuat saat mencatat pengeluaran.</span> : (
          <div className="list">{rows.map((x) => {
            const a = x.anggaran == null ? null : Number(x.anggaran);
            const r = Number(x.realisasi);
            const p = a ? Math.round((r * 100) / a) : null;
            return (
              <div key={x.id} className="li" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                <div className="row between" style={{ flexWrap: 'nowrap' }}>
                  <div className="main"><b className="small">{x.nama}</b><span className="small muted">{KIND[x.kind] || x.kind}</span></div>
                  <span className="small" style={{ textAlign: 'right' }}>{rp(r)}{a != null && <span className="muted"> / {rp(a)}</span>}</span>
                </div>
                {aktif && a != null && (
                  <div aria-label={`Terpakai ${p}%`} style={{ height: 8, borderRadius: 4, background: 'var(--line)', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(p, 100)}%`, height: '100%', background: warna(p) }} />
                  </div>
                )}
                {aktif && a != null && <span className="small" style={{ color: p >= 100 ? 'var(--bad)' : undefined }}>{p >= 100 ? `Melebihi ${rp(r - a)}` : `Sisa ${rp(a - r)}`} · {p}%</span>}
                {aktif && (
                  <div className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
                    <input inputMode="numeric" aria-label={`Anggaran ${x.nama}`} placeholder="Anggaran bulan ini" disabled={busy === x.id}
                      defaultValue={a != null ? String(a) : ''} key={`${ym}-${x.id}-${a}`}
                      onBlur={(e) => simpan(x, e.target.value.trim())} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} style={{ flex: 1 }} />
                    {a == null && Number(x.bulan_lalu) > 0 && <button className="sm ghost" disabled={busy === x.id} onClick={() => simpan(x, String(x.bulan_lalu))}>Pakai {rp(x.bulan_lalu)}</button>}
                  </div>
                )}
              </div>
            );
          })}</div>
        )}
        {Number(d.tanpa_kategori) > 0 && <span className="small muted">Pengeluaran tanpa kategori bulan ini: {rp(d.tanpa_kategori)} (tidak bisa dianggarkan; beri kategori di menu pengeluaran).</span>}
      </section>
      <span className="small muted">Pengeluaran dicatat di menu <Link href={kos?.business_type === 'properti' ? '/pengeluaran' : '/kas'}>{kos?.business_type === 'properti' ? 'Pengeluaran' : 'Kas'}</Link>. Kosongkan isian untuk menghapus anggaran kategori itu. Setiap perubahan tercatat di Konfigurasi › Riwayat.</span>
    </div>
  );
}
