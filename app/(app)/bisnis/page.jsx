'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { PageHeader } from '@/components/Page';
import { Loading, Tile } from '@/components/ui';
import { rp, bulan, today, errMsg, tgl } from '@/lib/format';
import { typeOf, homeOf, ROLES, isDraft, SETUP_STATUS } from '@/lib/business';
import { LEGAL_KIND } from '@/lib/modules';

const BASIS = { kas: 'dicatat saat uang diterima (basis kas)', penjualan: 'dicatat saat penjualan terjadi, termasuk kasbon', 'pesanan selesai': 'dicatat saat pesanan diserahkan ke pelanggan, termasuk yang belum lunas', 'status catatan': 'dicatat saat catatan mencapai status uang masuk yang diatur di Business Builder' };
const ACT = { aktifkan_modul: 'mengaktifkan modul', nonaktifkan_modul: 'menonaktifkan modul', minta_persetujuan: 'meminta persetujuan', tolak_persetujuan: 'menolak permintaan',
  konfigurasi_awal: 'konfigurasi awal', terbitkan_halaman: 'menerbitkan halaman bisnis', sembunyikan_halaman: 'menyembunyikan halaman bisnis', ubah_halaman: 'mengubah halaman bisnis', rekomendasi_diterima: 'menerapkan saran', rekomendasi_diabaikan: 'mengabaikan saran', ekspor_data: 'mengunduh semua data', tutup_bisnis: 'menutup bisnis', buka_bisnis: 'membuka kembali bisnis', lokasi_karyawan: 'menetapkan lokasi kerja karyawan', jurnal_manual: 'membuat jurnal manual', tutup_periode: 'menutup periode buku', buka_periode: 'membuka kembali periode buku', arsip_kontak: 'mengarsipkan kontak', hapus_kontak: 'menghapus kontak', pulihkan_kontak: 'memulihkan kontak', ubah_profil: 'mengubah profil', tambah_cabang: 'menambah cabang/gudang', ubah_cabang: 'mengubah cabang/gudang', ubah_layanan: 'mengubah layanan/harga jasa', ubah_tahap_jasa: 'mengubah tahap proses', ubah_tarif_meteran: 'mengubah tarif meteran' };
const jam = (ts) => new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
const shift = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const sum = (xs, k) => xs.reduce((s, b) => s + (Number(b[k]) || 0), 0);

