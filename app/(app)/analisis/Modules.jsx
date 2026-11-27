'use client';
// Modul Analisis Bisnis (Master Blueprint BI V2.0) — lapisan presentasi di atas mesin yang SUDAH ada:
// biz_financials (laba rugi bertingkat, neraca, riwayat), acct_cashflow, tax_report, budget_report, asset_list,
// laporan bulanan berversi & simulasi/valuasi di Pembukuan, portofolio /bisnis. Tidak ada perhitungan uang di sini
// selain lib/finRatios.js (rumus tertulis). Modul yang belum dibangun ditandai "Dalam rencana" (lihat docs/AUDIT_BI_MASTER_V2.md).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import NavIcon from '@/components/NavIcon';
import FiturUpgrade from '@/components/FiturUpgrade';
import { PlanSummary, useBudgetSummary, STATUS as BUDGET_STATUS } from '@/components/AnggaranRencana';
import { Empty, Loading } from '@/components/ui';
import { BLN, errMsg, rp, tgl } from '@/lib/format';
import { LINE_CLASSES, balanceLines, balanceSheet, equityChanges, fmtRatio, incomeLines, incomeStatement, ratios } from '@/lib/finRatios';
import { monthName } from '@/lib/bizIntel';
import PajakPPh from '@/components/PajakPPh';
import ValuationCard from './Valuation';
import { C, TrendChart } from './Charts';
import { DetailSheet, JournalLines } from './Details';
import styles from './analisis.module.css';

