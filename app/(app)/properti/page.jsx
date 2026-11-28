'use client';
// Properti & Lokasi + Property Intelligence (migrasi 20261128160000). Angka dari SATU RPC property_intel; rumus HANYA lib/propertyIntel.js.
// Multi-properti = lokasi bersama (branches, batas paket `cabang`). Nilai investasi/pasar DIISI PEMILIK lewat property_value_set.
// Paket: Dasar = ringkasan (hunian 6 bulan, pendapatan, NOI, tunggakan); Bisnis = per unit, ROI/yield/balik modal, proyeksi; Pro = per properti.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { PageHeader, DataTable } from '@/components/Page';
import { Widget, Alerts } from '@/components/Dashboard';
import { Loading, Empty, Sheet, Field, run } from '@/components/ui';
import PageHelp from '@/components/PageHelp';
import FiturUpgrade from '@/components/FiturUpgrade';
import { TrendChart, Donut, C } from '@/app/(app)/analisis/Charts';
import { rp, errMsg, parseRp, angka, today, BLN, tgl } from '@/lib/format';
import { canArea } from '@/lib/business';
import { termsFor } from '@/lib/propertyTerms';
import { noi, delta, returns, occupancySeries, roomStatus, collection, units, forecast, perProperty, insights, pct, years } from '@/lib/propertyIntel';
import styles from './properti.module.css';

const ym = (d) => d.slice(0, 7);
const addDays = (d, k) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };
function range(p) {
  const t = today(); const first = t.slice(0, 8) + '01';
  if (p === 'lalu') { const e = addDays(first, -1); return { from: e.slice(0, 8) + '01', to: e, label: 'bulan lalu' }; }
  if (p === '3bln') { const x = new Date(first + 'T00:00:00Z'); x.setUTCMonth(x.getUTCMonth() - 2); return { from: x.toISOString().slice(0, 10), to: t, label: '3 bulan terakhir' }; }
  if (p === '12bln') { const x = new Date(first + 'T00:00:00Z'); x.setUTCMonth(x.getUTCMonth() - 11); return { from: x.toISOString().slice(0, 10), to: t, label: '12 bulan terakhir' }; }
  return { from: first, to: t, label: 'bulan ini' };
}
const PERIODS = [['bulan', 'Bulan ini'], ['lalu', 'Bulan lalu'], ['3bln', '3 bulan'], ['12bln', '12 bulan']];
const shortM = (k) => BLN[Number(k.slice(5, 7)) - 1] + ' ' + k.slice(2, 4);

function Tag({ k }) { return <span className={styles.tag} data-k={k}>{k}</span>; }
function Kpi({ label, value, sub, d, tone, tag, icon }) {
  return <div className={styles.kpi} data-tone={tone}>
    <span className={styles.kl}>{label}{tag && <Tag k={tag} />}</span>
    <b>{value}</b>
    {(sub || d != null) && <small>{d != null && <span className={styles.delta} data-up={d >= 0}>{d >= 0 ? '↑' : '↓'} {Math.abs(Math.round(d * 100))}%</span>} {sub}</small>}
  </div>;
}

export default function PropertiPage() {
  const { kos, kosId, ver } = useKos();
  const sp = useSearchParams();
  const router = useRouter();
  const t = termsFor(kos);
  const fin = canArea(kos, 'finance');
  const [tab, setTab] = useState(sp.get('tab') === 'lokasi' || !fin ? 'lokasi' : 'ringkasan');
  const go = (k) => { setTab(k); router.replace(`/properti${k === 'lokasi' ? '?tab=lokasi' : ''}`, { scroll: false }); };
  return <div className={styles.page}>
    <PageHeader title={`${t.place === 'Gedung' ? 'Gedung' : 'Properti'} & Lokasi`} help={<PageHelp page="properti" />}
      desc={`Okupansi, tunggakan, NOI, ROI, rental yield & proyeksi pendapatan ${t.short} Anda — dari data yang sudah tercatat.`} />
    <div className={styles.tabs} role="tablist">
      {fin && <button role="tab" aria-selected={tab === 'ringkasan'} onClick={() => go('ringkasan')}>Property Intelligence</button>}
      <button role="tab" aria-selected={tab === 'lokasi'} onClick={() => go('lokasi')}>Daftar properti & nilai</button>
    </div>
    {tab === 'ringkasan' && fin ? <Intel key={kosId} kos={kos} kosId={kosId} ver={ver} t={t} /> : <Locations key={kosId} kos={kos} kosId={kosId} ver={ver} t={t} baru={sp.get('baru') === '1'} />}
  </div>;
}

