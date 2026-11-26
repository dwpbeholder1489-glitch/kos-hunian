'use client';
// Komisi kasir. Server: commission_rule_save (aturan), commission_report (hitung), commission_to_payroll (masukkan ke draf gaji sebagai bonus).
// Dasar komisi = penjualan bersih yang dicatat kasir itu (tanpa PPN, setelah diskon & retur). Dibayar lewat Gaji agar kas & jurnal satu pintu.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import NavIcon from '@/components/NavIcon';
import styles from './komisi.module.css';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Field, Loading, Sheet, run, toast } from '@/components/ui';
import { rp, angka, errMsg, today, bulan } from '@/lib/format';

import { pathAllowed } from '@/lib/business';

const bulanIni = () => today().slice(0, 7);
const range = (m) => { const [y, mo] = m.split('-').map(Number); const last = new Date(Date.UTC(y, mo, 0)).getUTCDate(); return [`${m}-01`, `${m}-${String(last).padStart(2, '0')}`]; };

export default function Komisi() {
  const { kosId, kos, user, ver } = useKos();
  if (!kosId || !kos || !user) return <Loading />;
  return <CommissionWorkspace key={`${kosId}:${user.id}`} {...{ kosId, kos, user, ver }} />;
}

function CommissionWorkspace({ kosId, kos, user, ver }) {
  const [month, setMonth] = useState(bulanIni());
  const [r, setR] = useState(null);
  const [cats, setCats] = useState([]);
  const [names, setNames] = useState({});
  const [err, setErr] = useState(null);
  const [rule, setRule] = useState(null);   // null | {} baru | aturan
  const [tab, setTab] = useState('list');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [payroll, setPayroll] = useState(false);
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const load = async () => {
    const id = ++request.current;
    const [a, b] = range(month);
    const x = await supabase.rpc('commission_report', { p_kos: kosId, p_from: a, p_to: b });
    if (id !== request.current) return;
    if (x.error) return setErr(errMsg(x.error));
    setErr(null); setR(x.data);
  };
  useEffect(() => { load(); return () => { request.current++; }; }, [kosId, ver, month]);
  useEffect(() => {
    supabase.rpc('member_names', { p_kos: kosId }).then(({ data }) => setNames(data || {}));
    supabase.from('product_categories').select('id,name').eq('kos_id', kosId).order('name').then(({ data }) => setCats(data || []));
  }, [kosId]);
  const who = (id) => (id ? names[id] || 'karyawan lama' : 'Semua kasir');
  const catName = (id) => (id ? cats.find((item) => item.id === id)?.name || 'kategori dihapus' : 'semua barang');
  const rows = r?.rows ?? [];
  const total = rows.reduce((sum, item) => sum + Number(item.komisi), 0);
  const sales = rows.reduce((sum, item) => sum + Number(item.basis), 0);
  const pending = rows.filter((item) => Number(item.komisi) > 0 && item.dibayar == null);
  const owner = user.id === kos.owner_id;
  const sdm = pathAllowed(kos, '/sdm');
  const needle = query.trim().toLowerCase();
  const shown = rows.filter((item) => who(item.user_id).toLowerCase().includes(needle));
  const performance = [...rows]
    .sort((a, b) => Number(b.basis) - Number(a.basis) || who(a.user_id).localeCompare(who(b.user_id), 'id'))
    .map((item, index) => ({ ...item, rank: index + 1 }))
    .filter((item) => who(item.user_id).toLowerCase().includes(needle));
  const imported = shown.filter((item) => item.dibayar != null);
  const visible = tab === 'performance' ? performance : tab === 'history' ? imported : shown;
  const chooseMonth = (period) => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || period > bulanIni() || period === month || busy) return;
    setR(null);
    setErr(null);
    setMonth(period);
  };
  const toPayroll = async () => {
    if (!owner || !sdm || busy || !pending.length) return;
    setBusy(true);
    try {
      const { data: out, error } = await supabase.rpc('commission_to_payroll', { p_kos: kosId, p_month: `${month}-01` });
      if (error) return toast(errMsg(error));
      const skipped = out.dilewati || [];
      toast(`${out.masuk} komisi masuk ke draf gaji${skipped.length ? ` · ${skipped.length} dilewati: ${skipped.map((item) => `${who(item.user_id)} (${item.alasan})`).join('; ')}` : ''}`);
      setPayroll(false);
      await load();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={styles.page}>
      <section className={styles.hero} aria-label="Sales Commission Center">
        <div className={styles.heroCopy}>
          <h1>Komisi Kasir</h1>
          <p>Kelola aturan, hitung komisi, dan pantau performa penjualan setiap kasir.</p>
          <PageHelp page="komisi" label={<><NavIcon name="/buku-besar" size={17} /> Panduan Komisi Kasir <NavIcon name="next" size={14} /></>} />
        </div>
        <span className={styles.heroArt}><Image src="/komisi-kasir.webp" alt="" fill priority sizes="(max-width: 600px) 36vw, 290px" /></span>
      </section>
      <label className={styles.period}>
        <NavIcon name="calendar" /><span>Periode</span><b>{bulan(month)}</b><NavIcon name="down" size={17} />
        <input type="month" aria-label="Periode komisi" value={month} max={bulanIni()} onChange={(event) => chooseMonth(event.target.value)} disabled={busy} />
      </label>
      {err ? <div className="notice bad">{err.includes('commission') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div> : !r ? <Loading /> : <>
        <div className={styles.overview}>
          <section className={styles.panel}>
            <div className={styles.panelHead}><span className={styles.icon}><NavIcon name="/pengaturan" /></span><h2>Aturan Komisi</h2><button onClick={() => setRule({})}>＋ Aturan</button></div>
            {r.rules.length === 0 ? <p className={styles.muted}>Belum ada aturan. Contoh: semua kasir 1% dari penjualan, atau kategori Rokok 0,5%.</p> : (
              <div className="list">{r.rules.map((item) => <div className="li" key={item.id}>
                <div className="main"><b>{angka(item.rate)}%</b><span className="small muted">{who(item.user_id)} · {catName(item.category_id)}</span></div>
                <button className="sm ghost" onClick={() => setRule(item)}>Ubah</button>
              </div>)}</div>
            )}
            <aside className={styles.notice}><NavIcon name="info" /><p><b>Bila beberapa aturan cocok, yang paling khusus dipakai.</b><br />Orang + kategori › orang › kategori › semua.</p></aside>
          </section>
          <div className={styles.metrics}>
            <CommissionMetric icon="coins" label="Total Komisi" value={rp(total)} />
            <CommissionMetric icon="/penghuni" label="Jumlah Kasir" value={angka(rows.length)} />
            <CommissionMetric icon="/laporan" label="Total Penjualan" value={rp(sales)} />
          </div>
        </div>
        <div className={styles.commissionContent}>
          <div className={styles.results}>
            <div className={styles.tabs} aria-label="Laporan komisi">
              {[['list', `Daftar Kasir (${rows.length})`, '/komisi'], ['performance', 'Performa', '/laporan'], ['history', 'Riwayat', '/shift']].map(([key, label, icon]) => (
                <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}><NavIcon name={icon} />{label}</button>
              ))}
            </div>
            <label className={styles.search}><NavIcon name="search" size={18} /><input aria-label="Cari kasir" type="search" placeholder="Cari kasir…" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            {tab === 'performance' && <p className={styles.caption}>Peringkat berdasarkan penjualan bersih pada periode ini.</p>}
            {tab === 'history' && <p className={styles.caption}>Komisi yang sudah dimasukkan ke penggajian pada periode ini.</p>}
            {visible.length === 0 ? <section className={styles.empty}>
              <h2>{needle ? 'Kasir tidak ditemukan' : tab === 'history' ? 'Belum ada komisi di penggajian' : 'Belum ada penjualan'}</h2>
              <p>{needle ? 'Coba nama atau akun kasir yang lain.' : tab === 'history' ? 'Pilih periode lain untuk memeriksa riwayat.' : 'Komisi dihitung dari penjualan selesai yang dicatat tiap kasir.'}</p>
            </section> : <div className={styles.cashiers}>{visible.map((item) => (
              <button key={item.user_id} className={styles.cashier} onClick={() => setSelected(item)}>
                <span className={styles.icon}>{tab === 'performance' ? item.rank : <NavIcon name="/akun" />}</span>
                <span className={styles.cashierCopy}>
                  <b>{who(item.user_id)}</b><small>Penjualan bersih {rp(item.basis)}</small>
                  {item.dibayar != null ? <small className={styles.tag}>Masuk penggajian · {rp(item.dibayar)}</small> :
                    !item.staff_id && <small className={styles.tag}>Belum ditautkan ke data karyawan <NavIcon name="info" size={13} /></small>}
                </span>
                <strong>{rp(tab === 'history' ? item.dibayar : item.komisi)}</strong><NavIcon name="next" size={16} />
              </button>
            ))}</div>}
            <aside className={styles.notice}><NavIcon name="info" /><p><b>Dasar perhitungan.</b> Penjualan selesai tanpa PPN, setelah diskon dan promo, dikurangi retur yang dicatat kasir itu. Penjualan batal tidak dilibatkan.</p></aside>
          </div>
          {(sdm || pending.length > 0) && <section className={styles.panel}>
            <div className={styles.panelHead}><span className={styles.icon}><NavIcon name="/sdm" /></span><h2>Penggajian</h2></div>
            <p className={styles.muted}>{pending.length ? `${angka(pending.length)} komisi belum dimasukkan. Pemilik meninjau dan menyetujui komisi sebelum ditambahkan ke draf gaji.` : 'Komisi yang dimasukkan akan tercatat di penggajian periode terkait.'}</p>
            <div className={styles.payrollActions}>
              {sdm && <Link href={`/sdm?tab=gaji&periode=${month}`}>Buka SDM &amp; Gaji</Link>}
              {owner && sdm && pending.length > 0 && <button onClick={() => setPayroll(true)}>Tinjau Komisi</button>}
            </div>
          </section>}
        </div>
        {selected && <Sheet title={who(selected.user_id)} onClose={() => setSelected(null)}>
          <dl className="kv"><dt>Periode</dt><dd>{bulan(month)}</dd><dt>Penjualan bersih</dt><dd>{rp(selected.basis)}</dd><dt>Komisi terhitung</dt><dd>{rp(selected.komisi)}</dd>
            {selected.dibayar != null && <><dt>Masuk penggajian</dt><dd>{rp(selected.dibayar)}</dd></>}</dl>
          {!selected.staff_id && <p>Akun ini belum ditautkan ke data karyawan.</p>}
          {sdm && <Link href={`/sdm?tab=gaji&periode=${month}`}>Buka SDM &amp; Gaji</Link>}
        </Sheet>}
        {payroll && owner && <Sheet title="Persetujuan Komisi" onClose={() => { if (!busy) setPayroll(false); }}>
          <p>Tinjau komisi {bulan(month)} yang belum dimasukkan. Sistem melewati akun yang belum tertaut ke draf gaji periode ini.</p>
          <dl className="kv">{pending.map((item) => <div key={item.user_id} className={styles.approvalRow}><dt>{who(item.user_id)}</dt><dd>{rp(item.komisi)}</dd></div>)}</dl>
          <p>Komisi ditambahkan sebagai bonus ke draf. Pembayaran dilakukan melalui penggajian.</p>
          <button className="primary" disabled={busy || !pending.length} onClick={toPayroll}>{busy ? 'Memproses…' : 'Setujui dan Masukkan ke Draf Gaji'}</button>
        </Sheet>}
        {rule && <RuleSheet kosId={kosId} rule={rule} names={names} cats={cats} onClose={() => setRule(null)} onSaved={() => { setRule(null); load(); }} />}
      </>}
    </div>
  );
}