const n = (v) => Number(v || 0);
// Angka tabel laporan: tanpa awalan Rp (judul kolom bertanda Rp) agar muat di HP
const num = (v) => (n(v) < 0 ? '−' : '') + Math.abs(Math.round(n(v))).toLocaleString('id-ID');
const chg = (a, b) => (b == null || n(b) === 0 ? null : ((n(a) - n(b)) / Math.abs(n(b))) * 100);
const pctTxt = (v) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`);

function useRpc(name, args, deps) {
  const [st, setSt] = useState(null);
  useEffect(() => {
    let on = true; setSt(null);
    supabase.rpc(name, args).then(({ data, error }) => on && setSt(error ? { error } : { data }), (error) => on && setSt({ error }));
    return () => { on = false; };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return st;
}
const Fail = ({ st }) => <p className="notice bad" role="alert">{/biz_financials|budget_report|tax_report/.test(st.error?.message || '') && /function|does not exist/.test(st.error?.message || '') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : errMsg(st.error)}</p>;
const Card = ({ title, icon, right, children }) => <section className={styles.card}>
  <div className={styles.cardH}><h2 className={styles.cardT}>{icon && <span className={styles.tIco}><NavIcon name={icon} size={20} /></span>}{title}</h2>{right}</div>{children}</section>;
const Go = ({ href, children }) => <Link className={styles.link} href={href}>{children} <NavIcon name="next" size={14} /></Link>;

// ---------- Laporan keuangan: laba rugi bertingkat, neraca, rasio, riwayat EBITDA ----------
export function FinancialsModule({ kosId, range, cmp, retail, owner, ver }) {
  const st = useRpc('biz_financials', { p_kos: kosId, p_from: range.from, p_to: range.to, p_cmp_from: cmp?.from || null, p_cmp_to: cmp?.to || null }, [kosId, range.from, range.to, cmp?.from, cmp?.to, ver]);
  const [sheet, setSheet] = useState(null);
  if (!st) return <Loading rows={6} />;
  if (st.error) return <Fail st={st} />;
  const f = st.data;
  const s = incomeStatement(f.laba_rugi.cur); const s0 = f.laba_rugi.cmp ? incomeStatement(f.laba_rugi.cmp) : null;
  const L0 = s0 ? Object.fromEntries(incomeLines(s0).map((l) => [l[0], l[2]])) : {};
  const accOf = (key) => (f.laba_rugi.akun || []).filter((a) => (LINE_CLASSES[key] || []).includes(a.cls));
  const b1 = balanceSheet(f.neraca?.close, f.neraca?.pinjaman_close); const b0 = balanceSheet(f.neraca?.open, f.neraca?.pinjaman_open);
  const rs = f.lengkap ? ratios(f) : [];
  const hist = (f.bulanan || []).map((m) => { const x = incomeStatement(m.v); return { mulai: m.mulai, label: monthName(m.mulai.slice(0, 7)), short: BLN[+m.mulai.slice(5, 7) - 1], net: x.net, ebitda: x.ebitda, netIncome: x.netIncome }; });
  const groups = [...new Set(rs.map((r) => r.group))];
  const eqc = f.lengkap ? equityChanges(f) : null;
  return <div className={styles.modGrid}>
    <Card title="Laba Rugi" icon="/laporan" right={<Go href={`/pembukuan?tab=laporan&bulan=${range.to.slice(0, 7)}`}>Pembukuan</Go>}>
      <p className={styles.note}>{tgl(f.from)} – {tgl(f.to)}{s0 ? ` · pembanding ${tgl(f.cmp_from)} – ${tgl(f.cmp_to)}` : ''} · basis jurnal Pembukuan</p>
      <table className={styles.stmt}><thead><tr><th>Pos (Rp)</th><th>Periode ini</th>{s0 && <><th>Pembanding</th><th className={styles.dcol}>Δ</th></>}</tr></thead>
        <tbody>{incomeLines(s).map(([key, label, v, kind]) => <tr key={key} className={kind === 'sub' ? styles.sub : undefined}>
          <th scope="row"><button type="button" className={styles.linkBtn} onClick={() => setSheet({ key, label, v, prev: L0[key] })}>{label}</button></th>
          <td className={v < 0 ? styles.neg : undefined}>{num(v)}</td>{s0 && <><td>{num(L0[key])}</td><td className={styles.dcol}>{pctTxt(kind === 'neg' ? chg(-v, -L0[key]) : chg(v, L0[key]))}</td></>}</tr>)}</tbody></table>
      <p className={styles.note}>Beban bunga dari pembayaran pinjaman di menu Kas. Pajak penghasilan = PPh final UMKM bila profil pajak diatur di tab Pajak.</p>
    </Card>
    {!f.lengkap ? <FiturUpgrade kosId={kosId} owner={owner} event="REPORT.ADVANCED_REQUESTED" title="Neraca & rasio keuangan tersedia mulai Paket Bisnis" text="Neraca per tanggal dengan cek seimbang, rasio likuiditas, solvabilitas, efisiensi, dan riwayat EBITDA 12 bulan." /> : <>
      <Card title="Neraca" icon="/neraca-saldo" right={<Go href={`/pembukuan?tab=saldo&bulan=${range.to.slice(0, 7)}`}>Neraca saldo</Go>}>
        <p className={styles.note}>Per {tgl(f.to)} · pembanding awal periode ({tgl(f.from)}) · <b className={f.neraca.seimbang ? styles.good : styles.bad}>{f.neraca.seimbang ? '✓ Seimbang' : '✗ Tidak seimbang — periksa jurnal'}</b></p>
        <table className={styles.stmt}><thead><tr><th>Pos (Rp)</th><th>Akhir</th><th>Awal</th></tr></thead>
          <tbody>{balanceLines(b1).map(([key, label, v, kind], i) => kind === 'head' ? <tr key={key} className={styles.head}><th colSpan={3}>{label}</th></tr>
            : <tr key={key} className={kind === 'sub' ? styles.sub : undefined}><th scope="row">{label}</th><td>{num(v)}</td><td>{num(balanceLines(b0)[i][2])}</td></tr>)}</tbody></table>
        <p className={styles.note}>Pinjaman jatuh tempo ≤ 12 bulan dihitung dari daftar pinjaman (jatuh tempo, cicilan, bunga). {b1.unscheduled > 0 ? `${rp(b1.unscheduled)} pinjaman belum terdaftar atau belum punya jadwal/jatuh tempo sehingga dianggap jangka panjang — lengkapi di Kas › Pinjaman.` : ''}</p>
      </Card>
      {eqc && <Card title="Perubahan Ekuitas" icon="/neraca-saldo" right={<Go href={`/pembukuan?tab=saldo&bulan=${range.to.slice(0, 7)}`}>Neraca saldo</Go>}>
        <p className={styles.note}>{tgl(f.from)} – {tgl(f.to)} · ekuitas = aset − kewajiban · <b className={eqc.cocok ? styles.good : styles.bad}>{eqc.cocok ? '✓ Cocok dengan neraca' : '✗ Tidak cocok dengan neraca — periksa jurnal'}</b></p>
        <table className={styles.stmt}><thead><tr><th>Mutasi (Rp)</th><th>Jumlah</th></tr></thead>
          <tbody>
            <tr className={styles.sub}><th scope="row">Ekuitas awal periode</th><td>{num(eqc.open)}</td></tr>
            {eqc.lines.map(([key, label, v]) => <tr key={key}><th scope="row">{label}</th><td className={v < 0 ? styles.neg : undefined}>{v > 0 ? '+' : ''}{num(v)}</td></tr>)}
            <tr className={styles.sub}><th scope="row">Ekuitas akhir periode</th><td>{num(eqc.close)}</td></tr>
          </tbody></table>
        <table className={styles.stmt}><thead><tr><th>Komponen (Rp)</th><th>Awal</th><th>Akhir</th></tr></thead>
          <tbody>{eqc.parts.map((p) => <tr key={p.key}><th scope="row">{p.label}</th><td>{num(p.open)}</td><td>{num(p.close)}</td></tr>)}</tbody></table>
        <p className={styles.note}>Setoran modal & prive dicatat di Kas (kos: Pengeluaran › Diambil pemilik & lainnya); saldo awal berasal dari stok awal, aset yang sudah dimiliki, dan saldo pembukaan. Laba ditahan = akumulasi laba rugi sejak awal pembukuan (belum ada jurnal penutup).</p>
      </Card>}
      <Card title="Rasio Keuangan" icon="/analisis">
        <p className={styles.note}>Rasio tidak dihitung bila komponennya belum tersedia. Ketuk rasio untuk rumus & angka sumbernya.</p>
        {groups.map((g) => <div key={g} className={styles.ratioGroup}><h3>{g}</h3>
          {rs.filter((r) => r.group === g).map((r) => <button key={r.key} type="button" className={styles.ratio} onClick={() => setSheet({ ratio: r })}>
            <span>{r.label}</span><b className={r.value == null ? styles.muted : undefined}>{fmtRatio(r, rp)}</b></button>)}</div>)}
      </Card>
      <Card title="Riwayat 12 Bulan" icon="/laporan-toko">
        <TrendChart points={hist} series={[{ key: 'net', label: 'Pendapatan bersih', color: C.main, area: true, fmt: rp }, { key: 'ebitda', label: 'EBITDA', color: C.amber, fmt: rp }, { key: 'netIncome', label: 'Laba bersih', color: C.mid, fmt: rp }]}
          onPick={(i) => setSheet({ month: hist[i] })} />
        <table className={styles.stmt}><thead><tr><th>Bulan (Rp)</th><th>Pendapatan</th><th>EBITDA</th><th>Laba</th></tr></thead>
          <tbody>{[...hist].reverse().map((h) => <tr key={h.mulai}><th scope="row">{h.short} {h.mulai.slice(2, 4)}</th><td>{num(h.net)}</td><td>{num(h.ebitda)}</td><td className={h.netIncome < 0 ? styles.neg : undefined}>{num(h.netIncome)}</td></tr>)}</tbody></table>
      </Card>
    </>}
    {sheet?.key && <DetailSheet title={sheet.label} value={rp(sheet.v)} onClose={() => setSheet(null)}
      rows={[sheet.prev != null && ['Pembanding', rp(sheet.prev)], ...accOf(sheet.key).map((a) => [`${a.code} ${a.name}`, rp(a.cur)])]}
      formula={sheet.key === 'ebitda' ? 'Laba kotor − beban operasional (tanpa penyusutan & beban non-operasional).' : sheet.key === 'ebit' ? 'EBITDA − penyusutan.' : 'Jumlah mutasi akun-akun di bawah pada periode ini.'}
      links={[[`/pembukuan?tab=buku&bulan=${range.to.slice(0, 7)}`, 'Buku besar']]}>
      {LINE_CLASSES[sheet.key] && <JournalLines kosId={kosId} from={range.from} to={range.to} kinds={['pendapatan', 'hpp', 'biaya']} accounts={accOf(sheet.key).map((a) => a.name)} retail={retail} />}
    </DetailSheet>}
    {sheet?.ratio && <DetailSheet title={sheet.ratio.label} value={fmtRatio(sheet.ratio, rp)} onClose={() => setSheet(null)} formula={sheet.ratio.formula}
      sub={sheet.ratio.value == null ? sheet.ratio.reason : sheet.ratio.def} rows={[['Kelompok', sheet.ratio.group], sheet.ratio.interp && ['Cara membaca', sheet.ratio.interp],
        ['Periode', `${tgl(f.from)} – ${tgl(f.to)} (${f.hari} hari)`], ['Pendapatan bersih', rp(s.net)], ['Laba bersih', rp(s.netIncome)], ['Total aset akhir', rp(b1.assets)],
        ['Kewajiban lancar akhir', rp(b1.cl)], ['Ekuitas akhir', rp(b1.equity)]]} links={[[`/pembukuan?tab=saldo&bulan=${range.to.slice(0, 7)}`, 'Neraca saldo']]} />}
    {sheet?.month && <DetailSheet title={sheet.month.label} onClose={() => setSheet(null)} rows={[['Pendapatan bersih', rp(sheet.month.net)], ['EBITDA', rp(sheet.month.ebitda)], ['Laba bersih', rp(sheet.month.netIncome)]]}
      links={[[`/pembukuan?tab=laporan&bulan=${sheet.month.mulai.slice(0, 7)}`, 'Laba rugi bulan ini'], [`/pembukuan?tab=jurnal&bulan=${sheet.month.mulai.slice(0, 7)}`, 'Jurnal bulan ini']]}>
      <JournalLines kosId={kosId} from={sheet.month.mulai} to={new Date(Date.UTC(+sheet.month.mulai.slice(0, 4), +sheet.month.mulai.slice(5, 7), 0)).toISOString().slice(0, 10)} kinds={['pendapatan', 'hpp', 'biaya']} retail={retail} />
    </DetailSheet>}
  </div>;
}

// ---------- Arus kas per aktivitas ----------
const GROUP_LABEL = { operasi: 'Aktivitas operasi', investasi: 'Aktivitas investasi', pendanaan: 'Aktivitas pendanaan', saldo_awal: 'Pencatatan saldo awal' };
export function CashModule({ kosId, range, ver, jenis, owner }) {
  const st = useRpc('acct_cashflow', { p_kos: kosId, p_from: range.from, p_to: range.to }, [kosId, range.from, range.to, ver]);
  if (!st) return <Loading rows={5} />;
  if (st.error) return <Fail st={st} />;
  const d = st.data; const g = Object.fromEntries((d.kelompok || []).map((x) => [x.kelompok, x]));
  const fcf = d.kelompok ? n(g.operasi?.bersih) + n(g.investasi?.bersih) : null;
  return <div className={styles.modGrid}>
    <Card title="Arus Kas per Aktivitas" icon="/kas" right={<Go href={`/pembukuan?tab=arus-kas&bulan=${range.to.slice(0, 7)}`}>Arus kas lengkap</Go>}>
      <p className={styles.note}>{tgl(d.from)} – {tgl(d.to)} · metode langsung dari akun Kas & Bank · {d.cocok ? '✓ cocok dengan perubahan saldo' : '✗ tidak cocok — periksa jurnal'}</p>
      <dl className={styles.kvs}>
        <div><dt>Saldo awal</dt><dd>{rp(d.saldo_awal)}</dd></div>
        {d.kelompok ? (d.kelompok || []).map((x) => <div key={x.kelompok}><dt>{GROUP_LABEL[x.kelompok] || x.kelompok}<small>masuk {rp(x.masuk)} · keluar {rp(x.keluar)}</small></dt><dd className={x.bersih < 0 ? styles.neg : undefined}>{rp(x.bersih)}</dd></div>)
          : <><div><dt>Kas masuk</dt><dd>{rp(d.masuk)}</dd></div><div><dt>Kas keluar</dt><dd>{rp(d.keluar)}</dd></div></>}
        <div><dt>Saldo akhir</dt><dd>{rp(d.saldo_akhir)}</dd></div>
        {fcf != null && <div><dt>Arus kas bebas<small>operasi + investasi (pembelian aset)</small></dt><dd className={fcf < 0 ? styles.neg : undefined}>{rp(fcf)}</dd></div>}
      </dl>
      {!d.kelompok && <FiturUpgrade kosId={kosId} owner={owner} event="REPORT.ADVANCED_REQUESTED" title="Arus kas per aktivitas mulai Paket Bisnis" text="Operasi, investasi, pendanaan, dan arus kas bebas." />}
    </Card>
    <Card title="Proyeksi & Likuiditas" icon="/analisis">
      <p className={styles.note}>Proyeksi kas memakai piutang & utang yang jatuh tempo (data nyata), bukan tebakan.</p>
      <div className={styles.links}>
        {jenis === 'retail' && <Link href="/pembukuan?tab=forecast">Proyeksi kas (Pembukuan)</Link>}
        {jenis === 'retail' && <Link href="/pembukuan?tab=umur">Umur piutang & utang</Link>}
        {jenis === 'properti' && <Link href="/tagihan">Tagihan belum dibayar</Link>}
        <Link href="/kas">Kas & bank</Link>
      </div>
      {jenis !== 'retail' && <p className={styles.note}>Proyeksi kas 7/30/90 hari untuk jenis bisnis ini: <b>Dalam rencana</b>.</p>}
    </Card>
  </div>;
}

// ---------- Pajak: PPh final UMKM (semua jenis bisnis) + PPN (toko) ----------
export function TaxModule(props) {
  return <div className={styles.modGrid}>
    <PajakPPh kosId={props.kosId} year={+props.range.to.slice(0, 4)} styles={styles} />
    {props.jenis === 'retail' && <PpnCard {...props} />}
  </div>;
}
function PpnCard({ kosId, range, ver }) {
  const month = range.to.slice(0, 7) + '-01';
  const st = useRpc('tax_report', { p_kos: kosId, p_month: month }, [kosId, month, ver]);
  if (!st) return <Loading rows={4} />;
  if (st.error) return <Fail st={st} />;
  const t = st.data;
  return <Card title={`PPN — ${monthName(month.slice(0, 7))}`} icon="/pengaturan" right={<Go href={`/laporan-toko?dari=${month}&sampai=${range.to}`}>Laporan toko</Go>}>
    {!t.setelan?.aktif && <p className={styles.note}>PPN belum diaktifkan di Pengaturan › Pajak, jadi penjualan tercatat tidak kena PPN.</p>}
    <dl className={styles.kvs}>
      <div><dt>Penjualan (DPP)<small>{t.penjualan?.jumlah} nota · tidak kena PPN {rp(t.penjualan?.tidak_kena)}</small></dt><dd>{rp(t.penjualan?.dpp)}</dd></div>
      <div><dt>PPN keluaran</dt><dd>{rp(t.ppn_keluaran)}</dd></div>
      <div><dt>PPN masukan<small>dari faktur supplier diposting</small></dt><dd>{rp(t.ppn_masukan)}</dd></div>
      <div><dt>Selisih (kurang/lebih bayar)</dt><dd className={n(t.selisih) < 0 ? styles.neg : undefined}>{rp(t.selisih)}</dd></div>
    </dl>
  </Card>;
}

// ---------- Anggaran ----------
export function BudgetModule({ kosId, range, ver, owner }) {
  const month = range.to.slice(0, 7) + '-01';
  const st = useRpc('budget_report', { p_kos: kosId, p_month: month }, [kosId, month, ver]);
  if (!st) return <Loading rows={4} />;
  if (st.error) return <Fail st={st} />;
  const b = st.data; const rows = b.baris || [];
  const ang = rows.reduce((t, r) => t + n(r.anggaran), 0); const real = rows.filter((r) => r.anggaran != null).reduce((t, r) => t + n(r.realisasi), 0);
  return <>{b.aktif && <BudgetPlanCard kosId={kosId} month={month} ver={ver} />}<Card title={`Anggaran vs Realisasi — ${monthName(month.slice(0, 7))}`} icon="/anggaran" right={<Go href="/anggaran">Atur anggaran</Go>}>
    {!b.aktif && <FiturUpgrade kosId={kosId} owner={owner} event="BUDGET.CREATE_REQUESTED" title="Anggaran tersedia mulai Paket Bisnis" text="Rencana biaya per kategori dibanding realisasi." />}
    {ang > 0 && <p className={styles.note}>Kategori beranggaran: anggaran {rp(ang)} · realisasi {rp(real)} · {real > ang ? `melebihi ${rp(real - ang)}` : `sisa ${rp(ang - real)}`}</p>}
    {rows.length === 0 ? <Empty title="Belum ada pengeluaran berkategori bulan ini" /> :
      <table className={styles.stmt}><thead><tr><th>Kategori (Rp)</th><th>Anggaran</th><th>Realisasi</th><th>Selisih</th></tr></thead>
        <tbody>{rows.map((r) => { const v = r.anggaran == null ? null : n(r.anggaran) - n(r.realisasi);
          return <tr key={r.id}><th scope="row">{r.nama}</th><td>{r.anggaran == null ? '—' : num(r.anggaran)}</td><td>{num(r.realisasi)}</td><td className={v != null && v < 0 ? styles.neg : undefined}>{v == null ? 'belum' : num(v)}</td></tr>; })}</tbody></table>}
    <p className={styles.note}>Anggaran CAPEX & anggaran kas: <b>Dalam rencana</b>.</p>
  </Card></>;
}

// Target pendapatan, status persetujuan & proyeksi (budget_summary) — ringkas; pengaturan di menu Anggaran
function BudgetPlanCard({ kosId, month, ver }) {
  const [st] = useBudgetSummary(kosId, month, ver);
  if (!st) return <Loading rows={2} />;
  if (st.error) return <Fail st={st} />;
  const sum = st.data; const status = sum.rencana?.status || 'draf';
  return <Card title={`Target & Persetujuan — ${monthName(month.slice(0, 7))}`} icon="/anggaran" right={<span className={styles.note}>{sum.terkunci ? 'Terkunci (tutup buku)' : BUDGET_STATUS[status][0]}</span>}>
    <PlanSummary sum={sum} compact />
    {!sum.final && sum.hari_berjalan > 0 && <p className={styles.note}>PROYEKSI = laju harian sampai hari ini dikali jumlah hari sebulan; bukan angka aktual.</p>}
  </Card>;
}

// ---------- Investasi, aset & valuasi ----------
export function InvestModule({ kosId, ver, owner }) {
  const st = useRpc('asset_list', { p_kos: kosId }, [kosId, ver]);
  return <div className={styles.modGrid}>
    <Card title="Aset Tetap" icon="/aset" right={<Go href="/aset">Daftar aset</Go>}>
      {!st ? <Loading rows={2} /> : st.error ? <Fail st={st} /> : <dl className={styles.kvs}>
        <div><dt>Harga perolehan</dt><dd>{rp(st.data.total_cost)}</dd></div>
        <div><dt>Akumulasi penyusutan</dt><dd>{rp(st.data.total_accumulated)}</dd></div>
        <div><dt>Nilai buku</dt><dd>{rp(st.data.total_book)}</dd></div>
        <div><dt>Penyusutan per bulan</dt><dd>{rp(st.data.monthly)}</dd></div>
        <div><dt>Jumlah aset</dt><dd>{(st.data.assets || []).length}</dd></div></dl>}
    </Card>
    <Card title="Investasi & Valuasi" icon="/analisis">
      <p className={styles.note}>Mesin yang sudah berjalan di Pembukuan — hasilnya PROYEKSI/ESTIMASI, bukan angka aktual.</p>
      <ul className={styles.hub}>
        <li><Link href="/pembukuan?tab=investment"><b>Simulasi & realisasi investasi</b><small>NPV, IRR, payback, skenario, perbandingan dengan realisasi</small></Link></li>
        <li><Link href="/pembukuan?tab=valuation"><b>Valuasi bisnis (DCF)</b><small>Dari arus kas historis, dengan analisis sensitivitas</small></Link></li>
        <li><span><b>Register modal</b><small>Dalam rencana — ROIC ada di Laporan Keuangan › Rasio; valuasi multiple & aset di bawah</small></span></li>
      </ul>
    </Card>
    <ValuationCard kosId={kosId} ver={ver} owner={owner} />
  </div>;
}

// ---------- Laporan & portofolio ----------
export function ReportsModule({ onExport }) {
  return <Card title="Laporan & Portofolio" icon="/laporan">
    <ul className={styles.hub}>
      <li><Link href="/pembukuan?tab=pusat"><b>Laporan bulanan berversi</b><small>Draf → tinjau → setujui → terbit; terkunci dengan tutup buku</small></Link></li>
      <li><button type="button" onClick={() => onExport('pdf')}><b>Ekspor analisis (PDF)</b><small>Ringkasan, skor, insight, tren, arus kas, per akun sesuai filter</small></button></li>
      <li><button type="button" onClick={() => onExport('xlsx')}><b>Ekspor analisis (Excel)</b><small>Lembar terpisah per bagian</small></button></li>
      <li><Link href="/bisnis"><b>Portofolio multi-bisnis</b><small>Gabungan bisnis yang Anda pilih (Paket Pro), tanpa eliminasi antarbisnis</small></Link></li>
      <li><Link href="/laporan-investor"><b>Laporan investor (Paket Pro)</b><small>A4 bersampul: ringkasan & MD&A, laporan keuangan, rasio, KPI, skenario, risiko, valuasi — disetujui pemilik, angka dibekukan & diarsip</small></Link></li>
      <li><span><b>Konsolidasi formal antarentitas</b><small>Dalam rencana — butuh struktur kepemilikan & penandaan transaksi antarentitas</small></span></li>
    </ul>
  </Card>;
}

// ---------- Peta modul blueprint (status jujur; rincian di docs/AUDIT_BI_MASTER_V2.md) ----------
export const BLUEPRINT = [
  ['Pusat kendali keuangan', 'Ada', 'Ringkasan: skor, KPI, insight, drill-down', 'ringkasan'],
  ['Mesin akuntansi', 'Ada', 'Jurnal otomatis/manual, tutup periode, neraca saldo, rekonsiliasi bank', '/pembukuan'],
  ['Analisis pendapatan', 'Parsial', 'Per produk/pelanggan/cabang; berulang vs tidak belum', 'ringkasan'],
  ['Analisis biaya', 'Parsial', 'Per akun & kategori; tetap/variabel & cost center belum', 'keuangan'],
  ['Pajak', 'Parsial', 'PPh final UMKM 0,5% berversi + setoran, PPN keluaran/masukan; PPh badan normal & potong-pungut belum', 'pajak'],
  ['Arus kas & likuiditas', 'Parsial', 'Per aktivitas, arus kas bebas, rasio likuiditas; proyeksi lintas jenis belum', 'kas'],
  ['Aset, kewajiban & ekuitas', 'Ada', 'Neraca, laporan perubahan ekuitas, aset tetap, umur piutang, pinjaman (pokok/bunga, porsi ≤ 12 bulan)', 'keuangan'],
  ['Anggaran', 'Parsial', 'Biaya per kategori, target pendapatan, persetujuan & proyeksi akhir bulan; CAPEX & kas belum', 'anggaran'],
  ['Kinerja bisnis', 'Ada', 'KPI toko/kos/jasa/kuliner + KPI industri (laundry per kg, tepat janji, food cost, hunian, tunggakan); benchmark antarbisnis belum', 'industri'],
  ['Investasi & modal', 'Parsial', 'Simulasi NPV/IRR & realisasi, cakupan bunga, ROIC; register modal belum', 'investasi'],
  ['Valuasi bisnis', 'Ada', 'DCF, kelipatan (sumber dari pemilik), berbasis aset; tersimpan berversi', 'investasi'],
  ['Proyeksi & skenario', 'Ada', 'Pesimis/Dasar/Optimis 12 bulan (laba, kas, likuiditas), stress test, versi tersimpan', 'skenario'],
  ['Manajemen risiko', 'Ada', 'Faktor risiko otomatis, daftar risiko (kemungkinan × dampak, PIC, tinjauan) + saran dari data', '/risiko'],
  ['Konsolidasi', 'Parsial', 'Portofolio (Mode A); eliminasi antarentitas belum', 'laporan'],
  ['Laporan investor', 'Ada', 'Laporan bulanan berversi + laporan investor A4 (Pro) disetujui pemilik & diarsip', '/laporan-investor'],
  ['Pendukung keputusan', 'Ada', 'Fakta → temuan → rekomendasi berbasis aturan', 'ringkasan'],
];
export function MapModule({ onGo }) {
  return <Card title="Peta Modul Business Intelligence" icon="/layers">
    <p className={styles.note}>Status jujur tiap modul Master Blueprint V2.0 di PRASARA saat ini. Yang belum dibangun tidak ditampilkan sebagai fitur aktif.</p>
    <ul className={styles.hub}>{BLUEPRINT.map(([name, status, desc, go], i) => <li key={name}>
      <button type="button" onClick={() => onGo(go)}><b>{i + 1}. {name} <span className={styles.kind + ' ' + (status === 'Ada' ? styles.good : styles.warn)}>{status === 'Ada' ? 'Tersedia' : 'Sebagian'}</span></b><small>{desc}</small></button></li>)}</ul>
  </Card>;
}
