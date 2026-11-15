'use client';
// Komisi kasir. Server: commission_rule_save (aturan), commission_report (hitung), commission_to_payroll (masukkan ke draf gaji sebagai bonus).
// Dasar komisi = penjualan bersih yang dicatat kasir itu (tanpa PPN, setelah diskon & retur). Dibayar lewat Gaji agar kas & jurnal satu pintu.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Field, Loading, Empty, Tile, Sheet, run, toast } from '@/components/ui';
import { rp, angka, errMsg, today } from '@/lib/format';

const bulanIni = () => today().slice(0, 7);
const range = (m) => { const [y, mo] = m.split('-').map(Number); const last = new Date(Date.UTC(y, mo, 0)).getUTCDate(); return [`${m}-01`, `${m}-${String(last).padStart(2, '0')}`]; };

export default function Komisi() {
  const { kosId, ver } = useKos();
  const [month, setMonth] = useState(bulanIni());
  const [r, setR] = useState(null);
  const [cats, setCats] = useState([]);
  const [names, setNames] = useState({});
  const [err, setErr] = useState(null);
  const [rule, setRule] = useState(null);   // null | {} baru | aturan
  const load = async () => {
    const [a, b] = range(month);
    const x = await supabase.rpc('commission_report', { p_kos: kosId, p_from: a, p_to: b });
    if (x.error) return setErr(errMsg(x.error));
    setErr(null); setR(x.data);
  };
  useEffect(() => { load(); }, [kosId, ver, month]);
  useEffect(() => {
    supabase.rpc('member_names', { p_kos: kosId }).then(({ data }) => setNames(data || {}));
    supabase.from('product_categories').select('id,name').eq('kos_id', kosId).order('name').then(({ data }) => setCats(data || []));
  }, [kosId]);
  if (err) return <div className="notice bad">{err.includes('commission') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!r) return <Loading />;
  const who = (u) => (u ? names[u] || 'karyawan lama' : 'Semua kasir');
  const catName = (c) => (c ? cats.find((x) => x.id === c)?.name || 'kategori dihapus' : 'semua barang');
  const total = r.rows.reduce((s, x) => s + Number(x.komisi), 0);
  const belum = r.rows.filter((x) => Number(x.komisi) > 0 && x.dibayar == null);
  const toPayroll = async () => {
    const { data: out, error } = await supabase.rpc('commission_to_payroll', { p_kos: kosId, p_month: `${month}-01` });
    if (error) return toast(errMsg(error));
    const sk = out.dilewati || [];
    toast(`${out.masuk} komisi masuk ke draf gaji${sk.length ? ` · ${sk.length} dilewati: ${sk.map((s) => `${who(s.user_id)} (${s.alasan})`).join('; ')}` : ''}`);
    load();
  };
  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Komisi kasir</h2><PageHelp page="komisi" /></div></div>
      <Field label="Bulan"><input type="month" value={month} max={bulanIni()} onChange={(e) => e.target.value && setMonth(e.target.value)} /></Field>

      <section className="panel">
        <div className="row between"><h3>Aturan komisi</h3><button className="sm" onClick={() => setRule({})}>+ Aturan</button></div>
        {r.rules.length === 0 ? <span className="small muted">Belum ada aturan. Contoh: semua kasir 1% dari penjualan, atau kategori Rokok 0,5%.</span> : (
          <div className="list">{r.rules.map((x) => (
            <div className="li" key={x.id}>
              <div className="main"><b>{angka(x.rate)}%</b><span className="small muted">{who(x.user_id)} · {catName(x.category_id)}</span></div>
              <button className="sm ghost" onClick={() => setRule(x)}>Ubah</button>
            </div>))}</div>)}
        <span className="small muted">Bila beberapa aturan cocok, yang paling khusus dipakai: orang + kategori › orang › kategori › semua.</span>
      </section>

      <div className="grid"><Tile label="Total komisi" value={rp(total)} /><Tile label="Kasir" value={angka(r.rows.length)} /></div>
      {r.rows.length === 0 ? <Empty title="Belum ada penjualan" text="Komisi dihitung dari penjualan selesai yang dicatat tiap kasir di bulan ini." /> : (
        <section className="panel"><div className="list">{r.rows.map((x) => (
          <div className="li" key={x.user_id}>
            <div className="main">
              <b>{who(x.user_id)}</b>
              <span className="small muted">Penjualan bersih {rp(x.basis)}{x.staff_id ? '' : ' · belum ditautkan ke data karyawan'}</span>
              {x.dibayar != null && <span className="small" style={{ color: 'var(--good)' }}>Sudah dimasukkan ke gaji: {rp(x.dibayar)}</span>}
            </div>
            <b>{rp(x.komisi)}</b>
          </div>))}</div></section>)}
      {belum.length > 0 && <section className="panel">
        <span className="small">Komisi dibayar bersama gaji (sebagai bonus) agar uang keluar tercatat sekali. Buat dulu <b>draf gaji</b> bulan ini di <Link href="/sdm">SDM & gaji</Link>, lalu ketuk tombol di bawah. Karyawan yang akunnya belum ditautkan di data karyawan akan dilewati.</span>
        <button className="primary" onClick={toPayroll}>Masukkan komisi ke draf gaji</button>
      </section>}
      <span className="small muted">Dasar: penjualan selesai tanpa PPN, setelah diskon & promo, dikurangi retur yang dicatat kasir itu. Penjualan batal tidak dihitung.</span>
      {rule && <RuleSheet kosId={kosId} rule={rule} names={names} cats={cats} onClose={() => setRule(null)} onSaved={() => { setRule(null); load(); }} />}
    </div>
  );
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
