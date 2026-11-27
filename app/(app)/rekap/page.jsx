'use client';
// Rekap Bisnis (Business Recap Center) — tata letak mengikuti gambar acuan pemilik 27 Nov 2026.
// Fokus: APA yang terjadi, BERAPA hasilnya, dan perubahannya dibanding periode sebelumnya (Analisis Bisnis = penyebab, risiko, proyeksi).
// Data: biz_recap (jurnal + transaksi; sumber sama dengan Pembukuan, Laporan, Analisis Bisnis), recap_docs (transaksi sumber),
// activity_feed (timeline), recap_list/recap_get/recap_save (arsip berversi). Rumus kelompok di lib/recap.js.
// Desktop: KPI horizontal, grafik multikolom + panel Rekap & Analisis, tabel ringkasan. HP: KPI 2 kolom, tab periode, kategori rekap
// berbentuk grid → lembar bawah, filter di lembar bawah. Semua angka & grafik bisa ditekan → rincian → modul & transaksi sumber.
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import NavIcon from '@/components/NavIcon';
import PageHelp from '@/components/PageHelp';
import { PageHeader, useMedia } from '@/components/Page';
import { Loading, Sheet, toast } from '@/components/ui';
import { angka, errMsg, rp, tgl, today } from '@/lib/format';
import { canArea, isKuliner } from '@/lib/business';
import { srcHref } from '@/lib/journalSource';
import { useKuotaEkspor } from '@/lib/ekspor';
import { COMPARE, KINDS, STOCK_GROUPS, compareOf, derive, exportSheets, isDate, orderedSections, pct, periodOf, rangeLabel, recapChanges, sectionsFor, seriesOf, share, shiftPeriod, shortLabel, statusOf } from '@/lib/recap';
import { C, Heatmap, TrendChart, Waterfall } from '../analisis/Charts';
import { DetailSheet, JournalLines } from '../analisis/Details';
import styles from './rekap.module.css';

