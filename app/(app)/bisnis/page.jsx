'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PortfolioContribution from '@/components/PortfolioContribution';
import PageHelp from '@/components/PageHelp';
import Image from 'next/image';
import NavIcon from '@/components/NavIcon';
import { CashFlow, OwnerDetail, PortfolioSummary, Trends, amount, reportOf } from './OwnerViews';
import styles from './bisnis.module.css';
import { Empty, Loading } from '@/components/ui';
import { rp, bulan, today, errMsg, tgl } from '@/lib/format';
import { typeOf, homeOf, ROLES, isDraft, SETUP_STATUS, canArea, roleOf, pathAllowed } from '@/lib/business';
import FiturUpgrade from '@/components/FiturUpgrade';
import { useKuotaEkspor } from '@/lib/ekspor';
import { portfolioReport } from '@/lib/portfolioReport';
import { portfolioBasisKey } from '@/lib/portfolioBasis';
import { makePdf } from '@/lib/pdfExport';
import { makeXlsx } from '@/lib/xlsx';
import { download } from '@/lib/zip';

const BASIS = { kas: 'Basis kas · uang diterima', penjualan: 'Basis akrual penjualan · termasuk kasbon', 'pesanan selesai': 'Basis pesanan selesai · termasuk belum lunas', 'status catatan': 'Basis status catatan · Business Builder' };
const TABS = [['summary', 'Ringkasan', '/laporan'], ['business', 'Per Bisnis', '/bisnis'], ['trend', 'Tren', '/analisis'], ['cash', 'Arus Kas', 'swap'], ['reports', 'Laporan', '/resep']];
const ACT = { aktifkan_modul: 'mengaktifkan modul', nonaktifkan_modul: 'menonaktifkan modul', minta_persetujuan: 'meminta persetujuan', tolak_persetujuan: 'menolak permintaan',
  konfigurasi_awal: 'konfigurasi awal', terbitkan_halaman: 'menerbitkan halaman bisnis', sembunyikan_halaman: 'menyembunyikan halaman bisnis', ubah_halaman: 'mengubah halaman bisnis', rekomendasi_diterima: 'menerapkan saran', rekomendasi_diabaikan: 'mengabaikan saran', ekspor_data: 'mengunduh semua data', tutup_bisnis: 'menutup bisnis', buka_bisnis: 'membuka kembali bisnis', lokasi_karyawan: 'menetapkan lokasi kerja karyawan', jurnal_manual: 'membuat jurnal manual', tutup_periode: 'menutup periode buku', buka_periode: 'membuka kembali periode buku', arsip_kontak: 'mengarsipkan kontak', hapus_kontak: 'menghapus kontak', pulihkan_kontak: 'memulihkan kontak', ubah_profil: 'mengubah profil', tambah_cabang: 'menambah cabang/gudang', ubah_cabang: 'mengubah cabang/gudang', ubah_layanan: 'mengubah layanan/harga jasa', ubah_tahap_jasa: 'mengubah tahap proses', ubah_tarif_meteran: 'mengubah tarif meteran' };
const jam = (ts) => new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
const shift = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const moneyText = (value) => amount(value) == null ? '—' : rp(value);