function Intel({ kos, kosId, ver, t }) {
  const [p, setP] = useState('bulan');
  const [branch, setBranch] = useState('');
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const r = range(p);
  useEffect(() => {
    let on = true; setD(null); setErr(null);
    supabase.rpc('property_intel', { p_kos: kosId, p_from: r.from, p_to: r.to, p_branch: branch || null })
      .then(({ data, error }) => { if (on) error ? setErr(errMsg(error)) : setD(data); });
    return () => { on = false; };
  }, [kosId, ver, p, branch]); // eslint-disable-line react-hooks/exhaustive-deps

  const calc = useMemo(() => d && ({
    cur: noi(d.pnl), prev: noi(d.prev), ret: returns(d), occ: occupancySeries(d), st: roomStatus(d.rooms), col: collection(d),
    un: units(d), fc: forecast(d), pp: perProperty(d), ins: insights(d),
  }), [d]);
  if (err) return <div className="notice bad" role="alert">{err}</div>;
  if (!d || !calc) return <Loading rows={6} />;
  const { cur, prev, ret, occ, st, col, un, fc, pp, ins } = calc;
  const a = ret.annual;
  const multi = (d.props || []).length > 1 || branch;
  const unitL = t.unit.toLowerCase();

  return <>
    <div className={styles.bar}>
      <div className={styles.seg} role="group" aria-label="Periode">{PERIODS.map(([k, l]) => <button key={k} aria-pressed={p === k} onClick={() => setP(k)}>{l}</button>)}</div>
      {multi && (d.dalam ? <select aria-label="Pilih properti" value={branch} onChange={(e) => setBranch(e.target.value)}>
        <option value="">Semua properti</option>{(d.props || []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select> : <span className="small muted">Filter per properti: Paket Pro</span>)}
    </div>
    <p className="small muted" style={{ margin: '0 0 10px' }}>Periode {tgl(r.from)} – {tgl(r.to)}. Pendapatan & biaya dari jurnal (sama dengan Pembukuan & Analisis Bisnis). Pembanding: {tgl(d.prev_period.from)} – {tgl(d.prev_period.to)}.</p>

    <div className={styles.kpis}>
      <Kpi label="Tingkat hunian" value={pct(st.occ, 0)} sub={`${st.terisi} dari ${st.rentable} ${unitL} terisi`} tag="AKTUAL" tone={st.occ != null && st.occ < 0.7 ? 'warn' : ''} />
      <Kpi label={`Pendapatan ${r.label}`} value={rp(cur.revenue)} d={delta(cur.revenue, prev.revenue)} sub="vs periode sebelumnya" tag="AKTUAL" />
      <Kpi label="NOI (laba operasional bersih)" value={rp(cur.noi)} d={delta(cur.noi, prev.noi)} sub={cur.margin != null ? `margin ${pct(cur.margin)}` : ''} tag="AKTUAL" tone={cur.noi < 0 ? 'bad' : ''} />
      <Kpi label="Tunggakan" value={rp(col.arrears)} sub={`${col.count} tagihan · ${col.tenants} ${t.tenant.toLowerCase()}`} tone={col.arrears > 0 ? 'bad' : ''} tag="AKTUAL" />
      {d.lanjut && <>
        <Kpi label="Rental yield (kotor)" value={pct(ret.grossYield)} sub={ret.yieldBasis ? `÷ ${ret.yieldBasis}${a.estimated ? ` · disetahunkan dari ${a.months} bln` : ''}` : ret.reasons.yield || ret.reasons.all} tag={a.estimated ? 'ESTIMASI' : 'AKTUAL'} />
        <Kpi label="ROI (NOI ÷ investasi)" value={pct(ret.roi)} sub={ret.roi != null ? `NOI setahun ${rp(a.noi)}` : ret.reasons.roi || ret.reasons.all} tag={a.estimated ? 'ESTIMASI' : 'AKTUAL'} />
        <Kpi label="Estimasi balik modal" value={years(ret.payback)} sub={ret.payback == null ? (ret.reasons.payback || ret.reasons.roi || ret.reasons.all) : `investasi ${rp(ret.values.invest)}`} tag="ESTIMASI" />
      </>}
      <Kpi label="Perawatan aktif" value={String(d.maint?.open || 0)} sub={`biaya ${r.label} ${rp(d.maint?.cost || 0)}`} />
    </div>
    {!d.lanjut && <FiturUpgrade kosId={kosId} event="ANALYTICS.ADVANCED.REQUESTED" title="ROI, rental yield, profit per unit & proyeksi pendapatan"
      text="Tersedia di Paket Bisnis: profitabilitas per kamar/unit, rental yield, ROI, estimasi balik modal, dan proyeksi sewa 12 bulan." />}

    <div className={styles.grid}>
      <Widget title={`Tren hunian ${occ.length} bulan`}>
        {occ.some((m) => m.hari > 0) ? <TrendChart money={false} height={190} points={occ.map((m) => ({ label: m.key, short: shortM(m.key), v: m.value == null ? 0 : Math.round(m.value * 100) }))}
          series={[{ key: 'v', label: 'Hunian (%)', color: C.main, area: true, fmt: (v) => v + '%' }]} />
          : <p className="small muted">Belum ada {unitL} yang disewakan.</p>}
        <span className="small muted">Hari {unitL} terisi ÷ hari {unitL} tersedia (memakai daftar {unitL} yang disewakan sekarang).</span>
      </Widget>
      <Widget title={`Status ${unitL}`}>
        <div className={styles.status}>
          {[['Terisi', st.terisi, 'terisi'], ['Kosong', st.kosong, 'kosong'], [t.booking, st.booking, 'booking'], ['Perawatan', st.perawatan, 'rawat']].map(([l, v, k]) =>
            <Link key={k} href="/kamar" data-k={k}><b>{v}</b><span>{l}</span></Link>)}
        </div>
        <dl className="kv"><dt>Sewa bulanan berjalan</dt><dd>{rp(st.rentRoll)}</dd><dt>Potensi {unitL} kosong</dt><dd>{rp(st.vacantRent)}/bln</dd></dl>
      </Widget>
      <Widget title="Tunggakan & penagihan" action={<Link href="/tagihan">Tagihan</Link>}>
        <div className={styles.buckets}>{col.buckets.map(([l, v]) => <div key={l}><span>{l}</span><b data-bad={v > 0}>{rp(v)}</b></div>)}</div>
        <dl className="kv">
          <dt>Tagihan jatuh tempo {r.label}</dt><dd>{rp(col.billed)}</dd>
          <dt>Sudah terbayar</dt><dd>{rp(col.collected)}{col.rate != null && ` (${pct(col.rate, 0)})`}</dd>
          <dt>Jatuh tempo 30 hari ke depan</dt><dd>{rp(col.due30)}</dd>
        </dl>
      </Widget>
      <Widget title="Temuan dari data"><Alerts items={ins} /></Widget>
    </div>

    {d.lanjut && <>
      <Widget title={`Profitabilitas per ${unitL}`} action={<Tag k="AKTUAL" />}>
        <p className="small muted">Kontribusi = uang sewa masuk {unitL} itu − biaya perbaikan {unitL} itu. Biaya bersama (listrik gedung, gaji) tidak dibagi ke {unitL}. Pendapatan per {unitL} tersedia: <b>{un.revPau != null ? rp(un.revPau) : '—'}</b>.</p>
        <DataTable rows={un.rows} pageSize={10} caption={`Kontribusi per ${unitL}`} columns={[
          { key: 'code', label: t.unit, main: true, render: (x) => <b>{x.code}</b>, sort: (x) => x.code },
          { key: 'occ', label: 'Hari terisi', align: 'right', render: (x) => pct(x.occ, 0), sort: (x) => x.occ ?? -1 },
          { key: 'masuk', label: 'Sewa masuk', align: 'right', render: (x) => rp(x.masuk), sort: (x) => x.masuk },
          { key: 'rawat', label: 'Perbaikan', align: 'right', hide: 'tablet', render: (x) => rp(x.rawat), sort: (x) => x.rawat },
          { key: 'c', label: 'Kontribusi', align: 'right', render: (x) => <b data-bad={x.contribution < 0}>{rp(x.contribution)}</b>, sort: (x) => x.contribution },
        ]} />
      </Widget>
      <Widget title="Proyeksi pendapatan sewa 12 bulan" action={<Tag k="PROYEKSI" />}>
        <TrendChart height={200} points={fc.rows.map((m) => ({ label: m.key, short: shortM(m.key), a: m.konservatif, b: m.dasar, c: m.penuh }))} series={[
          { key: 'c', label: 'Potensi penuh', color: C.light, fmt: rp }, { key: 'b', label: 'Dasar', color: C.main, area: true, fmt: rp }, { key: 'a', label: 'Konservatif', color: C.amber, fmt: rp }]} />
        <dl className="kv">
          <dt>Konservatif</dt><dd>{rp(fc.konservatif)}</dd><dt>Dasar</dt><dd><b>{rp(fc.dasar)}</b></dd><dt>Potensi penuh</dt><dd>{rp(fc.penuh)}</dd>
        </dl>
        <p className="small muted">Konservatif = sewa bertanggal selesai yang masih berjalan + {t.booking.toLowerCase()} aktif. Dasar = + sewa tanpa tanggal selesai (diasumsikan berlanjut). Potensi penuh = + tarif semua {unitL} kosong. Tanpa kenaikan harga & tanpa menebak {t.tenant.toLowerCase()} keluar.</p>
      </Widget>
      <Widget title="Investasi & imbal hasil" action={<Link href="/properti?tab=lokasi">Isi nilai properti</Link>}>
        <dl className="kv">
          <dt>NOI 12 bulan {a.ok && a.estimated ? `(disetahunkan dari ${a.months} bulan)` : ''}</dt><dd>{a.ok ? rp(a.noi) : '—'}</dd>
          <dt>Pendapatan 12 bulan</dt><dd>{a.ok ? rp(a.revenue) : '—'}</dd>
          <dt>Nilai investasi (diisi pemilik)</dt><dd>{ret.values.invest > 0 ? rp(ret.values.invest) : 'Belum diisi'}</dd>
          <dt>Nilai pasar (diisi pemilik)</dt><dd>{ret.values.market > 0 ? rp(ret.values.market) : 'Belum diisi'}</dd>
          <dt>Aset tetap tercatat (pembanding)</dt><dd>{rp(d.aset_total)}</dd>
          <dt>Rental yield bersih (NOI ÷ nilai)</dt><dd>{pct(ret.netYield)}</dd>
        </dl>
        {(ret.reasons.roi || ret.reasons.yield) && <p className="small muted">{ret.reasons.roi || ret.reasons.yield}</p>}
        <p className="small muted">NOI = pendapatan usaha − biaya operasional; tidak termasuk penyusutan, bunga pinjaman, pajak, dan belanja modal. Untuk valuasi bisnis lengkap buka <Link href="/analisis?m=investasi">Analisis › Investasi & Valuasi</Link>.</p>
      </Widget>
    </>}

    {multi && !branch && (d.dalam ? <Widget title="Perbandingan properti" action={<Tag k="AKTUAL" />}>
      <DataTable rows={pp} pageSize={10} caption="Perbandingan properti" columns={[
        { key: 'name', label: 'Properti', main: true, render: (x) => <b>{x.name}</b> },
        { key: 'occ', label: 'Hunian', align: 'right', render: (x) => pct(x.occ, 0) },
        { key: 'rev', label: 'Pendapatan', align: 'right', render: (x) => rp(x.revenue) },
        { key: 'noi', label: 'NOI', align: 'right', render: (x) => rp(x.noi) },
        { key: 'roi', label: 'ROI/thn', align: 'right', hide: 'tablet', render: (x) => pct(x.roi) },
      ]} />
      <p className="small muted">Transaksi tanpa lokasi (mis. penyusutan, biaya tanpa lokasi) dihitung di lokasi utama.</p>
    </Widget> : <FiturUpgrade kosId={kosId} event="ANALYTICS.MULTI_BRANCH.REQUESTED" plan="pro" title="Bandingkan kinerja antar properti" text="Paket Pro: hunian, pendapatan, NOI, dan ROI per gedung/lokasi, plus filter per properti." />)}
  </>;
}

function Locations({ kos, kosId, ver, t, baru }) {
  const { bump } = useKos();
  const [d, setD] = useState(null);
  const [sheet, setSheet] = useState(baru ? { t: 'prop' } : null);
  const fin = canArea(kos, 'finance');
  const owner = canArea(kos, 'team');
  const load = async () => {
    const [b, r, v] = await Promise.all([
      supabase.from('branches').select('id,name,address,is_main,kind,active').eq('kos_id', kosId).eq('kind', 'cabang').order('is_main', { ascending: false }).order('name'),
      supabase.from('rooms').select('id,branch_id,status').eq('kos_id', kosId),
      fin ? supabase.from('property_values').select('*').eq('kos_id', kosId) : Promise.resolve({ data: [] }),
    ]);
    setD({ branches: b.data || [], rooms: r.data || [], values: v.data || [], err: b.error || r.error });
  };
  useEffect(() => { load(); }, [kosId, ver]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return <Loading />;
  if (d.err) return <div className="notice bad">{errMsg(d.err)}</div>;
  const main = d.branches.find((b) => b.is_main);
  const list = d.branches.length ? d.branches : [{ id: null, name: kos.name, address: kos.address, is_main: true, active: true, virtual: true }];
  const count = (b) => d.rooms.filter((r) => (r.branch_id || main?.id || null) === b.id || (b.virtual && !r.branch_id));
  const val = (b) => d.values.find((v) => v.branch_id === (b.id || main?.id));
  const done = () => { setSheet(null); load(); bump(); };
  return <>
    <p className="small muted">Setiap properti (gedung/lokasi) memakai lokasi bersama PRASARA. {t.unit} tanpa lokasi otomatis masuk lokasi utama. Jumlah lokasi mengikuti paket (Dasar 1, Bisnis 3, Pro 10).</p>
    <div className={styles.props}>{list.filter((b) => b.active).map((b) => {
      const rs = count(b); const v = val(b);
      return <article key={b.id || 'utama'} className="panel">
        <div className={styles.ph}><div><b>{b.virtual ? kos.name : b.name}</b>{b.is_main && <span className="chip">Utama</span>}<p className="small muted">{b.address || kos.address || 'Alamat belum diisi'}</p></div>
          {owner && !b.virtual && <button className="sm" onClick={() => setSheet({ t: 'prop', b })}>Ubah</button>}</div>
        <dl className="kv"><dt>{t.unit}</dt><dd>{rs.filter((r) => r.status !== 'tidak_disewakan').length} ({rs.filter((r) => r.status === 'terisi').length} terisi)</dd>
          {fin && <><dt>Nilai investasi</dt><dd>{v?.invest ? rp(v.invest) : 'Belum diisi'}</dd><dt>Nilai pasar</dt><dd>{v?.market_value ? `${rp(v.market_value)}${v.market_date ? ' · ' + tgl(v.market_date) : ''}` : 'Belum diisi'}</dd></>}
        </dl>
        <div className="row">
          <Link href={`/kamar${b.id && !b.virtual ? '?properti=' + b.id : ''}`}>Lihat {t.unit.toLowerCase()}</Link>
          {fin && <button className="sm" onClick={() => setSheet({ t: 'val', b, v })}>Nilai investasi</button>}
        </div>
      </article>;
    })}</div>
    {owner ? <button className="primary" onClick={() => setSheet({ t: 'prop' })}>+ Tambah properti / lokasi</button>
      : <p className="small muted">Hanya pemilik yang bisa menambah properti.</p>}
    {sheet?.t === 'prop' && <PropSheet kosId={kosId} b={sheet.b} onClose={() => setSheet(null)} onDone={done} />}
    {sheet?.t === 'val' && <ValueSheet kosId={kosId} b={sheet.b} v={sheet.v} name={sheet.b.virtual ? kos.name : sheet.b.name} onClose={() => setSheet(null)} onDone={done} />}
    {!fin && <Empty title="Ringkasan keuangan properti" text="Angka okupansi, NOI, dan ROI hanya untuk peran yang memegang keuangan." />}
  </>;
}

function PropSheet({ kosId, b, onClose, onDone }) {
  const [name, setName] = useState(b?.name || '');
  const [addr, setAddr] = useState(b?.address || '');
  const [busy, setBusy] = useState(false);
  const save = async (active = true) => {
    setBusy(true);
    const ok = await run(() => supabase.rpc('property_save', { p_kos: kosId, p_id: b?.id || null, p_name: name, p_address: addr, p_active: active }), b ? 'Properti diperbarui' : 'Properti ditambahkan', errMsg);
    setBusy(false); if (ok) onDone();
  };
  return <Sheet title={b ? `Ubah ${b.name}` : 'Tambah properti / lokasi'} onClose={onClose}>
    <Field label="Nama properti" hint="mis. Gedung B, Kos Melati 2"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></Field>
    <Field label="Alamat"><textarea value={addr} onChange={(e) => setAddr(e.target.value)} /></Field>
    <button className="cta" disabled={busy} onClick={() => save(true)}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
    {b && !b.is_main && <button className="danger" disabled={busy} onClick={() => confirm('Nonaktifkan properti ini? Kamar terisi harus dipindah/diakhiri dulu.') && save(false)}>Nonaktifkan</button>}
  </Sheet>;
}

function ValueSheet({ kosId, b, v, name, onClose, onDone }) {
  const [inv, setInv] = useState(v?.invest ? angka(v.invest) : '');
  const [invD, setInvD] = useState(v?.invest_date || '');
  const [mk, setMk] = useState(v?.market_value ? angka(v.market_value) : '');
  const [mkD, setMkD] = useState(v?.market_date || '');
  const [note, setNote] = useState(v?.note || '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const ok = await run(() => supabase.rpc('property_value_set', { p_kos: kosId, p_branch: b.virtual ? null : b.id, p_invest: inv.trim() ? parseRp(inv) : null, p_invest_date: invD || null,
      p_market: mk.trim() ? parseRp(mk) : null, p_market_date: mkD || null, p_note: note }), 'Nilai properti disimpan', errMsg);
    setBusy(false); if (ok) onDone();
  };
  return <Sheet title={`Nilai ${name}`} onClose={onClose}>
    <p className="small muted">Dipakai menghitung ROI, rental yield, dan balik modal. PRASARA tidak mengisi angka ini — kosongkan bila belum tahu.</p>
    <div className="row">
      <Field label="Nilai investasi" hint="Harga beli/bangun + renovasi besar"><input inputMode="numeric" value={inv} onChange={(e) => setInv(e.target.value)} placeholder="belum diisi" /></Field>
      <Field label="Tanggal"><input type="date" value={invD} max={today()} onChange={(e) => setInvD(e.target.value)} /></Field>
    </div>
    <div className="row">
      <Field label="Nilai pasar sekarang" hint="Taksiran/appraisal terbaru"><input inputMode="numeric" value={mk} onChange={(e) => setMk(e.target.value)} placeholder="belum diisi" /></Field>
      <Field label="Tanggal taksiran"><input type="date" value={mkD} max={today()} onChange={(e) => setMkD(e.target.value)} /></Field>
    </div>
    <Field label="Sumber / catatan" hint="mis. appraisal KJPP, harga pasar sekitar"><input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></Field>
    <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
  </Sheet>;
}