const n = (v) => Number(v || 0);
const pctTxt = (v, d = 1) => (v == null ? '—' : `${v.toLocaleString('id-ID', { maximumFractionDigits: d })}%`);
const signPct = (v) => (v == null ? null : `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`);
const signedValue = (v, format) => v === 0 ? format(0) : `${v > 0 ? '+' : '−'}${format(Math.abs(v))}`;
const deltaText = (value, before, format = rp) => signPct(pct(value, before)) ?? signedValue(value - before, format);
const wib = (date) => new Date(date).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
const qty = (v) => n(v).toLocaleString('id-ID', { maximumFractionDigits: 2 });
const paren = (v) => (n(v) < 0 ? `(${rp(-n(v)).replace('Rp ', 'Rp')})` : rp(v).replace('Rp ', 'Rp'));
const HARI7 = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const STOCK_KIND = { awal: 'Stok awal (input)', beli: 'Pembelian', retur_jual: 'Retur dari pelanggan', titip: 'Titipan diterima', batal: 'Penjualan dibatalkan', jual: 'Penjualan', pakai: 'Pemakaian', retur_beli: 'Retur ke supplier', titip_kembali: 'Titipan dikembalikan', opname: 'Stok opname', rusak: 'Rusak', kedaluwarsa: 'Kedaluwarsa', koreksi: 'Koreksi' };
const SEG = { baru: 'Baru', setia: 'Setia', kadang: 'Kadang', tidak_aktif: 'Tidak aktif' };
const ATT = { hadir: 'Hadir', izin: 'Izin', sakit: 'Sakit', cuti: 'Cuti', alpa: 'Alpa', libur: 'Libur' };
const AREA_NAME = { sell: 'Penjualan', stock: 'Stok', finance: 'Keuangan', rent: 'Sewa', ops: 'Operasional', team: 'Tim', settings: 'Pengaturan', '-': 'Lainnya' };
const Ico = ({ d, size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const I = {
  cart: <><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2 3h3l2.6 12.4a1 1 0 0 0 1 .8h9.6a1 1 0 0 0 1-.8L21 7H6" /></>,
  bag: <><path d="M5 8h14l-1 13H6z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  box: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>, gear: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" /></>,
  bars: <><path d="M5 20v-6M10 20V10M15 20V6M20 20V3" /></>, scale: <><path d="M12 3v18M5 21h14M6 7h12" /><path d="m6 7-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z" /></>,
  wallet: <><rect x="3" y="6" width="18" height="14" rx="2" /><path d="M3 10h18M16 15h2" /></>, users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5" /><path d="M16 4.8a3 3 0 0 1 0 6M18 14.8c1.6.7 2.7 2.4 3 5.2" /></>,
  team: <><circle cx="12" cy="7" r="3" /><path d="M5 21v-1a7 7 0 0 1 14 0v1" /></>, home: <><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /></>,
  list: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>, tax: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6" /></>,
  coins: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
  building: <><path d="M4 21V5l8-2v18M12 9l8 2v10" /><path d="M8 8h1M8 12h1M8 16h1M16 14h1M16 17h1" /></>, clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  down: <><path d="M12 4v11M7 10l5 5 5-5" /><path d="M5 20h14" /></>, filter: <><path d="M3 5h18l-7 8v6l-4 2v-8z" /></>, archive: <><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v11h14V9M10 13h4" /></>,
  cal: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>, proj: <><path d="M3 7h18v13H3z" /><path d="M8 7V4h8v3" /></>,
};
const SEC_ICON = { penjualan: I.cart, pesanan: I.list, sewa: I.home, pembelian: I.bag, persediaan: I.box, laba: I.bars, pengeluaran: I.gear, kas: I.wallet, utang: I.scale, pelanggan: I.users, karyawan: I.team, aset: I.building, pajak: I.tax, modal: I.coins, proyek: I.proj, aktivitas: I.clock };

export default function Rekap() {
  const { kos, kosId, ver } = useKos();
  return kosId ? <Center key={kosId} kos={kos} kosId={kosId} ver={ver} /> : <Loading />;
}

// Filter di URL (bertahan saat ke modul lain lalu kembali) + cadangan per perangkat
function readFilter(search, kosId, td) {
  const get = (k) => search.get(k) || '';
  let f = { k: get('k'), t: get('t'), dari: get('dari'), sampai: get('sampai'), cmp: get('cmp'), cabang: get('cabang') };
  if (!f.k) { try { const saved = JSON.parse(localStorage.getItem('prasara-rekap-' + kosId) || '{}'); f = { ...f, k: saved.k || '', cmp: saved.cmp || '' }; } catch { /* abaikan */ } }
  if (!KINDS.some(([k]) => k === f.k)) f.k = 'bulanan';
  if (!isDate(f.t) || f.t > td) f.t = td;
  if (!COMPARE.some(([k]) => k === f.cmp)) f.cmp = 'prev';
  return f;
}

function Center({ kos, kosId, ver }) {
  const router = useRouter();
  const search = useSearchParams();
  const mobile = useMedia('(max-width: 767px)');
  const td = today();
  const [f, setF] = useState(() => readFilter(search, kosId, td));
  const per = periodOf(f.k, f.t, td, { from: f.dari, to: f.sampai });
  const cmp = compareOf(per, f.cmp);
  const series = useMemo(() => seriesOf(per, td), [per.kind, per.from, td]); // eslint-disable-line react-hooks/exhaustive-deps
  const [d, setD] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const archiveRequest = useRef(0);
  const savingArchive = useRef(false);
  const [err, setErr] = useState(null);
  const [arsip, setArsip] = useState(null); // arsip yang sedang dibuka (recap_get)
  const [detail, setDetail] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [trendKey, setTrendKey] = useState('pendapatan');
  const [trendMode, setTrendMode] = useState('periode');
  const ek = useKuotaEkspor(kosId);
  const scrollKey = 'prasara-rekap-scroll-' + kosId;
  const restored = useRef(false);

  useEffect(() => {
    const q = new URLSearchParams(Object.entries({ k: f.k, t: f.k === 'kustom' ? '' : f.t, dari: f.k === 'kustom' ? per.from : '', sampai: f.k === 'kustom' ? per.to : '', cmp: f.cmp === 'prev' ? '' : f.cmp, cabang: f.cabang })
      .filter(([, v]) => v));
    router.replace('/rekap?' + q, { scroll: false });
    try { localStorage.setItem('prasara-rekap-' + kosId, JSON.stringify({ k: f.k, cmp: f.cmp })); } catch { /* abaikan */ }
  }, [JSON.stringify(f)]); // eslint-disable-line react-hooks/exhaustive-deps

  // Posisi gulir dipulihkan setelah kembali dari modul tujuan drill-down
  useEffect(() => {
    const save = () => { try { sessionStorage.setItem(scrollKey, String(window.scrollY)); } catch { /* abaikan */ } };
    window.addEventListener('pagehide', save);
    return () => { save(); window.removeEventListener('pagehide', save); };
  }, [scrollKey]);
  useEffect(() => {
    if (!d || restored.current) return;
    restored.current = true;
    try { const y = +sessionStorage.getItem(scrollKey); if (y > 0) requestAnimationFrame(() => window.scrollTo(0, y)); } catch { /* abaikan */ }
  }, [d, scrollKey]);

  const loadKey = [per.kind, per.from, per.to, cmp?.from, cmp?.to, f.cabang, ver].join('|');
  const load = () => {
    let on = true; setD(null); setErr(null);
    supabase.rpc('biz_recap', { p_kos: kosId, p_from: per.from, p_to: per.to, p_cmp_from: cmp?.from || null, p_cmp_to: cmp?.to || null,
      p_branch: f.cabang || null, p_series: series.length ? series.map((s) => ({ from: s.from, to: s.to })) : null })
      .then(({ data, error }) => { if (!on) return; if (error) setErr(error); else setD(data); });
    return () => { on = false; };
  };
  useEffect(load, [kosId, loadKey, refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch) => { archiveRequest.current += 1; setDetail(null); setArsip(null); setF((x) => ({ ...x, ...patch })); };
  const go = (dir) => { const s = shiftPeriod(per, dir, td); if (!s) return; set(s.custom ? { t: s.anchor, dari: s.custom.from, sampai: s.custom.to } : { t: s.anchor }); };
  const canNext = !!shiftPeriod(per, 1, td);
  const kosName = kos.name;
  const viewing = arsip ? { ...arsip, cur: arsip.data } : null; // data arsip ditampilkan dengan tampilan yang sama
  const src = viewing || d;
  const c = src?.cur;
  const dv = useMemo(() => derive(c), [c]);
  const cdv = useMemo(() => (viewing ? null : derive(d?.cmp)), [d, viewing]);
  const T = { jasa: isKuliner(kos) ? 'pesanan' : 'pesanan', trx: c?.jenis === 'properti' ? 'Pembayaran diterima' : c?.jenis === 'jasa' ? 'Pesanan selesai' : 'Total transaksi' };
  const retailLike = ['retail', 'jasa', 'kustom'].includes(c?.jenis);
  const status = statusOf(viewing ? viewing.data.status : d?.status, viewing ? viewing.data.kelengkapan : d?.kini, !!viewing);
  const cmpName = !viewing && cmp && d?.cmp ? cmp.label : null;
  const cmpRange = cmpName ? rangeLabel(cmp.from, cmp.to) : '';
  const liveIssues = viewing ? null : d?.kini;
  const periodStatus = viewing ? viewing.data.status : d?.status;
  const fin = canArea(kos, 'finance');

  // ---------- Kepala halaman ----------
  const header = <PageHeader title={<span className={styles.title}><span className={styles.titleIco}><NavIcon name="/rekap" size={26} /></span>Rekap Bisnis</span>}
    help={<PageHelp page="rekap" label="? Panduan" />}
    desc="Rangkuman performa, transaksi, keuangan, persediaan, dan aktivitas bisnis berdasarkan periode."
    actions={<div className={styles.actions}>
      <button type="button" className={styles.btn} onClick={() => setArchiveOpen(true)}><Ico d={I.archive} size={18} /><span>Arsip</span></button>
      <button type="button" className={styles.btn} onClick={() => setFilterOpen(true)} aria-haspopup="dialog"><Ico d={I.filter} size={18} /><span>Filter{f.cabang || f.cmp !== 'prev' ? ' •' : ''}</span></button>
      <div className={styles.menuWrap}>
        <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={!src} onClick={() => setExportOpen((x) => !x)} aria-expanded={exportOpen}><Ico d={I.down} size={18} /><span>Ekspor PDF / Excel</span></button>
        {exportOpen && src && <div className={styles.menu} role="menu">
          <button role="menuitem" onClick={() => { setExportOpen(false); doExport('pdf'); }}>PDF</button>
          <button role="menuitem" onClick={() => { setExportOpen(false); doExport('xlsx'); }}>Excel (.xlsx)</button>
          <button role="menuitem" onClick={() => { setExportOpen(false); window.print(); }}>Cetak halaman</button>
          <button role="menuitem" onClick={() => { setExportOpen(false); shareText(); }}>Bagikan ringkasan</button>
          {ek.info && <small>{ek.info}</small>}
        </div>}
      </div>
    </div>} />;

  const periodBar = <div className={styles.periodBar}>
    <div className={styles.kinds} role="tablist" aria-label="Jenis periode">
      {KINDS.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={f.k === k} className={f.k === k ? styles.on : undefined}
        onClick={() => set(k === 'kustom' ? { k, dari: per.from, sampai: per.to } : { k, t: per.to })}>{label}</button>)}
    </div>
    <div className={styles.nav}>
      <button type="button" className={styles.navBtn} onClick={() => go(-1)} aria-label="Periode sebelumnya"><NavIcon name="prev" size={18} /></button>
      <label className={styles.pick}>
        <Ico d={I.cal} size={18} />
        <span><b>{per.label}</b>{per.kind !== 'harian' && per.kind !== 'kustom' && <small>{rangeLabel(per.from, per.to)}{per.running ? ' · berjalan' : ''}</small>}</span>
        {f.k === 'kustom' ? null : f.k === 'bulanan'
          ? <input type="month" aria-label="Pilih bulan" value={per.from.slice(0, 7)} max={td.slice(0, 7)} onChange={(e) => e.target.value && set({ t: e.target.value + '-01' })} />
          : <input type="date" aria-label="Pilih tanggal" value={f.t} max={td} onChange={(e) => e.target.value && set({ t: e.target.value })} />}
      </label>
      <button type="button" className={styles.navBtn} onClick={() => go(1)} disabled={!canNext} aria-label="Periode berikutnya"><NavIcon name="next" size={18} /></button>
    </div>
    {f.k === 'kustom' && <div className={styles.custom}>
      <label>Dari <input type="date" value={per.from} max={td} onChange={(e) => e.target.value && set({ dari: e.target.value, sampai: per.to })} /></label>
      <label>Sampai <input type="date" value={per.to} max={td} onChange={(e) => e.target.value && set({ dari: per.from, sampai: e.target.value })} /></label>
    </div>}
  </div>;

  const filterSheet = filterOpen && <Sheet title="Filter rekap" onClose={() => setFilterOpen(false)}>
    <div className={styles.filter}>
      <fieldset><legend>Bandingkan dengan</legend>
        {COMPARE.map(([k, label]) => <label key={k} className={styles.radio}><input type="radio" name="cmp" checked={f.cmp === k} onChange={() => set({ cmp: k })} />{label}</label>)}
      </fieldset>
      <fieldset><legend>Lokasi / cabang</legend>
        {!d ? <p className="muted small">Memuat lokasi…</p> : d.lokasi.filter((l) => !l.gudang).length <= 1 ? <p className="muted small">Bisnis ini memakai satu lokasi.</p> : <>
          <select value={f.cabang} disabled={!d.mendalam} onChange={(e) => set({ cabang: e.target.value })} aria-label="Lokasi">
            <option value="">Semua lokasi</option>{d.lokasi.filter((l) => !l.gudang).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {!d.mendalam && <p className="muted small">Rekap per cabang tersedia di Paket Pro.</p>}
          <p className="muted small">Kas, utang-piutang, persediaan, pajak, dan modal selalu untuk semua lokasi.</p></>}
      </fieldset>
      <p className="muted small">Ganti bisnis lewat nama bisnis di bagian atas aplikasi.</p>
      <button type="button" className="primary" onClick={() => setFilterOpen(false)}>Selesai</button>
    </div>
  </Sheet>;

  const archiveSheet = archiveOpen && <ArchiveSheet kosId={kosId} per={per} branch={f.cabang || null} onClose={() => setArchiveOpen(false)} onOpen={openArchive} onSave={saveArchive} />;

  if (err && !viewing) {
    const batas = /BATAS_PAKET/.test(err.message || '');
    return <div className={styles.page}>{header}{periodBar}{filterSheet}{archiveSheet}
      <div className="notice bad" role="alert">{/biz_recap/.test(err.message || '') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : errMsg(err)}</div>
      {f.cabang && <button type="button" onClick={() => set({ cabang: '' })}>Tampilkan semua lokasi</button>}
      {!batas && <button type="button" onClick={() => setRefresh((x) => x + 1)}>Muat ulang</button>}
    </div>;
  }
  if (!src || !dv) return <div className={styles.page}>{header}{periodBar}{filterSheet}{archiveSheet}<Loading rows={6} /></div>;

  // ---------- Angka utama ----------
  const p = dv.profit; const cp = cdv?.profit;
  const hppIncomplete = status?.flags.some(([key]) => key === 'tanpa_modal');
  const cmpHppIncomplete = !viewing && d?.cmp_kelengkapan?.tanpa_modal > 0;
  const location = viewing ? (viewing.branch_name || (viewing.branch_id ? 'Cabang terpilih' : 'Semua lokasi')) : d.branch_name || 'Semua lokasi';
  const currentArchive = d?.arsip_per_jenis?.[per.kind] || (d?.arsip?.kind === per.kind ? d.arsip : null);
  const R = { from: c.from, to: c.to, branch: viewing ? viewing.branch_id : f.cabang || null };
  const ym = c.to.slice(0, 7);
  const branchNote = R.branch ? 'Rincian jurnal mencakup semua lokasi; angka utama hanya lokasi terpilih.' : null;
  const reportHref = { retail: `/laporan-toko?dari=${c.from}&sampai=${c.to}`, jasa: `/laporan-jasa?bulan=${ym}`, properti: `/laporan?bulan=${ym}`, kustom: '/laporan-kustom' }[c.jenis] || '/laporan';
  const open = (x) => setDetail(x);
  const vs = (cur, prev, money = true, inverse = false) => {
    if (!cp || prev == null) return null; const v = pct(cur, prev);
    return <span className={`${styles.delta} ${v == null ? '' : (v >= 0) !== inverse ? styles.up : styles.dn}`}>{deltaText(cur, prev, money ? rp : angka)}</span>;
  };

  // ---------- Definisi rincian (drill-down) ----------
  // Setiap rincian: nilai, cara hitung, baris pembanding, jurnal sumber (bila uang), daftar transaksi sumber, tautan modul dengan filter periode sama.
  const D2 = {
    pendapatan: () => ({ title: 'Total pendapatan', value: rp(p.pendapatan), formula: 'Kredit dikurangi debit akun pendapatan di jurnal periode ini (sama dengan Laba Rugi di Pembukuan & Analisis Bisnis). Termasuk retur penjualan (pengurang) dan pendapatan lain.',
      rows: [['Pendapatan usaha', rp(p.usaha)], ['Retur penjualan', rp(p.retur)], ['Pendapatan lain', rp(p.lain)], cp && [`Pembanding (${cmpName})`, rp(cp.pendapatan)], cp && ['Perubahan', deltaText(p.pendapatan, cp.pendapatan)]],
      journal: { kinds: ['pendapatan'] }, docs: c.jenis === 'retail' ? ['penjualan'] : c.jenis === 'jasa' ? ['pesanan'] : c.jenis === 'properti' ? ['bayar_sewa'] : null,
      links: [[reportHref, 'Buka laporan'], [`/pembukuan?tab=laporan&bulan=${ym}`, 'Laba rugi di Pembukuan'], ['/analisis?p=kustom&dari=' + c.from + '&sampai=' + c.to, 'Analisis penyebab']] }),
    hpp: () => ({ title: 'HPP (modal barang terjual)', value: rp(p.hpp), formula: 'Debit dikurangi kredit akun Harga Pokok Penjualan. Penjualan tanpa harga modal membuat HPP terlalu kecil.',
      rows: [['Rasio HPP', pctTxt(p.hpp_pct)], cp && [`Pembanding (${cmpName})`, rp(cp.hpp)], liveIssues?.tanpa_modal ? ['Penjualan tanpa harga modal', angka(liveIssues.tanpa_modal)] : null],
      journal: { kinds: ['hpp'] }, docs: liveIssues?.tanpa_modal ? ['penjualan', 'tanpa_modal'] : null, links: [['/barang', 'Lengkapi harga modal di Barang']] }),
    biaya: () => ({ title: 'Total beban selain HPP', value: rp(p.biaya), formula: 'Semua beban selain HPP di jurnal: operasional, penyusutan, bunga, pajak penghasilan, dan beban lain. Pengambilan pemilik (prive) bukan biaya.',
      rows: [['Beban operasional', rp(p.operasional)], ['Penyusutan', rp(p.penyusutan)], ['Bunga pinjaman', rp(p.bunga)], ['Pajak penghasilan', rp(p.pajak)], ['Beban lain', rp(p.beban_lain)], ['Rasio biaya', pctTxt(p.biaya_pct)], cp && [`Pembanding (${cmpName})`, rp(cp.biaya)]],
      table: c.beban_akun?.length ? { cols: ['Akun', 'Nilai'], rows: c.beban_akun.map((b) => [b.akun, rp(b.nilai)]) } : null,
      journal: { kinds: ['biaya'] }, docs: ['pengeluaran'], links: [[retailLike ? '/kas' : `/pengeluaran?bulan=${ym}`, 'Buka Pengeluaran'], ['/anggaran', 'Anggaran vs realisasi']] }),
    laba: () => ({ title: 'Laba bersih', value: rp(p.laba), formula: 'Pendapatan − HPP − beban selain HPP (termasuk penyusutan, bunga, dan PPh bila tercatat).',
      rows: [['Pendapatan', rp(p.pendapatan)], ['HPP', rp(-p.hpp)], ['Laba kotor', rp(p.laba_kotor)], ['Total beban selain HPP', rp(-p.biaya)], ['Laba bersih', rp(p.laba)], ['Margin laba bersih', pctTxt(p.margin)],
        cp && [`Laba pembanding (${cmpName})`, rp(cp.laba)]], journal: { kinds: ['pendapatan', 'hpp', 'biaya'] }, links: [[`/pembukuan?tab=laporan&bulan=${ym}`, 'Laba rugi di Pembukuan']] }),
    transaksi: () => ({ title: T.trx, value: angka(p.transaksi), formula: 'Penjualan selesai + pesanan jasa selesai + pembayaran sewa terverifikasi di periode ini (sama dengan Analisis Bisnis).',
      rows: [['Rata-rata per transaksi', p.rata == null ? '—' : rp(p.rata)], ['Pelanggan/penghuni bertransaksi', angka(p.pelanggan)], cp && [`Pembanding (${cmpName})`, angka(cp.transaksi)]],
      docs: c.jenis === 'retail' ? ['penjualan'] : c.jenis === 'jasa' ? ['pesanan'] : c.jenis === 'properti' ? ['bayar_sewa'] : null,
      links: [c.jenis === 'retail' ? [`/penjualan?tanggal=${c.to}`, 'Buka Penjualan'] : c.jenis === 'jasa' ? ['/pesanan', 'Buka Pesanan'] : [`/pembayaran?bulan=${ym}`, 'Buka Pembayaran']] }),
    margin: () => ({ title: 'Komposisi keuangan', value: rp(p.pendapatan), formula: 'Bagian pendapatan yang menjadi HPP, beban selain HPP, dan laba bersih. Persentase = nilai ÷ total pendapatan.',
      rows: [['HPP', `${pctTxt(p.hpp_pct)} (${rp(p.hpp)})`], ['Operasional', `${pctTxt(p.biaya_pct)} (${rp(p.biaya)})`], ['Laba bersih', `${pctTxt(p.margin)} (${rp(p.laba)})`], ['Margin laba kotor', pctTxt(p.margin_kotor)]],
      journal: { kinds: ['pendapatan', 'hpp', 'biaya'] } }),
    kas: () => ({ title: 'Kas & bank', value: rp(dv.kas.akhir), formula: 'Saldo awal + kas masuk − kas keluar = saldo akhir. Pindah kas ↔ bank tidak dihitung sebagai masuk/keluar (sama dengan Arus Kas). Kas masuk bukan pendapatan: termasuk setoran modal, pinjaman, dan pelunasan piutang.',
      rows: [['Saldo awal', rp(dv.kas.awal)], ['Kas masuk', rp(dv.kas.masuk)], ['Kas keluar', rp(-dv.kas.keluar)], ['Saldo akhir', rp(dv.kas.akhir)], ['Cek saldo', dv.kas.cocok ? 'Cocok' : 'Ada selisih — periksa jurnal']],
      table: { cols: ['Akun', 'Awal', 'Debit', 'Kredit', 'Akhir'], rows: dv.kas.akun.map((a) => [a.name, rp(a.awal), rp(a.tambah), rp(a.kurang), rp(a.akhir)]) },
      journal: { kinds: ['kas'] }, links: [[retailLike ? '/kas' : `/pengeluaran?bulan=${ym}`, 'Buka Kas'], [`/pembukuan?tab=laporan&bulan=${ym}`, 'Arus kas di Pembukuan'], [`/pembukuan?tab=bank&bulan=${ym}`, 'Rekonsiliasi bank']] }),
    piutang: () => ({ title: 'Piutang', value: rp(dv.piutang.akhir), formula: 'Saldo akun piutang di jurnal: awal + piutang baru − penerimaan = akhir.',
      rows: [['Saldo awal', rp(dv.piutang.awal)], ['Piutang baru', rp(dv.piutang.tambah)], ['Diterima / dikurangi', rp(-dv.piutang.kurang)], ['Saldo akhir', rp(dv.piutang.akhir)], liveIssues?.piutang_pelanggan != null && ['Pelanggan dengan piutang terbuka (hari ini)', angka(liveIssues.piutang_pelanggan)]],
      journal: { sys: ['piutang', 'piutang_jasa'] }, links: [['/pembukuan?tab=umur', 'Umur piutang'], ['/kas', 'Terima pembayaran kasbon']] }),
    utang: () => ({ title: 'Utang usaha', value: rp(dv.utang.akhir), formula: 'Saldo akun utang usaha (supplier) di jurnal: awal + utang baru − pembayaran = akhir.',
      rows: [['Saldo awal', rp(dv.utang.awal)], ['Utang baru', rp(dv.utang.tambah)], ['Dibayar / dikurangi', rp(-dv.utang.kurang)], ['Saldo akhir', rp(dv.utang.akhir)], liveIssues?.utang_supplier != null && ['Supplier dengan utang terbuka (hari ini)', angka(liveIssues.utang_supplier)],
        Math.abs(dv.pinjaman.akhir) >= 1 && ['Pinjaman (saldo akhir)', rp(dv.pinjaman.akhir)]],
      journal: { sys: ['utang'] }, docs: c.pembelian ? ['pembelian'] : null, links: [['/pembukuan?tab=umur', 'Umur utang'], ['/kas', 'Bayar utang supplier']] }),
    penjualan: () => { const s = c.penjualan; return { title: 'Rekap penjualan', value: rp(s.omzet), formula: 'Omzet bersih = penjualan selesai (tanpa PPN, setelah diskon) − retur. Rumus sama dengan Laporan toko.',
      rows: [['Penjualan kotor', rp(s.bruto)], ['Diskon', rp(-s.diskon)], s.promo > 0 && ['· termasuk promo', rp(-s.promo)], ['Retur', rp(-s.retur)], ['Omzet bersih', rp(s.omzet)], s.ppn > 0 && ['PPN keluaran (di luar omzet)', rp(s.ppn)],
        ['Tunai', rp(s.bayar?.tunai)], ['Transfer', rp(s.bayar?.transfer)], ['Kasbon', rp(s.bayar?.kasbon)], s.bayar?.nota > 0 && ['Nota kredit', rp(s.bayar.nota)], s.grosir > 0 && ['· dari harga grosir', rp(s.grosir)],
        [T.trx, angka(s.trx)], ['Transaksi batal', angka(s.batal_n)], ['Retur (dokumen)', angka(s.retur_n)]],
      table: s.produk?.length ? { title: 'Produk terlaris', cols: ['Produk', 'Jumlah', 'Omzet'], rows: s.produk.map((x) => [x.name, qty(x.qty), rp(x.omzet)]) } : null,
      docs: ['penjualan'], extraDocs: [['retur', 'Retur'], ['penjualan:batal', 'Transaksi batal'], ['penjualan:diskon', 'Penjualan berdiskon']],
      links: [[`/penjualan?tanggal=${c.to}`, 'Buka Penjualan'], [`/laporan-toko?dari=${c.from}&sampai=${c.to}`, 'Laporan toko'], ['/shift', 'Shift kasir'], ['/tutup-hari', 'Tutup harian']] }; },
    kategori: (k) => ({ title: `Kategori: ${k.name}`, value: rp(k.omzet), formula: 'Omzet baris penjualan selesai dikurangi retur, dikelompokkan menurut kategori barang.', rows: [['Jumlah terjual', qty(k.qty)], ['Laba kotor', rp(k.laba)], ['Porsi dari omzet', pctTxt(share(k.omzet, c.penjualan.omzet))]],
      docs: ['kategori', k.id || '-'], links: [['/barang', 'Buka Barang']] }),
    pembelian: (sup) => { const b = c.pembelian; return { title: sup ? `Pembelian: ${sup.name}` : 'Rekap pembelian', value: rp(sup ? sup.total : b.total), formula: 'Belanja berstatus selesai/sebagian menurut tanggal belanja (nilai barang; PPN masukan & selisih faktur dicatat terpisah di faktur supplier).',
      rows: sup ? [['Transaksi', angka(sup.n)], ['Porsi dari total belanja', pctTxt(share(sup.total, b.total))]] : [['Transaksi', angka(b.n)], ['Dibeli dengan utang', rp(b.utang)], ['Retur ke supplier', `${rp(b.retur)} (${angka(b.retur_n)})`], ['Pesanan belum diterima', `${angka(b.dipesan_n)} · ${rp(b.dipesan)}`]],
      table: !sup && b.supplier?.length ? { cols: ['Supplier', 'Transaksi', 'Nilai'], rows: b.supplier.map((x) => [x.name, angka(x.n), rp(x.total)]) } : null,
      docs: ['pembelian', sup ? (sup.id || '-') : null], links: [[`/belanja?bulan=${ym}`, 'Buka Belanja'], ['/kontak', 'Supplier']] }; },
    persediaan: (grp) => { const s = dv.stok; const kinds = grp ? STOCK_GROUPS[grp] : null; return { title: grp ? `Persediaan: ${{ masuk: 'barang masuk', keluar: 'barang keluar', penyesuaian: 'penyesuaian' }[grp]}` : 'Pergerakan persediaan',
      value: rp(grp ? s[grp] : s.akhir), formula: 'Dari kartu stok semua lokasi (pindah antar lokasi tidak dihitung). Stok awal + masuk + keluar + penyesuaian = stok akhir. Nilai = nilai kartu stok; jumlah = satuan dasar tiap barang (campuran).',
      rows: [['Stok awal', `${qty(s.awal_qty)} · ${rp(s.awal)}`], ['Barang masuk', `${qty(s.masuk_qty)} · ${rp(s.masuk)}`], ['Barang keluar', `${qty(s.keluar_qty)} · ${rp(s.keluar)}`], ['Penyesuaian', `${qty(s.penyesuaian_qty)} · ${rp(s.penyesuaian)}`],
        ['Stok akhir', `${qty(s.akhir_qty)} · ${rp(s.akhir)}`], ['Saldo akun Persediaan (jurnal)', rp(s.buku)], liveIssues && ['Barang habis / di bawah minimum (hari ini)', `${angka(liveIssues.stok_habis)} / ${angka(liveIssues.di_bawah_min)}`]],
      table: { cols: ['Jenis gerak', 'Catatan', 'Jumlah', 'Nilai'], rows: (c.persediaan.jenis || []).filter((j) => !kinds || kinds.includes(j.kind)).map((j) => [STOCK_KIND[j.kind] || j.kind, angka(j.n), qty(j.qty), rp(j.nilai)]) },
      docs: ['stok', kinds ? kinds.join(',') : null], links: [['/barang', 'Buka Barang & stok'], ['/pembukuan?tab=persediaan', 'Nilai persediaan'], ['/mutasi', 'Mutasi stok']] }; },
    pengeluaran: (k) => ({ title: k ? `Pengeluaran: ${k.name}` : 'Rekap pengeluaran', value: rp(k ? k.total : n(c.pengeluaran.operasional) + n(c.pengeluaran.modal) + n(c.pengeluaran.non_operasional)),
      formula: 'Catatan Pengeluaran/Kas menurut kategori. Biaya operasional di laba rugi tetap dari jurnal (bisa berbeda karena penyusutan, selisih stok, gaji yang dicatat lewat SDM, dsb.).',
      rows: k ? [['Catatan', angka(k.n)], ['Jenis', k.kind]] : [['Operasional', rp(c.pengeluaran.operasional)], ['Modal / investasi', rp(c.pengeluaran.modal)], ['Non-operasional', rp(c.pengeluaran.non_operasional)], ['Jumlah catatan', angka(c.pengeluaran.n)]],
      table: !k ? { cols: ['Kategori', 'Catatan', 'Nilai'], rows: c.pengeluaran.kategori.map((x) => [x.name, angka(x.n), rp(x.total)]) } : null,
      docs: ['pengeluaran', k ? (k.id || '-') : null], links: [[retailLike ? '/kas' : `/pengeluaran?bulan=${ym}`, 'Buka Pengeluaran'], ['/anggaran', 'Anggaran']] }),
    pelanggan: (seg) => { const s = c.pelanggan; return { title: seg ? `Pelanggan ${({ aktif: 'aktif', baru: 'baru', berulang: 'berulang', setia: 'setia', tidak_aktif: 'tidak aktif' })[seg]}` : 'Aktivitas pelanggan',
      value: angka(seg ? s[seg] : s.aktif), formula: 'Kontak pelanggan yang bertransaksi (Kasir/Pesanan). Baru = transaksi pertamanya di periode ini; berulang = ≥ 2 transaksi di periode ini; setia = ≥ 3 transaksi dalam 180 hari; tidak aktif = bertransaksi dalam 180 hari terakhir tetapi tidak di periode ini. Transaksi tanpa nama pelanggan tidak terhitung.',
      rows: [['Total pelanggan terdaftar', angka(s.terdaftar)], ['Pelanggan terdaftar baru', angka(s.terdaftar_baru)], ['Aktif', angka(s.aktif)], ['Baru', angka(s.baru)], ['Berulang', angka(s.berulang)], ['Setia', angka(s.setia)], ['Tidak aktif', angka(s.tidak_aktif)], ['Nilai transaksi pelanggan bernama', rp(s.nilai)]],
      docs: ['pelanggan', seg || 'aktif'], links: [['/kontak', 'Buka Pelanggan'], ['/crm', 'Prospek']] }; },
    karyawan: () => { const k = c.karyawan; return { title: 'Rekap karyawan', value: `${angka(k.aktif)} karyawan`, formula: 'Absensi, gaji (run gaji berstatus dibayar menurut tanggal bayar), kasbon karyawan aktif, dan komisi yang dipindah ke gaji di periode ini.',
      rows: [...Object.entries(k.kehadiran || {}).map(([s, v]) => [`Absensi ${ATT[s] || s}`, `${angka(v)} hari`]), ['Jam kerja', `${qty(k.jam)} jam`], ['Lembur', `${qty(k.lembur)} jam`], ['Gaji dibayar', `${rp(k.gaji)} (${angka(k.gaji_n)} run)`], ['Kasbon karyawan', rp(k.kasbon)], ['Komisi', rp(k.komisi)]],
      docs: k.gaji_n ? ['gaji'] : null, links: [['/sdm', 'Buka SDM & gaji'], ['/komisi', 'Komisi']] }; },
    aset: () => { const a = c.aset || {}; return { title: 'Rekap aset tetap', value: rp(dv.aset_buku), formula: 'Nilai buku = saldo akun Aset tetap − akumulasi penyusutan di jurnal. Penyusutan bukan uang keluar.',
      rows: [['Aset baru', `${angka(a.baru_n)} · ${rp(a.baru)}`], ['Aset dilepas', `${angka(a.lepas_n)} · hasil ${rp(a.lepas)}`], ['Penyusutan periode ini', rp(p.penyusutan)], ['Aset aktif per akhir periode', angka(a.aktif)], ['Nilai buku akhir', rp(dv.aset_buku)]],
      journal: { sys: ['aset_tetap', 'akum_penyusutan'] }, docs: c.aset ? ['aset'] : null, links: [['/aset', 'Buka Aset tetap']] }; },
    pajak: () => ({ title: 'Rekap pajak', value: rp(dv.pajak.kewajiban_akhir), formula: 'PPN keluaran/masukan dari akun PPN; PPh final = beban PPh yang dijurnal; setoran = catatan Kas "bayar pajak". Kewajiban akhir = utang PPh + PPN keluaran − PPN masukan. Perhitungan internal, bukan pengganti DJP.',
      rows: [['PPN keluaran tercatat', rp(dv.pajak.ppn_keluaran)], ['PPN masukan', rp(dv.pajak.ppn_masukan)], ['PPh final tercatat', rp(dv.pajak.pph)], ['Pajak disetor', rp(dv.pajak.setor)], ['Kewajiban pajak akhir', rp(dv.pajak.kewajiban_akhir)]],
      journal: { sys: ['ppn_keluaran', 'ppn_masukan', 'utang_pph'] }, links: [['/analisis?m=pajak', 'Pajak di Analisis Bisnis']] }),
    modal: () => ({ title: 'Perubahan modal', value: rp(dv.modal.akhir), formula: 'Modal awal + setoran − prive + laba periode + mutasi lain = modal akhir. Modal termasuk laba yang belum diambil. Setoran modal & prive mengubah modal, bukan laba.',
      rows: [['Modal awal', rp(dv.modal.awal)], ['Setoran modal', rp(dv.modal.setoran)], ['Prive (diambil pemilik)', rp(-dv.modal.prive)], ['Laba periode', rp(dv.modal.laba)], Math.abs(dv.modal.lain) >= 1 && ['Mutasi ekuitas lain (saldo awal, koreksi)', rp(dv.modal.lain)],
        ['Modal akhir', rp(dv.modal.akhir)], ['Neraca seimbang', dv.seimbang ? 'Ya' : 'Tidak — periksa jurnal']],
      journal: { sys: ['modal', 'prive', 'saldo_awal'] }, links: [['/kas', 'Catat setoran / prive'], ['/analisis?m=keuangan', 'Laporan perubahan ekuitas']] }),
    pesanan: () => { const o = c.operasional || {}; return { title: isKuliner(kos) ? 'Rekap pesanan & menu' : 'Rekap pesanan & layanan', value: angka(o.pesanan), formula: 'Pesanan berstatus selesai menurut tanggal diserahkan. Pendapatan diakui saat diserahkan; uang muka sebelumnya bukan pendapatan.',
      rows: [['Pesanan masuk', angka(o.masuk)], ['Pesanan selesai', angka(o.pesanan)], o.dengan_janji > 0 && ['Siap tepat waktu', `${angka(o.tepat_waktu)} dari ${angka(o.dengan_janji)} pesanan berjanji`], ['Dikerjakan ulang', angka(o.ulang)], ['Batal', angka(o.batal)], ['Dari halaman bisnis (online)', angka(o.online)], ['Nilai pesanan selesai', rp(o.pendapatan)], ['Uang masuk (termasuk uang muka)', rp(c.uang_masuk_jasa)],
        !o.kuliner && n(o.kg) > 0 && ['Kilogram selesai', `${qty(o.kg)} kg`], !o.kuliner && ['Antar-jemput', angka(o.antar_jemput)], o.proses_jam != null && ['Rata-rata lama proses', `${qty(o.proses_jam)} jam`], ['Keluhan', angka(o.keluhan)],
        o.kuliner && ['Makan di tempat / bungkus', `${angka(o.tempat)} / ${angka(o.bungkus)}`], o.kuliner && o.biaya_resep != null && ['Biaya bahan (resep)', rp(o.biaya_resep)]],
      table: c.layanan?.length ? { title: isKuliner(kos) ? 'Menu terjual' : 'Layanan teratas', cols: [isKuliner(kos) ? 'Menu' : 'Layanan', 'Jumlah', 'Nilai'], rows: c.layanan.map((x) => [x.name, `${qty(x.qty)} ${x.unit || ''}`, rp(x.nilai)]) } : null,
      docs: ['pesanan'], links: [['/pesanan', 'Buka Pesanan'], [`/laporan-jasa?bulan=${ym}`, 'Laporan jasa'], o.kuliner && ['/resep', 'Resep & food cost'], o.kuliner && ['/meja', 'Meja']] }; },
    sewa: () => { const o = c.operasional || {}; const s = c.sewa || {}; const occ = o.kamar && o.hari ? (o.kamar_hari * 100) / (o.kamar * o.hari) : null; return { title: 'Rekap sewa & hunian', value: rp(o.uang_masuk),
      formula: 'Hunian = hari kamar terisi ÷ (kamar × hari). Uang masuk = pembayaran terverifikasi (kas, bukan pendapatan akrual). Tunggakan = tagihan jatuh tempo s.d. akhir periode yang belum dibayar per akhir periode.',
      rows: [['Kamar disewakan', angka(o.kamar)], ['Tingkat hunian', occ == null ? 'Belum dapat dihitung' : pctTxt(occ)], ['Kamar terisi di akhir periode', angka(o.terisi_akhir)], ['Penghuni aktif', angka(s.penghuni_aktif)], ['Penghuni masuk / keluar', `${angka(o.masuk)} / ${angka(o.keluar)}`],
        ['Tagihan terbit', `${rp(s.tagihan_terbit)} (${angka(s.tagihan_terbit_n)})`], ['Tagihan jatuh tempo di periode', rp(o.tagihan)], ['Pembayaran diterima', rp(o.uang_masuk)], ['Tunggakan per akhir periode', rp(s.tunggakan_total)],
        ['Tepat waktu', `${angka(o.tepat_bayar)} dari ${angka(o.tagihan_n)} tagihan`], ['Booking baru', angka(s.booking_baru)], liveIssues?.menunggu_verifikasi ? ['Bukti bayar menunggu verifikasi', angka(liveIssues.menunggu_verifikasi)] : null],
      docs: ['bayar_sewa'], links: [[`/pembayaran?bulan=${ym}`, 'Buka Pembayaran'], ['/tagihan', 'Tagihan'], ['/penghuni', 'Penghuni'], ['/kamar', 'Kamar']] }; },
    proyek: () => { const o = c.proyek; return { title: 'Rekap proyek', value: rp(o.ditagih), formula: 'Proyek mulai/selesai menurut tanggal; ditagih = tagihan termin terbit (bukan pendapatan); diterima = pembayaran klien dikurangi pengembalian.',
      rows: [['Proyek dimulai', angka(o.mulai)], ['Proyek selesai', angka(o.selesai)], liveIssues && ['Proyek berjalan (hari ini)', angka(liveIssues.proyek_berjalan)], ['Ditagih', rp(o.ditagih)], ['Diterima', rp(o.diterima)]],
      docs: ['tagihan_proyek'], links: [['/proyek', 'Buka Proyek'], ['/proyek?tab=laba', 'Laba proyek']] }; },
  };

  // ---------- Kartu ----------
  const card = (id, title, body, opt = {}) => <section key={id} id={'rk-' + id} className={`${styles.card} ${opt.cls || ''}`} aria-labelledby={'rkt-' + id}>
    <header className={styles.cardH}><h2 id={'rkt-' + id} className={styles.cardT}><span className={styles.tIco}><Ico d={SEC_ICON[id] || I.list} size={19} /></span>{title}</h2>
      {opt.more !== false && <button type="button" className={styles.link} onClick={() => open(opt.detail || [id])}>Lihat Detail <NavIcon name="next" size={14} /></button>}</header>
    {body}
  </section>;
  const kv = (rows) => <dl className={styles.kv}>{rows.filter(Boolean).map(([k, v, onClick, tone]) => <div key={k} className={tone ? styles[tone] : undefined}><dt>{k}</dt><dd>{onClick ? <button type="button" onClick={onClick}>{v}</button> : v}</dd></div>)}</dl>;
  const tableRows = (cols, rows, foot) => <div className={styles.tblWrap}><table className={styles.tbl}><thead><tr>{cols.map((x, i) => <th key={i} className={i ? styles.num : undefined}>{x}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i} onClick={r.onClick} className={r.onClick ? styles.click : undefined} tabIndex={r.onClick ? 0 : undefined} onKeyDown={r.onClick ? (e) => e.key === 'Enter' && r.onClick() : undefined}>
      {r.cells.map((x, j) => <td key={j} className={j ? styles.num : undefined}>{x}</td>)}</tr>)}</tbody>
    {foot && <tfoot><tr>{foot.map((x, j) => <td key={j} className={j ? styles.num : undefined}>{x}</td>)}</tr></tfoot>}</table></div>;

  const sections = sectionsFor(c, dv);
  const body = {
    penjualan: () => { const s = c.penjualan; const top = (s.kategori || []).slice(0, 5); return tableRows(['Kategori', 'Qty', 'Omzet', '%'],
      top.map((k) => ({ cells: [k.name, qty(k.qty), rp(k.omzet), pctTxt(share(k.omzet, s.omzet))], onClick: () => open(['kategori', k]) })),
      ['Total', qty((s.kategori || []).reduce((t, k) => t + n(k.qty), 0)), rp(s.omzet), s.omzet ? '100%' : '—']); },
    pesanan: () => { const o = c.operasional || {}; return <>{kv([['Pesanan selesai', angka(o.pesanan)], o.dengan_janji > 0 && ['Siap tepat waktu', pctTxt(share(o.tepat_waktu, o.dengan_janji)), () => open(['pesanan'])], ['Pesanan masuk', angka(o.masuk)], ['Nilai selesai', rp(o.pendapatan)], ['Uang masuk', rp(c.uang_masuk_jasa)],
      !o.kuliner && n(o.kg) > 0 && ['Kilogram', `${qty(o.kg)} kg`], o.kuliner && ['Di tempat / bungkus', `${angka(o.tempat)} / ${angka(o.bungkus)}`]])}
      {c.layanan?.length > 0 && tableRows([isKuliner(kos) ? 'Menu' : 'Layanan', 'Jumlah', 'Nilai'], c.layanan.slice(0, 4).map((x) => ({ cells: [x.name, qty(x.qty), rp(x.nilai)], onClick: () => open(['pesanan']) })))}</>; },
    sewa: () => { const o = c.operasional || {}; const s = c.sewa || {}; const occ = o.kamar && o.hari ? (o.kamar_hari * 100) / (o.kamar * o.hari) : null;
      return kv([['Tingkat hunian', occ == null ? 'Belum dapat dihitung' : pctTxt(occ)], ['Penghuni aktif', angka(s.penghuni_aktif)], ['Masuk / keluar', `${angka(o.masuk)} / ${angka(o.keluar)}`], ['Tagihan terbit', rp(s.tagihan_terbit)],
        ['Pembayaran diterima', rp(o.uang_masuk), () => open(['sewa'])], ['Tunggakan', rp(s.tunggakan_total), null, n(s.tunggakan_total) > 0 ? 'warnRow' : null]]); },
    pembelian: () => { const b = c.pembelian; return tableRows(['Supplier', 'Transaksi', 'Nilai Pembelian'], (b.supplier || []).slice(0, 4).map((x) => ({ cells: [x.name, angka(x.n), rp(x.total)], onClick: () => open(['pembelian', x]) })),
      ['Total', angka(b.n), rp(b.total)]); },
    persediaan: () => { const s = dv.stok; return tableRows(['Aktivitas', 'Qty', 'Nilai'], [
      { cells: ['Stok awal', qty(s.awal_qty), rp(s.awal)], onClick: () => open(['persediaan']) },
      { cells: ['Barang masuk', qty(s.masuk_qty), rp(s.masuk)], onClick: () => open(['persediaan', 'masuk']) },
      { cells: ['Barang keluar', <span key="q" className={styles.neg}>{paren(s.keluar_qty).replace('Rp', '')}</span>, <span key="v" className={styles.neg}>{paren(s.keluar)}</span>], onClick: () => open(['persediaan', 'keluar']) },
      { cells: ['Penyesuaian', <span key="q" className={s.penyesuaian_qty < 0 ? styles.neg : undefined}>{paren(s.penyesuaian_qty).replace('Rp', '')}</span>, <span key="v" className={s.penyesuaian < 0 ? styles.neg : undefined}>{paren(s.penyesuaian)}</span>], onClick: () => open(['persediaan', 'penyesuaian']) }],
      ['Stok akhir', qty(s.akhir_qty), rp(s.akhir)]); },
    laba: () => <Waterfall height={190} steps={[{ label: 'Pendapatan', value: p.pendapatan, total: true }, { label: 'HPP', value: -p.hpp }, { label: 'Laba kotor', value: p.laba_kotor, total: true },
      { label: 'Total beban selain HPP', value: -p.biaya }, { label: 'Laba bersih', value: p.laba, total: true }]} onPick={(i) => open([['pendapatan', 'hpp', 'laba', 'biaya', 'laba'][i]])} />,
    pengeluaran: () => { const k = c.pengeluaran.kategori.slice(0, 5); const tot = c.pengeluaran.kategori.reduce((t, x) => t + n(x.total), 0);
      return <div className={styles.bars}>{k.map((x) => <button key={x.name + x.kind} type="button" onClick={() => open(['pengeluaran', x])}><span>{x.name}</span><b>{rp(x.total)}</b>
        <i style={{ width: `${Math.max(3, (n(x.total) * 100) / (tot || 1))}%` }} /></button>)}</div>; },
    kas: () => <>{tableRows(['Akun', 'Saldo akhir'], dv.kas.akun.map((a) => ({ cells: [a.name, rp(a.akhir)], onClick: () => open(['kas']) })), ['Total saldo', rp(dv.kas.akhir)])}
      {kv([['Saldo awal', rp(dv.kas.awal)], ['Kas masuk', rp(dv.kas.masuk), () => open(['kas'])], ['Kas keluar', rp(-dv.kas.keluar), () => open(['kas'])]])}</>,
    utang: () => <div className={styles.duo}>
      <button type="button" className={styles.duoGood} onClick={() => open(['piutang'])}><small>Piutang usaha</small><b>{rp(dv.piutang.akhir)}</b><em>{liveIssues?.piutang_pelanggan != null ? `${angka(liveIssues.piutang_pelanggan)} pelanggan` : `baru ${rp(dv.piutang.tambah)}`}</em></button>
      <button type="button" className={styles.duoBad} onClick={() => open(['utang'])}><small>Utang usaha</small><b>{rp(dv.utang.akhir)}</b><em>{liveIssues?.utang_supplier != null ? `${angka(liveIssues.utang_supplier)} supplier` : `baru ${rp(dv.utang.tambah)}`}</em></button>
    </div>,
    pelanggan: () => { const s = c.pelanggan; const row = (k, label) => [label, angka(s[k]), () => open(['pelanggan', k])];
      return kv([['Total pelanggan', angka(s.terdaftar), () => open(['pelanggan'])], row('baru', 'Pelanggan baru'), row('aktif', 'Pelanggan aktif'), row('berulang', 'Pelanggan berulang'), row('tidak_aktif', 'Tidak aktif (180 hari)')]); },
    karyawan: () => { const k = c.karyawan; return kv([['Karyawan aktif', angka(k.aktif)], ['Hadir', `${angka(k.kehadiran?.hadir)} hari`], ['Jam kerja / lembur', `${qty(k.jam)} / ${qty(k.lembur)} jam`], ['Gaji dibayar', rp(k.gaji), () => open(['karyawan'])], k.komisi > 0 && ['Komisi', rp(k.komisi)]]); },
    aset: () => kv([['Aset baru', `${angka(c.aset?.baru_n)} · ${rp(c.aset?.baru)}`], ['Dilepas', angka(c.aset?.lepas_n)], ['Penyusutan', rp(p.penyusutan), () => open(['aset'])], ['Nilai buku akhir', rp(dv.aset_buku), () => open(['aset'])]]),
    pajak: () => kv([['PPN keluaran', rp(dv.pajak.ppn_keluaran)], dv.pajak.ppn_masukan ? ['PPN masukan', rp(dv.pajak.ppn_masukan)] : null, ['PPh final', rp(dv.pajak.pph)], ['Disetor', rp(dv.pajak.setor)], ['Kewajiban akhir', rp(dv.pajak.kewajiban_akhir), () => open(['pajak'])]]),
    modal: () => kv([['Modal awal', rp(dv.modal.awal)], ['Setoran modal', rp(dv.modal.setoran)], ['Prive', rp(-dv.modal.prive)], ['Laba periode', rp(dv.modal.laba)], ['Modal akhir', rp(dv.modal.akhir), () => open(['modal'])]]),
    proyek: () => kv([['Proyek dimulai', angka(c.proyek.mulai)], ['Proyek selesai', angka(c.proyek.selesai)], ['Ditagih', rp(c.proyek.ditagih), () => open(['proyek'])], ['Diterima', rp(c.proyek.diterima)]]),
    aktivitas: () => <Activity kosId={kosId} from={c.from} to={c.to} total={c.aktivitas?.total} />,
  };
  const SEC_TITLE = { penjualan: 'Rekap Penjualan', pesanan: sections.find((s) => s[0] === 'pesanan')?.[1], sewa: 'Rekap Sewa & Hunian', pembelian: 'Rekap Pembelian', persediaan: 'Pergerakan Persediaan', laba: 'Laba Rugi',
    pengeluaran: 'Rekap Pengeluaran', kas: 'Kas & Bank', utang: 'Piutang & Utang', pelanggan: 'Aktivitas Pelanggan', karyawan: 'Rekap Karyawan', aset: 'Aset Tetap', pajak: 'Pajak', modal: 'Perubahan Modal', proyek: 'Proyek', aktivitas: 'Aktivitas Operasional' };
  const detailKey = { laba: ['laba'], utang: ['piutang'], aktivitas: null };

  // ---------- KPI ----------
  const kpiCard = (key, ico, label, value, sub, tone) => <button key={key} type="button" className={`${styles.kpi} ${tone ? styles[tone] : ''}`} onClick={() => open([key])}>
    <span className={styles.kpiH}><Ico d={ico} size={19} />{label}<NavIcon name="next" size={16} /></span>
    <b className={styles.kpiV}>{value}</b><span className={styles.kpiS}>{sub}</span></button>;
  const kpis = <div className={styles.kpis}>
    <button type="button" className={styles.hero} onClick={() => open(['pendapatan'])}>
      <span className={styles.heroL}>Total pendapatan</span><b className={styles.heroV}>{rp(p.pendapatan)}</b>
      {cp ? <span className={styles.heroS}><span className={styles.pill}>{deltaText(p.pendapatan, cp.pendapatan)}</span> dari {rp(cp.pendapatan)}</span>
        : viewing && <span className={styles.heroS}>Arsip versi {viewing.version}</span>}
      <svg className={styles.heroArt} viewBox="0 0 60 40" aria-hidden="true">{[8, 16, 24, 32, 40].map((h, i) => <rect key={i} x={i * 12} y={40 - h} width="8" height={h} rx="2" />)}</svg>
    </button>
    {kpiCard('hpp', I.layers, 'HPP', rp(p.hpp), hppIncomplete ? 'HPP tercatat · data belum lengkap' : cmpHppIncomplete ? 'HPP pembanding belum lengkap' : cp ? vs(p.hpp, cp.hpp, true, true) : pctTxt(p.hpp_pct) + ' dari pendapatan')}
    {kpiCard('biaya', I.gear, 'Total beban selain HPP', rp(p.biaya), cp ? vs(p.biaya, cp.biaya, true, true) : pctTxt(p.biaya_pct) + ' dari pendapatan')}
    {kpiCard('laba', I.bars, 'Laba bersih', rp(p.laba), hppIncomplete ? 'Laba sementara · HPP belum lengkap' : cmpHppIncomplete ? 'HPP pembanding belum lengkap' : cp ? vs(p.laba, cp.laba) : pctTxt(p.margin) + ' dari pendapatan', p.laba < 0 ? 'lossKpi' : 'goodKpi')}
    {kpiCard('transaksi', I.cart, T.trx, angka(p.transaksi), cp ? vs(p.transaksi, cp.transaksi, false) : <>rata-rata {p.rata == null ? '—' : rp(p.rata)}</>)}
  </div>;

  // ---------- Grafik ----------
  const comp = (() => { const tot = Math.max(1, n(p.hpp) + Math.max(0, n(p.biaya)) + Math.max(0, n(p.laba)));
    const parts = [['HPP', p.hpp, C.dark, 'hpp'], ['Beban selain HPP', p.biaya, C.amber, 'biaya'], ['Laba Bersih', Math.max(0, p.laba), C.mid, 'laba']];
    return <section className={styles.card} aria-labelledby="rk-comp">
      <header className={styles.cardH}><h2 id="rk-comp" className={styles.cardT}>Komposisi Keuangan</h2><button type="button" className={styles.info} onClick={() => open(['margin'])} aria-label="Cara hitung"><NavIcon name="info" size={16} /></button></header>
      {p.pendapatan > 0 ? <>
        <div className={styles.stack} role="img" aria-label="Komposisi HPP, beban selain HPP, dan laba bersih">{parts.map(([l, v, col, k]) => n(v) > 0 && <button key={l} type="button" style={{ flexGrow: n(v) / tot, background: col }} onClick={() => open([k])} title={`${l} ${pctTxt(share(v, p.pendapatan))}`}>
          {share(v, p.pendapatan) >= 7 ? pctTxt(share(v, p.pendapatan)) : ''}</button>)}</div>
        <ul className={styles.legend}>{parts.map(([l, v, col, k]) => <li key={l}><button type="button" onClick={() => open([k])}><i style={{ background: col }} /><span>{l}</span><b>{pctTxt(share(l === 'Laba Bersih' ? p.laba : v, p.pendapatan))}</b><em>({rp(l === 'Laba Bersih' ? p.laba : v)})</em></button></li>)}</ul>
        {p.laba < 0 && <p className={styles.note}>Rugi {rp(-p.laba)}: biaya melebihi pendapatan.</p>}
        <button type="button" className={styles.link} onClick={() => open(['margin'])}>Detail Komposisi <NavIcon name="next" size={14} /></button>
      </> : <p className={styles.empty}>Belum ada pendapatan di periode ini.</p>}
    </section>; })();
  const TRENDS = [['pendapatan', 'Pendapatan'], ['laba', 'Laba bersih'], ['hpp', 'HPP'], ['biaya', 'Biaya']];
  const inPeriod = (c.tren || []).map((t) => ({ ...t, laba: n(t.pendapatan) - n(t.hpp) - n(t.biaya), label: c.grain === 'day' ? tgl(t.mulai) : shortLabel('bulanan', t.mulai) + ' ' + t.mulai.slice(0, 4), short: c.grain === 'day' ? String(+t.mulai.slice(8)) : shortLabel('bulanan', t.mulai) }));
  const across = (src.seri || []).map((s, i) => ({ ...s.v, label: series[i]?.title || rangeLabel(s.from, s.to), short: series[i]?.label || s.from.slice(5), from: s.from, to: s.to }));
  const useAcross = trendMode === 'antar' && across.length > 1;
  const pts = useAcross ? across : inPeriod;
  const pickPoint = (i) => { const x = pts[i]; if (!x) return; if (useAcross) { set({ t: x.from }); return; }
    const from = x.mulai; const to = c.grain === 'day' ? x.mulai : (x.mulai.slice(0, 8) + new Date(Date.UTC(+x.mulai.slice(0, 4), +x.mulai.slice(5, 7), 0)).getUTCDate());
    open(['titik', { from, to: to > c.to ? c.to : to, label: x.label, v: x }]); };
  const trendCard = (key, title, mk, money) => <section className={styles.card} aria-labelledby={'rk-' + key}>
    <header className={styles.cardH}><h2 id={'rk-' + key} className={styles.cardT}>{title}</h2>
      <span className={styles.selects}>
        {money && <select value={trendKey} onChange={(e) => setTrendKey(e.target.value)} aria-label="Indikator">{TRENDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
        {across.length > 1 && <select value={trendMode} onChange={(e) => setTrendMode(e.target.value)} aria-label="Tampilan"><option value="periode">Dalam periode</option><option value="antar">Antarperiode</option></select>}
      </span></header>
    {pts.length ? <TrendChart height={190} points={pts} money={money} onPick={pickPoint}
      series={[{ key: mk, label: money ? TRENDS.find(([k]) => k === mk)[1] : T.trx, color: C.main, area: true, fmt: money ? rp : angka }]} /> : <p className={styles.empty}>Belum ada data.</p>}
    <p className={styles.note}>{useAcross ? `${across.length} periode ${KINDS.find(([k]) => k === per.kind)[1].toLowerCase()} terakhir · ketuk titik untuk membuka periode itu.` : `Per ${c.grain === 'day' ? 'hari' : 'bulan'} di periode ini · ketuk titik untuk rincian.`}</p>
  </section>;

  // ---------- Panel kanan: Rekap & Analisis ----------
  const goSection = (id) => { if (mobile) { open(['sec', id]); return; } const el = document.getElementById('rk-' + id); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add(styles.flash); setTimeout(() => el.classList.remove(styles.flash), 1200); } };
  const sidePanel = <aside className={`${styles.card} ${styles.side}`} aria-labelledby="rk-side">
    <h2 id="rk-side" className={styles.cardT}>Rekap & Analisis</h2>
    <ul className={styles.sideList}>{sections.map(([id, label, sub]) => <li key={id}><button type="button" onClick={() => goSection(id)}>
      <span className={styles.sideIco}><Ico d={SEC_ICON[id] || I.list} size={20} /></span><span><b>{label}</b><small>{sub}</small></span><NavIcon name="next" size={16} /></button></li>)}</ul>
    <Link className={styles.link} href={'/analisis?p=kustom&dari=' + c.from + '&sampai=' + c.to}>Cari penyebab di Analisis Bisnis <NavIcon name="next" size={14} /></Link>
  </aside>;

  // ---------- Status & arsip ----------
  const statusBar = status && <div className={`${styles.status} ${styles[status.flags.length ? 'warn' : status.main[3]]}`} role="status">
    <span className={styles.badge}>{periodStatus.berjalan ? 'Periode berjalan' : 'Periode selesai'}</span>
    <span className={styles.dataTag}>Rekonsiliasi bank · {status.bank}</span>
    <span className={styles.dataTag}>Tutup buku · {periodStatus?.ditutup ? 'Sudah ditutup' : 'Belum ditutup'}</span>
    <span className={styles.dataTag}>{status.data[1]}</span>
    {periodStatus.hari_jual > 0 && <span className={styles.dataTag}>Tutup harian · {status.hariBelum ? `${status.hariBelum} hari belum ditutup` : 'Selesai'}</span>}
    {!viewing && fin && (status.rekonBelum > 0 || status.hariBelum > 0 || (!per.running && !periodStatus.ditutup && canArea(kos, 'team'))) && <span className={styles.statusLinks}>
      {status.rekonBelum > 0 && <Link href={`/pembukuan?tab=bank&bulan=${ym}`}>Rekonsiliasi bank</Link>}
      {status.hariBelum > 0 && <Link href="/tutup-hari">Tutup harian</Link>}
      {!per.running && !periodStatus.ditutup && canArea(kos, 'team') && <Link href={`/pembukuan?tab=periode&bulan=${ym}`}>Tutup buku</Link>}</span>}
    {status.flags.map(([k, t]) => <span key={k} className={styles.flag}>⚠ {t}{!viewing && <> · {k === 'tanpa_modal'
      ? <button type="button" className={styles.link} onClick={() => open(['hpp'])}>Lihat penjualan</button>
      : <Link href={k === 'menunggu' ? `/pembayaran?bulan=${ym}` : '/penjualan?tab=offline'}>{k === 'menunggu' ? 'Buka verifikasi pembayaran' : 'Tinjau antrean offline'}</Link>}</>}</span>)}
    {R.branch && <span className={styles.flag}>Lokasi: {location} — kas, utang-piutang, persediaan, pajak & modal tetap semua lokasi</span>}
  </div>;
  const waiting = !viewing && d?.jadwal_arsip?.kind === per.kind ? d.jadwal_arsip : null;
  const archiveBar = viewing ? <div className={`notice ${viewing.berubah ? 'warn' : ''}`} role="status">
    <b>Arsip versi {viewing.version}</b> · {KINDS.find(([k]) => k === viewing.kind)?.[1]} {rangeLabel(viewing.from, viewing.to)} · dibuat {wib(viewing.created_at)} WIB ({viewing.source === 'otomatis' ? 'otomatis' : viewing.source === 'koreksi' ? 'otomatis karena data berubah' : 'manual'}).
    {viewing.berubah ? ' Data sumber sudah berubah sejak arsip ini dibuat — angka di bawah adalah angka saat diarsipkan.' : ' Data sumber belum berubah.'}
    <span className={styles.statusLinks}>{viewing.berubah && <button type="button" className="sm" onClick={() => saveArchive(viewing.kind, viewing.from, viewing.to, viewing.branch_id)}>Simpan versi baru</button>}
      {viewing.versi?.length > 1 && <label className={styles.inline}>Versi <select aria-label="Versi arsip" value={viewing.id} onChange={(e) => openArchive(e.target.value, false)}>
        {viewing.versi.map((v) => <option key={v.id} value={v.id}>{`Versi ${v.version}`}</option>)}</select></label>}
      <button type="button" className="sm" onClick={() => { archiveRequest.current += 1; setDetail(null); setArsip(null); }}>Kembali ke data terbaru</button></span>
  </div> : currentArchive ? <div className={`notice ${currentArchive.berubah ? 'warn' : ''}`}>
    Periode ini sudah diarsipkan (versi {currentArchive.version}, {tgl(String(currentArchive.created_at).slice(0, 10))}). {currentArchive.berubah ? 'Data sumber berubah sejak diarsipkan — simpan versi baru agar arsip mengikuti koreksi.' : 'Angka masih sama dengan arsip.'}
    <span className={styles.statusLinks}>{currentArchive.berubah && <button type="button" className="sm" onClick={() => saveArchive(per.kind, per.from, per.to, f.cabang || null)}>Simpan versi baru</button>}
      <button type="button" className="sm" onClick={() => openArchive(currentArchive.id)}>Buka arsip</button></span>
  </div> : waiting && <div className={`notice ${waiting.terlambat ? 'warn' : ''}`} role="status">
    {waiting.terlambat ? 'Arsip otomatis belum tersedia setelah jadwal pagi.' : 'Menunggu arsip otomatis pagi ini.'}
    {waiting.terakhir && <> Arsip otomatis terakhir dibuat {wib(waiting.terakhir)} WIB.</>}
    {waiting.terlambat && <span className={styles.statusLinks}><button type="button" className="sm" onClick={() => saveArchive(per.kind, per.from, per.to, null)}>Arsipkan sekarang</button></span>}
  </div>;
  const previous = viewing?.versi_sebelumnya;
  const changes = previous ? recapChanges(c.ringkas, previous.ringkas) : [];
  const changedMetrics = changes.filter(({ change }) => change !== 0);
  const archiveChanges = changes.length > 0 && <section className={styles.card} aria-labelledby="rk-versi">
    <header className={styles.cardH}><h2 id="rk-versi" className={styles.cardT}>Perubahan dari versi {previous.version}</h2></header>
    {changedMetrics.length > 0
      ? tableRows(['Indikator', 'Sebelumnya', 'Versi ini', 'Selisih'], changedMetrics.map(({ key, label, before, value, change }) => {
        const format = key === 'transaksi' ? angka : rp;
        const detail = key === 'laba_kotor' ? 'laba' : key;
        return { cells: [label, format(before), format(value), signedValue(change, format)], onClick: () => open([detail]) };
      }))
      : <p className={styles.note}>Angka utama tetap sama. Perubahan bisa terjadi pada rincian rekap.</p>}
    {previous.created_at && changedMetrics.some(({ key }) => key !== 'transaksi') && <button type="button" className={styles.link} onClick={() => open(['jurnal_versi'])}>Lihat jurnal yang ditambahkan antarversi</button>}
  </section>;

  // ---------- Isi utama ----------
  const secIds = orderedSections(sections, c.jenis);
  const empty = !p.pendapatan && !p.hpp && !p.transaksi && !p.biaya && !dv.kas.masuk && !dv.kas.keluar && !n(c.aktivitas?.total);

  const page = <div className={styles.page}>
    {header}{!viewing && periodBar}{filterSheet}
    {statusBar}{archiveBar}{archiveChanges}
    {viewing && <p className={styles.note}>Ringkasan mengikuti versi arsip. Rincian transaksi dan jurnal menunjukkan data terkini.</p>}
    {cmpName && <p className={styles.note}>Periode {rangeLabel(c.from, c.to)} dibandingkan dengan {cmpRange} ({cmpName}).</p>}
    {empty && <div className="notice">Belum ada transaksi tercatat di periode ini. Rekap terisi otomatis dari Kasir, Pesanan, Tagihan, Belanja, Kas, dan Pengeluaran.</div>}
    {kpis}
    {mobile ? <>
      <div className={styles.row2}>{trendCard('tr1', 'Tren Pendapatan dan Laba', trendKey, true)}{comp}</div>
      <section className={styles.card} aria-labelledby="rk-grid"><h2 id="rk-grid" className={styles.cardT}>Rincian aktivitas bisnis</h2>
        <div className={styles.tiles}>{secIds.map((id) => <button key={id} type="button" onClick={() => open(['sec', id])}><Ico d={SEC_ICON[id] || I.list} size={22} /><span>{(([t]) => t.charAt(0).toUpperCase() + t.slice(1))([sections.find((s) => s[0] === id)[1].replace('Rekap ', '')])}</span></button>)}</div>
      </section>
      {trendCard('tr2', `Tren ${T.trx}`, 'transaksi', false)}
    </> : <div className={styles.grid}>
      <div className={styles.mainCol}>
        <div className={styles.row3}>{comp}{trendCard('tr1', 'Tren Pendapatan', trendKey, true)}{trendCard('tr2', `Tren ${T.trx === 'Total transaksi' ? 'Transaksi' : T.trx}`, 'transaksi', false)}</div>
        <div className={styles.cards}>{secIds.map((id) => card(id, SEC_TITLE[id] || id, body[id](), { detail: detailKey[id] === undefined ? [id] : detailKey[id], more: detailKey[id] !== null, cls: id === 'aktivitas' ? styles.wide : '' }))}</div>
        {src.heatmap?.length > 0 && <section className={styles.card}><h2 className={styles.cardT}>Peta aktivitas (hari × jam)</h2>
          <Heatmap cells={src.heatmap} days={HARI7} onPick={() => open(['sec', 'aktivitas'])} /><p className={styles.note}>Jumlah peristiwa tercatat (transaksi, pembayaran, stok, persetujuan) per jam, waktu Jakarta.</p></section>}
      </div>
      {sidePanel}
    </div>}
    {sheet()}
    {archiveSheet}
  </div>;
  return page;

  // ---------- Lembar rincian ----------
  function sheet() {
    if (!detail) return null;
    const [key, arg] = detail;
    const close = () => setDetail(null);
    if (key === 'jurnal_versi') {
      return <DetailSheet title="Jurnal yang ditambahkan antarversi" onClose={close}
        sub={`Dicatat setelah versi ${previous.version} hingga versi ${viewing.version}. Koreksi pada catatan yang sudah ada bisa muncul di rincian metrik.`}>
        <JournalLines kosId={kosId} from={c.from} to={c.to} kinds={['pendapatan', 'hpp', 'biaya']} retail={retailLike} branchNote={branchNote}
          createdRange={{ from: previous.created_at, to: viewing.created_at }} />
      </DetailSheet>;
    }
    if (key === 'sec') {
      const id = arg; const meta = sections.find((s) => s[0] === id);
      const dk = detailKey[id] === undefined ? [id] : detailKey[id];
      return <Sheet title={meta?.[1] || 'Rincian'} onClose={close}><div className={styles.sheet}>{body[id]?.()}
        {dk && <button type="button" className="primary" onClick={() => open(dk)}>Rincian & transaksi sumber</button>}
        {id === 'aktivitas' && src.heatmap?.length > 0 && <Heatmap cells={src.heatmap} days={HARI7} />}</div></Sheet>;
    }
    if (key === 'titik') {
      const x = arg;
      return <DetailSheet title={x.label} value={rp(x.v.pendapatan)} onClose={close} formula="Pendapatan, HPP, dan biaya dari jurnal; transaksi dari dokumen selesai (sama dengan angka di atas)."
        rows={[['Pendapatan', rp(x.v.pendapatan)], ['HPP', rp(x.v.hpp)], ['Biaya', rp(x.v.biaya)], ['Laba bersih', rp(x.v.laba)], [T.trx, angka(x.v.transaksi)]]}
        links={[c.jenis === 'retail' && x.from === x.to && [`/penjualan?tanggal=${x.from}`, 'Penjualan hari itu']].filter(Boolean)}>
        <JournalLines kosId={kosId} from={x.from} to={x.to} kinds={['pendapatan', 'hpp', 'biaya']} retail={retailLike} branchNote={branchNote} />
      </DetailSheet>;
    }
    const spec = D2[key]?.(arg);
    if (!spec) return null;
    const [docKind, docKey] = spec.docs || [];
    return <DetailSheet title={spec.title} value={spec.value} formula={spec.formula} rows={spec.rows} links={spec.links?.filter(Boolean)} onClose={close}>
      {spec.table && <>{spec.table.title && <h3 className={styles.sh}>{spec.table.title}</h3>}<div className={styles.tblWrap}><table className={styles.tbl}><thead><tr>{spec.table.cols.map((x, i) => <th key={i} className={i ? styles.num : undefined}>{x}</th>)}</tr></thead>
        <tbody>{spec.table.rows.map((r, i) => <tr key={i}>{r.map((x, j) => <td key={j} className={j ? styles.num : undefined}>{x}</td>)}</tr>)}</tbody></table></div></>}
      {docKind && <Docs kosId={kosId} kind={docKind} k={docKey} R={R} retail={retailLike} extra={spec.extraDocs} />}
      {spec.journal && <><h3 className={styles.sh}>Baris jurnal sumber</h3><JournalLines kosId={kosId} from={c.from} to={c.to} kinds={spec.journal.kinds} sys={spec.journal.sys} retail={retailLike} branchNote={branchNote} /></>}
    </DetailSheet>;
  }

  // ---------- Arsip, ekspor, bagikan ----------
  async function openArchive(id, scroll = true) {
    setArchiveOpen(false);
    const request = ++archiveRequest.current;
    const { data, error } = await supabase.rpc('recap_get', { p_id: id });
    if (request !== archiveRequest.current) return;
    if (error) return toast(errMsg(error));
    setDetail(null); setArsip(data);
    if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function saveArchive(kind, from, to, branch) {
    if (savingArchive.current) return;
    savingArchive.current = true;
    const request = archiveRequest.current;
    try {
      const { data, error } = await supabase.rpc('recap_save', { p_kos: kosId, p_kind: kind, p_from: from, p_to: to, p_branch: branch, p_note: null });
      if (error) return toast(errMsg(error));
      toast(data.baru ? `Arsip versi ${data.version} tersimpan` : 'Data tidak berubah — arsip terakhir tetap dipakai');
      setRefresh((x) => x + 1);
      if (viewing && request === archiveRequest.current) openArchive(data.id, false);
    } finally {
      savingArchive.current = false;
    }
  }
  function ctxExport() {
    return {
      periodLabel: rangeLabel(c.from, c.to), cmpLabel: cmpName, cmpRange, location, hppIncomplete: hppIncomplete || cmpHppIncomplete,
      version: viewing?.version, createdAt: wib(viewing?.created_at || new Date()),
      status: periodStatus?.berjalan ? 'Periode berjalan' : 'Periode selesai',
      reconciliation: status?.bank, closed: periodStatus?.ditutup ? 'Sudah ditutup' : 'Belum ditutup', completeness: status?.data[1],
      flags: [...(status?.flags.map(([, text]) => text) || []), ...(cmpHppIncomplete ? ['HPP dan laba pembanding belum lengkap.'] : []), ...(R.branch ? ['Kas, utang-piutang, persediaan, pajak & modal mencakup semua lokasi.'] : [])],
    };
  }
  function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  async function doExport(fmt) {
    if (ek.habis) return toast(ek.q?.message || 'Kuota ekspor bulan ini sudah habis.');
    const base = `Rekap-bisnis-${c.from}-${c.to}${viewing ? '-arsip-v' + viewing.version : ''}`;
    const context = ctxExport();
    const sheets = exportSheets({ ...src, seri: viewing ? [] : src.seri }, dv, cdv, context);
    try {
      if (fmt === 'xlsx') {
        const { makeXlsx } = await import('@/lib/xlsx');
        const blob = makeXlsx(sheets);
        ek.jalankan('rekap_xlsx', () => download(blob, base + '.xlsx'));
      } else {
        const { makePdf } = await import('@/lib/pdfExport');
        const blob = await makePdf({ title: 'Rekap Bisnis', business: kosName, type: c.jenis, subtitle: `${kosName} · ${context.periodLabel} · ${location}${viewing ? ' · Versi ' + viewing.version : ''}`,
          exported_at: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }), sheets,
          note: `Angka dari jurnal Pembukuan dan transaksi tercatat (${status ? status.main[1].toLowerCase() : ''}). Kas masuk bukan pendapatan; setoran modal & prive mengubah modal, bukan laba.` });
        ek.jalankan('rekap_pdf', () => download(blob, base + '.pdf'));
      }
    } catch (e) { toast(errMsg(e)); }
  }
  async function shareText() {
    const text = [`Rekap Bisnis ${kosName}`, `${rangeLabel(c.from, c.to)} · ${location}${viewing ? ' · Versi ' + viewing.version : ''}${status ? ' · ' + status.main[1] : ''}`,
      `Pendapatan: ${rp(p.pendapatan)}${cp ? ` (${deltaText(p.pendapatan, cp.pendapatan)} vs ${cmpRange})` : ''}`, `HPP: ${rp(p.hpp)} · Beban selain HPP: ${rp(p.biaya)}`,
      `Laba bersih: ${rp(p.laba)} (${pctTxt(p.margin)})`, `${T.trx}: ${angka(p.transaksi)}`, `Kas & bank akhir: ${rp(dv.kas.akhir)}`, ...(status?.flags.map(([, text]) => text) || [])].join('\n');
    try {
      if (navigator.share) await navigator.share({ title: 'Rekap Bisnis', text });
      else { await navigator.clipboard.writeText(text); toast('Ringkasan disalin. Tempel di WhatsApp atau email.'); }
    } catch (e) { if (e?.name !== 'AbortError') toast('Tidak bisa membagikan dari perangkat ini.'); }
  }
}

// Daftar transaksi sumber (recap_docs) → tautan ke bukti/dokumen di modul asal
const DOC_LABEL = { penjualan: 'Transaksi penjualan', retur: 'Retur', kategori: 'Barang di kategori ini', pembelian: 'Transaksi pembelian', pengeluaran: 'Catatan pengeluaran', stok: 'Gerak stok', pesanan: 'Pesanan selesai',
  bayar_sewa: 'Pembayaran sewa', gaji: 'Pembayaran gaji', aset: 'Aset', tagihan_proyek: 'Tagihan proyek', pelanggan: 'Pelanggan' };
function docHref(kind, x, retail) {
  return { penjualan: `/struk/${x.id}`, retur: `/penjualan?tanggal=${x.tanggal}`, kategori: '/barang', pembelian: `/belanja?bulan=${String(x.tanggal).slice(0, 7)}`, pengeluaran: retail ? '/kas' : `/pengeluaran?bulan=${String(x.tanggal).slice(0, 7)}`,
    stok: '/barang', pesanan: `/nota/${x.id}`, bayar_sewa: `/pembayaran?bulan=${String(x.tanggal).slice(0, 7)}`, gaji: '/sdm', aset: '/aset', tagihan_proyek: `/proyek/tagihan/${x.id}`, pelanggan: '/kontak' }[kind] || srcHref(kind, x.id, retail);
}
function Docs({ kosId, kind, k, R, retail, extra }) {
  const [sel, setSel] = useState([kind, k]);
  const [rows, setRows] = useState(null);
  const [limit, setLimit] = useState(15);
  useEffect(() => {
    let on = true; setRows(null);
    supabase.rpc('recap_docs', { p_kos: kosId, p_kind: sel[0], p_from: R.from, p_to: R.to, p_branch: R.branch, p_key: sel[1] || null })
      .then(({ data, error }) => on && setRows(error ? { error } : data));
    return () => { on = false; };
  }, [kosId, sel[0], sel[1], R.from, R.to, R.branch]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = Array.isArray(rows) ? rows.reduce((t, x) => t + n(x.nilai), 0) : 0;
  return <div className={styles.docs}>
    <h3 className={styles.sh}>Transaksi sumber</h3>
    {extra?.length > 0 && <div className={styles.docTabs}>{[[kind + (k ? ':' + k : ''), DOC_LABEL[kind]], ...extra].map(([v, l]) => { const [a, b] = v.split(':');
      return <button key={v} type="button" aria-pressed={sel[0] === a && (sel[1] || '') === (b || '')} onClick={() => { setSel([a, b]); setLimit(15); }}>{l}</button>; })}</div>}
    {!rows ? <Loading rows={3} /> : rows.error ? <p className="notice bad">{errMsg(rows.error)}</p> : rows.length === 0 ? <p className="muted small">Tidak ada transaksi pada periode ini.</p> : <>
      <p className={styles.note}>{rows.length >= 300 ? '300 terbaru' : rows.length.toLocaleString('id-ID')} {DOC_LABEL[sel[0]]?.toLowerCase()} · jumlah {rp(total)}</p>
      <ul className={styles.docList}>{rows.slice(0, limit).map((x, i) => { const href = docHref(sel[0], x, retail);
        const body = <><span><b>{x.nomor || x.pihak || '—'}</b><small>{[x.tanggal && tgl(String(x.tanggal).slice(0, 10)), x.nomor && x.pihak, x.info && (STOCK_KIND[x.info] || SEG[x.info] || x.info), x.qty != null && `qty ${qty(x.qty)}`, x.status && x.status !== 'selesai' && x.status].filter(Boolean).join(' · ')}</small></span>
          <em className={n(x.nilai) < 0 ? styles.neg : undefined}>{rp(x.nilai)}</em></>;
        return <li key={x.id || i}>{href ? <Link href={href}>{body}</Link> : <div>{body}</div>}</li>; })}</ul>
      {rows.length > limit && <button type="button" onClick={() => setLimit(limit + 30)}>Tampilkan lebih banyak</button>}
    </>}
  </div>;
}

// Timeline aktivitas (activity_feed — sudah difilter hak akses tiap peran)
function Activity({ kosId, from, to, total }) {
  const [st, setSt] = useState(null);
  useEffect(() => {
    let on = true; setSt(null);
    supabase.rpc('activity_feed', { p_kos: kosId, p_from: from, p_to: to, p_group: null, p_before: null, p_limit: 12 }).then(({ data, error }) => on && setSt(error ? { error } : data));
    return () => { on = false; };
  }, [kosId, from, to]);
  if (!st) return <Loading rows={3} />;
  if (st.error) return <p className="muted small">Riwayat aktivitas tidak tersedia untuk peran ini.</p>;
  const rows = st.rows || [];
  return <div className={styles.timeline}>
    <p className={styles.note}>{angka(total)} aktivitas tercatat di periode ini{rows.length < n(total) ? ` · ${rows.length} terbaru` : ''}.</p>
    {rows.length === 0 ? <p className="muted small">Belum ada aktivitas.</p> : <ol>{rows.map((r) => { const at = new Date(r.at);
      const jam = at.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }); const day = at.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
      return <li key={r.id}><time>{from === to ? jam : `${tgl(day).replace(/ \d{4}$/, '')} ${jam}`}</time><span><b>{r.label}</b><small>{[r.summary, AREA_NAME[r.area], r.actor].filter(Boolean).join(' · ')}</small></span>{r.amount != null && <em>{rp(r.amount)}</em>}</li>; })}</ol>}
    <Link className={styles.link} href="/aktivitas">Semua riwayat aktivitas <NavIcon name="next" size={14} /></Link>
  </div>;
}

// Arsip rekap: daftar versi + simpan periode yang sudah selesai
function ArchiveSheet({ kosId, per, branch, onClose, onOpen, onSave }) {
  const [rows, setRows] = useState(null);
  const [kind, setKind] = useState('');
  useEffect(() => { let on = true; supabase.rpc('recap_list', { p_kos: kosId, p_kind: kind || null, p_limit: 120 }).then(({ data, error }) => on && setRows(error ? { error } : data)); return () => { on = false; }; }, [kosId, kind]);
  return <Sheet title="Arsip rekap" onClose={onClose}>
    <div className={styles.sheet}>
      <p className={styles.note}>Arsip = salinan angka rekap saat disimpan dan tidak bisa diubah. Mingguan, bulanan, kuartalan, dan tahunan diarsipkan otomatis setiap pagi setelah periodenya selesai. Bila data periode lama dikoreksi, versi baru dibuat — versi lama tetap ada.</p>
      {per.running ? <p className="muted small">{per.label} masih berjalan — arsip bisa dibuat setelah periode selesai.</p>
        : <button type="button" className="primary" onClick={() => { onClose(); onSave(per.kind, per.from, per.end > per.to ? per.to : per.end, branch); }}>Arsipkan {per.label}</button>}
      <label className={styles.inline}>Jenis <select value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Semua</option>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      {!rows ? <Loading rows={3} /> : rows.error ? <p className="notice bad">{errMsg(rows.error)}</p> : rows.length === 0 ? <p className="muted small">Belum ada arsip.</p>
        : <ul className={styles.docList}>{rows.map((r) => <li key={r.id}><button type="button" onClick={() => onOpen(r.id)}>
          <span><b>{KINDS.find(([k]) => k === r.kind)?.[1]} · {rangeLabel(r.from, r.to)}{r.branch_name ? ` · ${r.branch_name}` : ''}</b>
            <small>Versi {r.version}{r.terbaru ? ' (terbaru)' : ''} · {r.source === 'otomatis' ? 'otomatis' : r.source === 'koreksi' ? 'otomatis, data dikoreksi' : 'manual'} · {tgl(String(r.created_at).slice(0, 10))}{r.by ? ' · ' + r.by : ''}</small></span>
          <em>{rp(r.pendapatan)}<small>laba {rp(r.laba)}</small></em></button></li>)}</ul>}
    </div>
  </Sheet>;
}