// Owner Overview: ringkasan lintas bisnis dengan label kelengkapan & basis, per badan usaha, dan tautan ke sumber angka
export default function Bisnis() {
  const { kos, kosId, pickKos, ver, list } = useKos();
  const router = useRouter();
  const [ym, setYm] = useState(today().slice(0, 7));
  const [tab, setTab] = useState('summary');
  const [detail, setDetail] = useState(null);
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let active = true;
    setD(null); setErr(null); setDetail(null);
    supabase.rpc('owner_overview2', { p_month: ym + '-01' }).then(({ data, error }) => {
      if (!active) return;
      if (error) setErr(errMsg(error));
      else setD(data);
    });
    return () => { active = false; };
  }, [ver, ym]);
  // Gabungan bisnis (Fase 5): pilihan akun disimpan di server; angka tetap dari owner_overview2 (sumber yang sama)
  const [inc, setInc] = useState(null);
  const [pro, setPro] = useState([]);   // bisnis akun ini yang Paket Pro (gabungan = Pro, diputuskan server)
  const [prev, setPrev] = useState(null);
  const [pick, setPick] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    supabase.rpc('portfolio_get').then(({ data, error }) => { setInc(error ? [] : data?.include || []); setPro(error ? [] : data?.pro || []); });
  }, [ver]);
  // kuota ekspor gabungan dihitung pada bisnis Pro pertama di gabungan
  const exKos = (inc || []).find((id) => pro.includes(id) && list?.some((b) => b.id === id && roleOf(b) === 'pemilik' && !isDraft(b) && !b.closed_at && !b.suspended_at)) || null;
  const ek = useKuotaEkspor(exKos);
  useEffect(() => {
    let active = true;
    setPrev(null);
    supabase.rpc('owner_overview2', { p_month: shift(ym, -1) + '-01' }).then(({ data, error }) => {
      if (active) setPrev(error ? null : data);
    });
    return () => { active = false; };
  }, [ver, ym]);
  if (err) return <div className="notice bad">{/owner_overview2/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d || d.from !== ym + '-01') return <Loading />;

  const owned = (list || []).filter((business) => roleOf(business) === 'pemilik');
  const ownedById = new Map(owned.map((business) => [business.id, business]));
  const businesses = d.businesses.filter((business) => ownedById.has(business.id) && business.role === 'pemilik');
  const go = (b, href, month = ym) => {
    const business = ownedById.get(b.id);
    if (!business) return;
    const dest = href || homeOf(business);
    const [base] = dest.split('?');
    const reportRoute = ['/pembukuan', '/laporan-toko', '/laporan-jasa', '/laporan'].includes(base);
    const url = reportRoute ? dest + (dest.includes('?') ? '&' : '?') + 'bulan=' + month + (dest.includes('tab=arus-kas') ? '#arus-kas' : '') : dest;
    pickKos(b.id);
    router.push(url);
  };
  const fin = businesses.filter((b) => b.access && !isDraft(ownedById.get(b.id)));
  const att = fin.flatMap((b) => (b.attention || []).map((a) => ({ ...a, b })));
  const money = fin.filter((b) => amount(b.revenue) != null);
  const groups = new Map();
  for (const business of money) {
    const basis = business.basis || '';
    const key = portfolioBasisKey(basis, business.id);
    if (!groups.has(key)) groups.set(key, { basis, key, rows: [] });
    groups.get(key).rows.push(business);
  }
  const isNow = ym === today().slice(0, 7);
  const priorMonth = shift(ym, -1);
  const sel = money.filter((b) => (inc || []).includes(b.id));
  const proSet = new Set(pro);
  const anyPro = money.some((b) => proSet.has(b.id));
  const gabOk = sel.some((b) => proSet.has(b.id));
  const scopeName = (business) => (BASIS[business.basis] || business.basis || 'Basis belum tercatat') + (business.basis === 'status catatan' ? ' · ' + business.name : '');
  const reportData = () => portfolioReport({
    selected: sel, previous: prev?.from === shift(ym, -1) + '-01' ? prev.businesses : [], from: d.from, to: d.to, sourceAt: d.generated_at,
    priorLabel: bulan(shift(ym, -1)), basisLabels: BASIS, typeLabel: (business) => typeOf(business).name,
  });
  const exportGab = async (format) => {
    if (!exKos || !gabOk || !sel.some((b) => b.id === exKos) || sel.length < 2 || exporting) return;
    setExporting(true); setNote(null);
    try {
      const data = reportData();
      const file = format === 'pdf' ? await makePdf(data) : makeXlsx(data.sheets);
      const { error } = await supabase.rpc('export_take', { p_kos: exKos, p_kind: 'gabungan_bisnis_' + format });
      if (error) { setNote(errMsg(error)); return; }
      download(file, `PRASARA-portofolio-${ym}.${format}`);
    } catch (error) { setNote(errMsg(error)); }
    finally { setExporting(false); ek.muat(); }
  };
  const saveInc = async (ids) => {
    setBusy(true); setNote(null);
    const { data, error } = await supabase.rpc('portfolio_set', { p_include: ids });
    setBusy(false);
    if (error) return setNote(errMsg(error));
    setInc(data?.include || []); setPro(data?.pro || pro); setPick(null);
  };

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1>Ringkasan Pemilik</h1><p>Pantau kinerja semua bisnis Anda dalam satu tempat.</p>
          <PageHelp page="bisnis" label={<><NavIcon name="/buku-besar" size={17} />Panduan Pemilik<NavIcon name="next" size={14} /></>} />
        </div>
        <span className={styles.heroArt}><Image src="/pemilik-ringkasan.webp" alt="" fill unoptimized priority /></span>
      </header>
      <nav className={styles.tabs} aria-label="Tampilan Ringkasan Pemilik">{TABS.map(([key, title, icon]) =>
        <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}><NavIcon name={icon} /><span>{title}</span></button>
      )}</nav>
      <div className={styles.toolbar}>
        <Link href="/mulai" className={styles.add}><NavIcon name="plus" size={17} />Tambah bisnis</Link>
        <div className={styles.period}>
          <button onClick={() => setYm(shift(ym, -1))} aria-label="Bulan sebelumnya"><NavIcon name="prev" size={17} /></button>
          <label><NavIcon name="calendar" size={18} /><b>{bulan(ym)}</b><input aria-label="Bulan ringkasan pemilik" type="month" value={ym} max={today().slice(0, 7)}
            onChange={(event) => { const value = event.target.value; if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value) && value <= today().slice(0, 7)) setYm(value); }} /></label>
          <button onClick={() => setYm(shift(ym, 1))} disabled={isNow} aria-label="Bulan berikutnya"><NavIcon name="next" size={17} /></button>
        </div>
        <span className={styles.timestamp}>Diperbarui {jam(d.generated_at)} · {tgl(d.from)} – {tgl(d.to)}</span>
      </div>
      {businesses.length === 0 && <Empty title="Belum ada bisnis aktif yang dimiliki" />}
      {tab === 'summary' && <>
        <PortfolioSummary groups={[...groups.values()]} basisLabels={BASIS} onDetail={setDetail} />
        <PortfolioContribution businesses={money} basisLabels={BASIS} period={bulan(ym)}
          onOpen={(business, metric) => setDetail({ title: metric === 'profit' ? 'Laba operasional' : 'Pendapatan', rows: [{ business, value: moneyText(business[metric]), href: reportOf(business) }] })} />
      </>}
      {tab === 'trend' && <Trends groups={[...groups.values()]} previous={prev?.from === priorMonth + '-01' ? prev.businesses : []}
        basisLabels={BASIS} period={bulan(ym)} prior={bulan(priorMonth)} onDetail={setDetail} />}
      {tab === 'cash' && <CashFlow businesses={fin.filter((b) => pathAllowed(ownedById.get(b.id), '/pembukuan'))} from={d.from} to={d.to} go={go} onDetail={setDetail} />}
      {tab === 'reports' && financesList(fin, go)}
      {detail && <OwnerDetail detail={detail} basisLabels={BASIS} period={bulan(ym)} go={(business, href, previous) => go(business, href, previous ? priorMonth : ym)} onClose={() => setDetail(null)} />}
      {tab === 'summary' && att.length > 0 && isNow && (
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

      {tab === 'business' && <div className={styles.cards}>{businesses.map((b) => {
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
        const lap = reportOf(b);
        const Row = ({ l, v, href, tone, hint }) => (
          <button className={styles.row} onClick={() => setDetail({ title: l, rows: [{ business: b, value: v, href, note: hint || BASIS[b.basis] }] })}>
            <span>{l}{hint && <small>{hint}</small>}</span>
            <b style={tone ? { color: `var(--${tone})` } : undefined}>{v}</b><NavIcon name="next" size={15} />
          </button>
        );
        return (
          <section className="panel" key={b.id} style={b.id === kosId ? { borderColor: 'var(--gold)' } : undefined}>
            <div className="row between">
              <div className="stack" style={{ gap: 0 }}><b>{t.icon} {b.name}</b><span className="small muted">{t.name}{b.legal_entity ? ` · ${b.legal_entity.name}` : ''} · {b.plan_name || b.plan}</span></div>
              <button className={'sm ' + styles.health} onClick={() => setDetail({ title: 'Status data dan perhatian', note: [b.complete ? 'Data periode ditandai lengkap oleh laporan operasional.' : 'Data periode memerlukan pemeriksaan.', ...(b.flags || [])].join(' '),
                rows: (isNow ? b.attention || [] : []).map((item) => ({ business: b, value: 'Buka', href: item.href, note: item.text })) })}>{b.complete ? 'Data lengkap' : 'Perlu diperiksa'}</button>
            </div>
            <div className="list">
              <Row l="Pendapatan" v={moneyText(b.revenue)} href={lap} hint={retail ? 'penjualan bersih dan pemasukan lain' : jasa ? 'pesanan diserahkan' : kustom ? 'uang masuk catatan' : 'uang diterima'} />
              {retail && <Row l="Modal barang terjual" v={moneyText(b.cogs)} href="/laporan-toko" />}
              {jasa && <Row l="Pemakaian bahan" v={moneyText(b.cogs)} href="/laporan-jasa" />}
              <Row l="Biaya operasional" v={moneyText(b.ops)} href={dagang ? '/kas' : '/pengeluaran'} />
              <Row l="Laba operasional" v={moneyText(b.profit)} href={lap} tone={Number(b.profit) < 0 ? 'bad' : undefined} />
              {!kustom && <Row l={retail ? 'Kasbon pelanggan' : jasa ? 'Belum lunas pelanggan' : 'Tunggakan sewa'} v={moneyText(b.receivables)} href={retail ? '/kas' : jasa ? '/pesanan' : '/tagihan'} tone={Number(b.receivables) > 0 ? 'bad' : undefined} hint="saat ini" />}
              {dagang && !kustom && <Row l="Utang ke supplier" v={moneyText(b.payables)} href="/kas" hint="saat ini" />}
              {dagang && <Row l="Kas / bank" v={`${moneyText(b.cash)} / ${moneyText(b.bank)}`} href="/kas" hint="saat ini" />}
              {!dagang && <Row l="Kamar terisi" v={`${b.occupied}/${b.rooms}`} href="/kamar" />}
            </div>
            {(b.flags || []).length > 0 && <div className="notice">{b.flags.map((f) => <div key={f} className="small">• {f}</div>)}</div>}
            <span className="small muted">{BASIS[b.basis] || 'Basis belum tercatat'}.{b.last_activity ? ` Transaksi terakhir ${tgl(String(b.last_activity).slice(0, 10))}.` : ' Belum ada transaksi.'}</span>
            <button className="sm" onClick={() => go(b)}>Buka {b.name}</button>
          </section>
        );
      })}</div>}

      {tab === 'reports' && money.length > 1 && (
        <>
          <h3 style={{ marginTop: 8 }}>Laporan portofolio</h3>
          <section className="panel">
            {note && <div className="notice bad">{note}</div>}
            {inc === null ? <Loading /> : pick ? (
              <>
                <span className="small">Pilih minimal dua bisnis untuk laporan portofolio. Angka akan dikelompokkan menurut basis pencatatan.</span>
                <div className="list">{money.map((b) => (
                  <label key={b.id} className="li" style={{ cursor: 'pointer', borderTop: '1px solid var(--line)' }}>
                    <span className="row" style={{ flexWrap: 'nowrap', gap: 10 }}>
                      <input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={pick.includes(b.id)} onChange={(e) => setPick(e.target.checked ? [...pick, b.id] : pick.filter((x) => x !== b.id))} />
                      <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                        <span className="small" style={{ overflowWrap: 'anywhere' }}>{typeOf(b).icon} {b.name}{proSet.has(b.id) && <span className="chip good" style={{ marginLeft: 6 }}>Pro</span>}</span>
                        <span className="small muted" style={{ overflowWrap: 'anywhere' }}>{b.legal_entity?.name || 'Badan usaha belum diatur'}</span>
                      </span>
                    </span>
                  </label>
                ))}</div>
                {pick.length === 1 && <span className="small muted">Pilih satu bisnis lagi untuk menggabungkan.</span>}
                {pick.length > 1 && !pick.some((id) => proSet.has(id)) && <span className="small" style={{ color: 'var(--bad)' }}>Minimal satu bisnis yang digabung harus berpaket Pro.</span>}
                <div className="row">
                  <button className="primary" disabled={busy || pick.length === 1 || (pick.length === 0 && !(inc || []).length) || (pick.length > 1 && !pick.some((id) => proSet.has(id)))} onClick={() => saveInc(pick)}>{busy ? 'Menyimpan…' : pick.length ? 'Simpan gabungan' : 'Hapus gabungan'}</button>
                  <button className="sm" disabled={busy} onClick={() => setPick(null)}>Batal</button>
                </div>
              </>
            ) : !anyPro || (sel.length >= 2 && !gabOk) ? (
              <>
                <FiturUpgrade kosId={kosId} owner={canArea(kos, 'team')} plan="pro" event="PORTFOLIO.CONSOLIDATION.REQUESTED" title="Gabungan bisnis tersedia di Paket Pro"
                  text={sel.length >= 2 ? 'Pilih minimal satu usaha berpaket Pro untuk mengunduh laporan portofolio.' : 'Buat laporan portofolio berdasarkan basis pencatatan, bandingkan performa dengan bulan lalu, dan unduh sebagai Excel atau PDF. Minimal satu bisnis terpilih berpaket Pro.'} />
                {(inc || []).length > 0 && <div className="row"><button className="sm" disabled={busy} onClick={() => saveInc([])}>Hapus pilihan gabungan</button></div>}
              </>
            ) : sel.length >= 2 ? (
              <>
                <div className={styles.heading}>
                  <div><b>{sel.length} bisnis dipilih</b><p className="small muted">{sel.map((b) => b.name).join(' · ')}</p></div>
                </div>
                <p className="small muted">Laporan portofolio mengelompokkan nilai per basis pencatatan. Transaksi antarbisnis belum dieliminasi.</p>
                <div className="row">
                  <button className="sm" onClick={() => setPick(sel.map((business) => business.id))}>Ubah pilihan</button>
                  <button className="sm" disabled={ek.habis || !exKos || exporting} onClick={() => exportGab('pdf')}>Unduh PDF</button>
                  <button className="sm" disabled={ek.habis || !exKos || exporting} onClick={() => exportGab('xlsx')}>Unduh Excel</button>
                  {exporting && <span className="small muted" role="status">Menyiapkan laporan…</span>}
                </div>
                <details className="small">
                  <summary>Pratinjau ringkasan laporan</summary>
                  <div className="list">{reportData().sheets[0].rows.map(([basis, count, revenue, profit, completeness]) => (
                    <button className={styles.row} key={basis} onClick={() => setDetail({ title: basis, rows: sel.filter((business) => scopeName(business) === basis).map((business) => ({ business, value: moneyText(business.revenue), href: reportOf(business) })) })}>
                      <span>{basis}<small>{count} bisnis · {completeness}</small></span><span>Pendapatan {moneyText(revenue)}<small>Laba {moneyText(profit)}</small></span><NavIcon name="next" size={15} />
                    </button>
                  ))}</div>
                </details>
                {ek.info && <span className="small muted">{ek.info} (dihitung di {money.find((b) => b.id === exKos)?.name})</span>}
              </>
            ) : (
              <>
                <span className="small muted">{sel.length === 1 ? 'Baru satu bisnis yang dipilih. Pilih minimal dua untuk menggabungkan.' : 'Belum ada gabungan. Angka tiap bisnis di atas sudah lengkap dan terpisah. Gabungan hanya dibuat bila Anda memilihnya.'}</span>
                <div className="row"><button className="sm" onClick={() => setPick(sel.map((business) => business.id))}>{sel.length ? 'Ubah pilihan' : 'Pilih bisnis yang digabung'}</button></div>
              </>
            )}
          </section>
        </>
      )}

      {tab === 'summary' && d.activity?.some((a) => ownedById.has(a.kos_id)) && (
        <section className="panel">
          <h3>Aktivitas konfigurasi terbaru</h3>
          <div className="list">{d.activity.filter((a) => ownedById.has(a.kos_id)).map((a, i) => (
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

function financesList(businesses, go) {
  return <section className={styles.panel}><h2>Laporan per bisnis</h2>
    {businesses.length ? businesses.map((business) => <button className={styles.row} key={business.id} onClick={() => go(business, reportOf(business))}>
      <span><b>{business.name}</b><small>{typeOf(business).name}</small></span><span>Lihat laporan</span><NavIcon name="next" size={15} />
    </button>) : <p className="small muted">Belum ada laporan bisnis aktif.</p>}
  </section>;
}