// Owner Overview: ringkasan lintas bisnis dengan label kelengkapan & basis, per badan usaha, dan tautan ke sumber angka
export default function Bisnis() {
  const { kosId, pickKos, ver, list } = useKos();
  const router = useRouter();
  const [ym, setYm] = useState(today().slice(0, 7));
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    setD(null);
    supabase.rpc('owner_overview2', { p_month: ym + '-01' }).then(({ data, error }) => (error ? setErr(errMsg(error)) : setD(data)));
  }, [ver, ym]);
  // Gabungan bisnis (Fase 5): pilihan akun disimpan di server; angka tetap dari owner_overview2 (sumber yang sama)
  const [inc, setInc] = useState(null);
  const [prev, setPrev] = useState(null);
  const [pick, setPick] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  useEffect(() => {
    supabase.rpc('portfolio_get').then(({ data, error }) => setInc(error ? [] : data?.include || []));
  }, [ver]);
  useEffect(() => {
    setPrev(null);
    supabase.rpc('owner_overview2', { p_month: shift(ym, -1) + '-01' }).then(({ data, error }) => setPrev(error ? false : data));
  }, [ver, ym]);
  if (err) return <div className="notice bad">{/owner_overview2/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;

  const go = (b, href) => { pickKos(b.id); router.push(href || homeOf(list?.find((x) => x.id === b.id) || b)); };
  const fin = d.businesses.filter((b) => b.access);
  const att = fin.flatMap((b) => b.attention.map((a) => ({ ...a, b })));
  const money = fin.filter((b) => b.revenue != null); // bisnis kustom tanpa pengaturan uang masuk tidak ikut dijumlahkan
  const entitiesOf = (items) => Object.values(items.reduce((g, b) => {
    const key = b.legal_entity?.id || 'none';
    (g[key] ||= { le: b.legal_entity, items: [] }).items.push(b);
    return g;
  }, {}));
  const isNow = ym === today().slice(0, 7);
  const sel = money.filter((b) => new Set(inc || []).has(b.id)); // bisnis yang dipilih untuk digabung
  const pct = (a, base) => (Number(base) ? ((Number(a) - Number(base)) / Math.abs(Number(base))) * 100 : null);
  const dTxt = (p) => (p == null ? '' : `${p >= 0 ? '+' : '−'}${Math.abs(p).toFixed(1).replace('.', ',')}% dari ${bulan(shift(ym, -1))}`);
  const selPrev = prev && prev.businesses ? sel.map((b) => prev.businesses.find((x) => x.id === b.id)) : [];
  const havePrev = sel.length > 0 && selPrev.length === sel.length && selPrev.every((b) => b && b.revenue != null);
  const pv = (k) => (havePrev ? dTxt(pct(sum(sel, k), sum(selPrev, k))) : '');
  const gabMixed = new Set(sel.map((b) => b.basis)).size > 1;
  const gabIncomplete = sel.some((b) => !b.complete);
  const saveInc = async (ids) => {
    setBusy(true); setNote(null);
    const { data, error } = await supabase.rpc('portfolio_set', { p_include: ids });
    setBusy(false);
    if (error) return setNote(errMsg(error));
    setInc(data?.include || []); setPick(null);
  };

  return (
    <div className="stack">
      <PageHeader title="Ringkasan pemilik" help={<PageHelp page="bisnis" />} actions={<><Link href="/mulai"><button className="primary">+ Tambah bisnis</button></Link></>} />
      <div className="row between">
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <button className="sm" onClick={() => setYm(shift(ym, -1))} aria-label="Bulan sebelumnya">‹</button>
          <b style={{ minWidth: 120, textAlign: 'center' }}>{bulan(ym)}</b>
          <button className="sm" onClick={() => setYm(shift(ym, 1))} disabled={isNow} aria-label="Bulan berikutnya">›</button>
        </div>
        <span className="small muted">Diperbarui {jam(d.generated_at)} · {tgl(d.from)}–{tgl(d.to)}</span>
      </div>

      {att.length > 0 && isNow && (
        <section className="panel">
          <h3>Perlu perhatian</h3>
          <div className="list">{att.map((a, i) => (
            <button key={i} className="li click" onClick={() => go(a.b, a.href)} style={{ background: 'none', border: 0, borderTop: i ? '1px solid var(--line)' : 0, borderRadius: 0, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit' }}>
              <span className="row" style={{ flexWrap: 'nowrap', gap: 10 }}><span style={{ width: 8, height: 8, borderRadius: 4, flex: 'none', background: a.tone === 'bad' ? 'var(--bad)' : 'var(--gold)' }} />{a.text}</span>
              <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{a.b.name} ›</span>
            </button>
          ))}</div>
        </section>
      )}

      {d.businesses.map((b) => {
        const t = typeOf(b);
        if (!b.access) return (
          <section className="panel" key={b.id}>
            <div className="row between"><b>{t.icon} {b.name}</b><span className="chip">{ROLES[b.role]?.name || b.role}</span></div>
            <span className="small muted">Anda tidak punya akses ke angka keuangan bisnis ini.</span>
            <button className="sm" onClick={() => go(b)}>Buka bisnis</button>
          </section>
        );
        if (b.business_type === 'kustom' && b.revenue == null) return (
          <section className="panel" key={b.id} style={b.id === kosId ? { borderColor: 'var(--gold)' } : undefined}>
            <div className="stack" style={{ gap: 0 }}><b>{t.icon} {b.name}</b><span className="small muted">{t.name} · {b.plan_name || b.plan}</span></div>
            {b.attention?.length > 0 && <div className="list">{b.attention.map((a) => <button key={a.text} className="li click" onClick={() => go(b, a.href)} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit' }}><span className="small">{a.text}</span><b className="small">›</b></button>)}</div>}
            <span className="small muted">Uang masuk belum diatur (Business Builder › Data & formulir › Uang masuk), jadi bisnis ini belum ikut dijumlahkan.{b.last_activity ? ` Catatan terakhir ${tgl(String(b.last_activity).slice(0, 10))}.` : ''}</span>
            <button className="sm" onClick={() => go(b, '/kerja')}>Buka {b.name}</button>
          </section>
        );
        const lk = list?.find((x) => x.id === b.id);
        if (isDraft(lk)) return (
          <section className="panel" key={b.id}>
            <div className="row between"><b>{t.icon} {b.name}</b><span className={'chip ' + (SETUP_STATUS[lk.setup_status]?.[1] || 'void')}>{SETUP_STATUS[lk.setup_status]?.[0] || 'Draf'}</span></div>
            <span className="small muted">Masih dalam setup — belum ada transaksi. Tinjau & aktifkan di Pusat Konfirmasi.</span>
            <button className="sm" onClick={() => go(b, '/konfirmasi')}>Buka Pusat Konfirmasi</button>
          </section>
        );
        const retail = b.business_type === 'retail';
        const jasa = b.business_type === 'jasa';
        const dagang = retail || jasa || b.business_type === 'kustom'; // punya kas/bank
        const kustom = b.business_type === 'kustom';
        const lap = retail ? '/laporan-toko' : jasa ? '/laporan-jasa' : kustom ? '/laporan-kustom' : '/laporan';
        const Row = ({ l, v, href, tone, hint }) => (
          <button className="li click" onClick={() => go(b, href)} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit' }}>
            <span className="small">{l}{hint && <span className="muted"> · {hint}</span>}</span>
            <b className="small" style={tone ? { color: `var(--${tone})` } : undefined}>{v} ›</b>
          </button>
        );
        return (
          <section className="panel" key={b.id} style={b.id === kosId ? { borderColor: 'var(--gold)' } : undefined}>
            <div className="row between">
              <div className="stack" style={{ gap: 0 }}><b>{t.icon} {b.name}</b><span className="small muted">{t.name}{b.legal_entity ? ` · ${b.legal_entity.name}` : ''} · {b.plan_name || b.plan}</span></div>
              <span className={'chip ' + (b.complete ? 'good' : 'gold')}>{b.complete ? 'Lengkap' : 'Perkiraan'}</span>
            </div>
            <div className="list">
              <Row l="Pendapatan" v={rp(b.revenue)} href={lap} hint={retail ? 'penjualan bersih' : jasa ? 'pesanan diserahkan' : kustom ? 'uang masuk catatan' : 'uang diterima'} />
              {retail && <Row l="Modal barang terjual" v={rp(b.cogs)} href="/laporan-toko" />}
              {jasa && <Row l="Pemakaian bahan" v={rp(b.cogs)} href="/laporan-jasa" />}
              <Row l="Biaya operasional" v={rp(b.ops)} href={dagang ? '/kas' : '/pengeluaran'} />
              <Row l="Laba operasional" v={rp(b.profit)} href={lap} tone={Number(b.profit) < 0 ? 'bad' : undefined} />
              {!kustom && <Row l={retail ? 'Kasbon pelanggan' : jasa ? 'Belum lunas pelanggan' : 'Tunggakan sewa'} v={rp(b.receivables)} href={retail ? '/kas' : jasa ? '/pesanan' : '/tagihan'} tone={Number(b.receivables) > 0 ? 'bad' : undefined} hint="saat ini" />}
              {dagang && !kustom && <Row l="Utang ke supplier" v={rp(b.payables)} href="/kas" hint="saat ini" />}
              {dagang && <Row l="Kas / bank" v={`${rp(b.cash)} / ${rp(b.bank)}`} href="/kas" hint="saat ini" />}
              {!dagang && <Row l="Kamar terisi" v={`${b.occupied}/${b.rooms}`} href="/kamar" />}
            </div>
            {b.flags.length > 0 && <div className="notice">{b.flags.map((f) => <div key={f} className="small">• {f}</div>)}</div>}
            <span className="small muted">Pendapatan {BASIS[b.basis]}.{b.last_activity ? ` Transaksi terakhir ${tgl(String(b.last_activity).slice(0, 10))}.` : ' Belum ada transaksi.'}</span>
            <button className="sm" onClick={() => go(b)}>Buka {b.name}</button>
          </section>
        );
      })}

      {money.length > 1 && (
        <>
          <h3 style={{ marginTop: 8 }}>Gabungan bisnis</h3>
          <section className="panel">
            {note && <div className="notice bad">{note}</div>}
            {inc === null ? <Loading /> : pick ? (
              <>
                <span className="small">Centang bisnis yang ingin dijumlahkan. Angka tiap bisnis di atas tetap terpisah. Pilih minimal dua, atau kosongkan untuk tidak menggabungkan.</span>
                <div className="list">{money.map((b) => (
                  <label key={b.id} className="li" style={{ cursor: 'pointer', borderTop: '1px solid var(--line)' }}>
                    <span className="row" style={{ flexWrap: 'nowrap', gap: 10 }}>
                      <input type="checkbox" checked={pick.includes(b.id)} onChange={(e) => setPick(e.target.checked ? [...pick, b.id] : pick.filter((x) => x !== b.id))} />
                      <span className="small">{typeOf(b).icon} {b.name}</span>
                    </span>
                    <span className="small muted">{b.legal_entity?.name || 'Badan usaha belum diatur'}</span>
                  </label>
                ))}</div>
                {pick.length === 1 && <span className="small muted">Pilih satu bisnis lagi untuk menggabungkan.</span>}
                <div className="row">
                  <button className="primary" disabled={busy || pick.length === 1 || (pick.length === 0 && !(inc || []).length)} onClick={() => saveInc(pick)}>{busy ? 'Menyimpan…' : pick.length ? 'Simpan gabungan' : 'Hapus gabungan'}</button>
                  <button className="sm" disabled={busy} onClick={() => setPick(null)}>Batal</button>
                </div>
              </>
            ) : sel.length >= 2 ? (
              <>
                <div className="row between">
                  <div className="stack" style={{ gap: 0 }}><b>{sel.length} bisnis digabung</b><span className="small muted">{sel.map((b) => b.name).join(' · ')}</span></div>
                  <span className={'chip ' + (gabMixed || gabIncomplete ? 'gold' : 'good')}>{gabMixed || gabIncomplete ? 'Indikasi' : 'Lengkap'}</span>
                </div>
                <div className="grid">
                  <Tile label="Pendapatan" value={rp(sum(sel, 'revenue'))} sub={pv('revenue') || `${sel.length} bisnis`} />
                  <Tile label="Laba operasional" value={rp(sum(sel, 'profit'))} sub={pv('profit') || 'pendapatan − modal barang − biaya'} tone={sum(sel, 'profit') < 0 ? 'bad' : ''} />
                  <Tile label="Belum diterima" value={rp(sum(sel, 'receivables'))} sub="tunggakan sewa + kasbon" />
                </div>
                {entitiesOf(sel).length > 1 && (
                  <div className="list">{entitiesOf(sel).map((g) => (
                    <div className="li" key={g.le?.id || 'none'}>
                      <span className="small">{g.le ? `${g.le.name} (${LEGAL_KIND[g.le.kind] || g.le.kind})` : 'Badan usaha belum diatur'}</span>
                      <b className="small">{rp(sum(g.items, 'revenue'))}</b>
                    </div>
                  ))}</div>
                )}
                <span className="small muted">Bukan laporan konsolidasi resmi: transaksi antarbisnis tidak dieliminasi.{gabMixed ? ' Basis pencatatannya berbeda (kos dicatat saat uang diterima, toko saat penjualan), jadi jumlahnya hanya indikasi.' : ''}{gabIncomplete ? ' Sebagian angka belum final (lihat tanda di tiap bisnis).' : ''}{sel.some((b) => !b.legal_entity) ? ' Atur badan usaha tiap bisnis di Operasional › Konfigurasi › Profil agar gabungan bisa dipisah per badan usaha.' : ''}</span>
                <div className="row"><button className="sm" onClick={() => setPick(inc)}>Ubah pilihan</button></div>
              </>
            ) : (
              <>
                <span className="small muted">{sel.length === 1 ? 'Baru satu bisnis yang dipilih. Pilih minimal dua untuk menggabungkan.' : 'Belum ada gabungan. Angka tiap bisnis di atas sudah lengkap dan terpisah. Gabungan hanya dibuat bila Anda memilihnya.'}</span>
                <div className="row"><button className="sm" onClick={() => setPick(inc)}>{sel.length ? 'Ubah pilihan' : 'Pilih bisnis yang digabung'}</button></div>
              </>
            )}
          </section>
        </>
      )}

      {d.activity?.length > 0 && (
        <section className="panel">
          <h3>Aktivitas konfigurasi terbaru</h3>
          <div className="list">{d.activity.map((a, i) => (
            <div className="li" key={i}><span className="small">{a.business}: {a.actor} {ACT[a.action] || a.action}</span><span className="small muted" style={{ whiteSpace: 'nowrap' }}>{tgl(String(a.created_at).slice(0, 10))}</span></div>
          ))}</div>
        </section>
      )}
      <details className="small"><summary>Cara angka dihitung</summary>
        <ul style={{ paddingLeft: 20 }}>
          <li>Kos: pendapatan = pembayaran terverifikasi + pendapatan lain pada bulan itu (basis kas). Tunggakan = tagihan lewat jatuh tempo yang belum lunas, saat ini.</li>
          <li>Toko: pendapatan = penjualan − retur + pendapatan lain pada bulan itu. Laba = pendapatan − modal barang terjual − biaya operasional.</li>
          <li>Belanja modal dan uang yang diambil pemilik tidak termasuk biaya operasional.</li>
          <li>"Perkiraan" berarti ada data yang belum final (mis. pembayaran belum diverifikasi atau barang tanpa harga modal).</li>
        </ul>
      </details>
    </div>
  );
}