function CommissionMetric({ icon, label, value }) {
  return <article className={styles.metric}><NavIcon name={icon} /><span>{label}</span><strong>{value}</strong></article>;
}

function RuleSheet({ kosId, rule, names, cats, onClose, onSaved }) {
  const [user, setUser] = useState(rule.user_id || '');
  const [cat, setCat] = useState(rule.category_id || '');
  const [rate, setRate] = useState(rule.rate != null ? String(rule.rate).replace('.', ',') : '');
  const save = async (del) => {
    const n = del ? 0 : Number(String(rate).replace(',', '.'));
    if (!del && !(n > 0 && n <= 50)) return toast('Isi persen komisi antara 0 dan 50.');
    if (await run(() => supabase.rpc('commission_rule_save', { p_kos: kosId, p_user: user || null, p_category: cat || null, p_rate: n }), del ? 'Aturan dihapus' : 'Aturan disimpan', errMsg)) onSaved();
  };
  return (
    <Sheet title={rule.id ? 'Ubah aturan komisi' : 'Aturan komisi baru'} onClose={onClose}>
      <Field label="Untuk"><select value={user} disabled={!!rule.id} onChange={(e) => setUser(e.target.value)}><option value="">Semua kasir</option>{Object.entries(names).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></Field>
      <Field label="Barang"><select value={cat} disabled={!!rule.id} onChange={(e) => setCat(e.target.value)}><option value="">Semua barang</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Komisi (% dari penjualan bersih)"><input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="mis. 1" /></Field>
      <button className="primary" onClick={() => save(false)}>Simpan</button>
      {rule.id && <button className="ghost" onClick={() => save(true)}>Hapus aturan</button>}
    </Sheet>
  );
}
