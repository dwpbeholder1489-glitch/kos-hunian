'use client';
// Aset tetap & penyusutan. Server: asset_list, asset_save, asset_dispose, asset_dispose_undo, asset_delete, asset_schedule.
// Penyusutan dihitung server tiap bulan yang sudah lewat dan otomatis masuk Pembukuan (bukan uang keluar).
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { useBaru } from '@/lib/useBaru';
import { Sheet, Field, Loading, Empty, Tile, run, toast } from '@/components/ui';
import { rp, angka, parseRp, tgl, today, errMsg } from '@/lib/format';

const LI = { background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, textAlign: 'left', width: '100%', font: 'inherit', color: 'inherit' };
const KATEGORI = ['Kendaraan', 'Mesin', 'Peralatan', 'Elektronik', 'Perabot', 'Bangunan', 'Tanah', 'Lainnya'];
const UMUR = [['12', '1 tahun'], ['24', '2 tahun'], ['48', '4 tahun'], ['96', '8 tahun'], ['240', '20 tahun']];
const LEPAS = { dijual: 'Dijual', dibuang: 'Dibuang / rusak', hilang: 'Hilang' };
const bulanNama = (iso) => new Date(iso + 'T12:00:00+07:00').toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', month: 'short', year: 'numeric' });
const umurTeks = (m) => (m == null ? 'tidak disusutkan' : m % 12 === 0 ? `${m / 12} tahun` : `${m} bulan`);

export default function Aset() {
  const { kosId, ver } = useKos();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState(null);   // null | {} | {expense} | asset (ubah)
  const [open, setOpen] = useState(null);
  const [f, setF] = useState('aktif');
  useBaru(() => setForm({}));
  const load = () => supabase.rpc('asset_list', { p_kos: kosId }).then(({ data, error }) => (error ? setErr(errMsg(error)) : (setErr(null), setD(data))));
  useEffect(() => { load(); }, [kosId, ver]);
  if (err) return <div className="notice bad">{/asset_list/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;
  const shown = d.assets.filter((a) => a.status === (f === 'aktif' ? 'aktif' : 'dilepas'));
  const nLepas = d.assets.filter((a) => a.status === 'dilepas').length;
  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Aset tetap</h2><PageHelp page="aset" /></div><button className="primary" onClick={() => setForm({})}>+ Tambah aset</button></div>
      <div className="grid">
        <Tile label="Nilai buku sekarang" value={rp(d.total_book)} sub={`harga perolehan ${rp(d.total_cost)}`} />
        <Tile label="Sudah disusutkan" value={rp(d.total_accumulated)} sub="akumulasi penyusutan" />
        <Tile label="Penyusutan per bulan" value={rp(d.monthly)} sub="beban, bukan uang keluar" />
      </div>
      {d.candidates.length > 0 && <section className="panel" style={{ gap: 6 }}>
        <span className="label">Pengeluaran modal yang belum dicatat sebagai aset</span>
        <div className="list">{d.candidates.slice(0, 5).map((e) => (
          <div className="li" key={e.id}><div className="main"><b className="small">{e.description || 'Pengeluaran modal'}</b><span className="small muted">{tgl(e.date)} · {rp(e.amount)}</span></div>
            <button className="sm" onClick={() => setForm({ expense: e })}>Jadikan aset</button></div>
        ))}</div>
        <span className="small muted">Aset yang dicatat di sini disusutkan otomatis, sehingga laba di Pembukuan lebih wajar.</span>
      </section>}
      {d.assets.length === 0 ? (
        <Empty title="Belum ada aset" text="Catat barang yang dipakai usaha bertahun-tahun: motor, kulkas, mesin, etalase, komputer, bangunan. Nilainya dibagi rata per bulan (penyusutan) dan masuk Pembukuan otomatis.">
          <button className="primary" onClick={() => setForm({})}>+ Tambah aset pertama</button>
        </Empty>
      ) : <>
        {nLepas > 0 && <div className="seg">{[['aktif', `Dipakai (${d.assets.length - nLepas})`], ['lepas', `Sudah dilepas (${nLepas})`]].map(([k, l]) => <button key={k} className={f === k ? 'on' : ''} onClick={() => setF(k)}>{l}</button>)}</div>}
        {shown.length === 0 ? <Empty title="Tidak ada" /> : <section className="panel"><div className="list">{shown.map((a) => (
          <button key={a.id} className="li click" style={LI} onClick={() => setOpen(a)}>
            <div className="main"><b>{a.name}</b>
              <span className="small muted">{a.category ? `${a.category} · ` : ''}{tgl(a.start_date)} · {rp(a.cost)} · {umurTeks(a.life_months)}</span>
              {a.status === 'aktif' ? (a.life_months != null && <span className="small">{a.months_left > 0 ? <>susut {rp(a.monthly)}/bulan · sisa {a.months_left} bulan</> : <span className="muted">sudah habis disusutkan</span>}</span>)
                : <span className="small">{LEPAS[a.disposal_kind]} {tgl(a.disposed_date)}{Number(a.disposal_amount) > 0 ? ` · ${rp(a.disposal_amount)}` : ''}</span>}
            </div>
            <div style={{ textAlign: 'right', flex: 'none' }}><b style={{ whiteSpace: 'nowrap' }}>{rp(a.status === 'aktif' ? a.book_value : a.disposal_amount || 0)}</b><div className="small muted">{a.status === 'aktif' ? 'nilai buku' : Number(a.gain) >= 0 ? `untung ${rp(a.gain)}` : `rugi ${rp(-a.gain)}`}</div></div>
          </button>
        ))}</div></section>}
      </>}
      <span className="small muted">Penyusutan dicatat tiap akhir bulan yang sudah lewat dan tampil di Pembukuan (Beban penyusutan) serta Analisis bisnis. Saldo kas tidak berubah karena uangnya sudah keluar saat membeli.</span>
      {form && <AssetForm kosId={kosId} init={form} onClose={() => setForm(null)} onDone={() => { setForm(null); setOpen(null); load(); }} />}
      {open && <Detail a={open} onClose={() => setOpen(null)} onEdit={() => { setForm(open); setOpen(null); }} onDone={() => { setOpen(null); load(); }} />}
    </div>
  );
}

function AssetForm({ kosId, init, onClose, onDone }) {
  const edit = init.id ? init : null;
  const exp = init.expense || null;
  const [mode, setMode] = useState(edit ? (edit.source === 'awal' ? 'awal' : 'beli') : exp ? 'tautkan' : 'beli');
  const [f, setF] = useState({ name: edit?.name || (exp?.description || '').replace(/^Beli aset · /, ''), category: edit?.category || '', date: edit?.start_date || today(), cost: edit ? angka(edit.cost) : '',
    account: 'kas', salvage: edit && Number(edit.salvage) > 0 ? angka(edit.salvage) : '', life: edit ? (edit.life_months == null ? '' : String(edit.life_months)) : '', susut: edit ? edit.life_months != null : true, note: edit?.note || '' });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const costN = exp ? Number(exp.amount) : edit && edit.source !== 'awal' ? Number(edit.cost) : parseRp(f.cost) || 0;
  const salv = parseRp(f.salvage) || 0;
  const lifeN = f.susut ? parseInt(f.life, 10) || 0 : 0;
  const monthly = lifeN > 0 && costN > salv ? Math.round((costN - salv) / lifeN) : 0;
  const lockValue = Boolean(exp) || (edit && edit.source !== 'awal');
  const save = async () => {
    if (f.name.trim().length < 2) return toast('Isi nama aset.');
    if (!lockValue && !(costN > 0)) return toast(mode === 'awal' ? 'Isi perkiraan nilai aset saat ini.' : 'Isi harga beli aset.');
    if (f.susut && !(lifeN > 0)) return toast('Isi umur manfaat (berapa lama aset dipakai).');
    if (salv >= costN) return toast('Nilai sisa harus lebih kecil dari nilai aset.');
    setBusy(true);
    const p = { name: f.name, category: f.category || null, mode, expense_id: exp?.id || null, date: f.date || null, cost: lockValue ? null : costN, account: f.account, salvage: salv, life_months: f.susut ? lifeN : null, note: f.note };
    const ok = await run(() => supabase.rpc('asset_save', { p_kos: kosId, p_id: edit?.id || null, p }), edit ? 'Aset diperbarui' : 'Aset dicatat', errMsg);
    setBusy(false);
    if (ok) onDone();
  };
  return (
    <Sheet title={edit ? `Ubah · ${edit.name}` : exp ? 'Jadikan aset' : 'Tambah aset'} onClose={onClose}>
      {!edit && !exp && <div className="seg">{[['beli', 'Baru dibeli'], ['awal', 'Sudah dimiliki']].map(([k, l]) => <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>)}</div>}
      {!edit && !exp && <span className="small muted">{mode === 'beli' ? 'Pembelian dicatat sebagai pengeluaran modal (uang keluar dari kas/bank), bukan biaya bulan ini.' : 'Untuk aset yang sudah ada sebelum memakai PRASARA. Isi perkiraan nilainya sekarang dan sisa umur pakainya — tidak ada uang keluar.'}</span>}
      {exp && <div className="notice">Dari pengeluaran {tgl(exp.date)} · <b>{rp(exp.amount)}</b>. Nilai & tanggal mengikuti pengeluaran itu.</div>}
      <Field label="Nama aset"><input value={f.name} maxLength={100} onChange={(e) => set('name', e.target.value)} placeholder="mis. Motor pengantar, Kulkas showcase" /></Field>
      <Field label="Jenis (opsional)"><select value={f.category} onChange={(e) => set('category', e.target.value)}><option value="">— pilih —</option>{KATEGORI.map((k) => <option key={k} value={k}>{k}</option>)}{f.category && !KATEGORI.includes(f.category) && <option value={f.category}>{f.category}</option>}</select></Field>
      {!lockValue && <div className="row">
        <Field label={mode === 'awal' ? 'Nilai saat ini' : 'Harga beli'}><input inputMode="numeric" value={f.cost} onChange={(e) => set('cost', e.target.value)} placeholder="mis. 12.000.000" /></Field>
        <Field label={mode === 'awal' ? 'Dicatat mulai' : 'Tanggal beli'}><input type="date" value={f.date} max={today()} onChange={(e) => set('date', e.target.value)} /></Field>
      </div>}
      {!edit && mode === 'beli' && <Field label="Dibayar dari"><select value={f.account} onChange={(e) => set('account', e.target.value)}><option value="kas">Kas</option><option value="bank">Bank</option></select></Field>}
      <label className="row small" style={{ flexWrap: 'nowrap', fontWeight: 700 }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={f.susut} onChange={(e) => set('susut', e.target.checked)} />Disusutkan tiap bulan (hapus centang untuk tanah)</label>
      {f.susut && <>
        <Field label={mode === 'awal' ? 'Sisa umur pakai (bulan)' : 'Umur manfaat (bulan)'} hint="perkiraan berapa lama aset dipakai usaha"><input inputMode="numeric" value={f.life} onChange={(e) => set('life', e.target.value.replace(/\D/g, ''))} /></Field>
        <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{UMUR.map(([v, l]) => <button key={v} className={'sm' + (f.life === v ? ' primary' : '')} onClick={() => set('life', v)}>{l}</button>)}</div>
        <Field label="Perkiraan nilai sisa (opsional)" hint="harga jual kembali di akhir umur pakai; kosong = 0"><input inputMode="numeric" value={f.salvage} onChange={(e) => set('salvage', e.target.value)} placeholder="0" /></Field>
        {monthly > 0 && <p className="small" style={{ margin: 0 }}>Penyusutan: <b>{rp(monthly)} per bulan</b> selama {umurTeks(lifeN)}{salv > 0 ? ` (dari ${rp(costN)} − sisa ${rp(salv)})` : ''}.</p>}
      </>}
      <Field label="Catatan (opsional)"><input value={f.note} maxLength={300} onChange={(e) => set('note', e.target.value)} placeholder="mis. nomor polisi, nomor seri, lokasi" /></Field>
      <button className="cta" disabled={busy} onClick={save}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
      {edit && edit.source !== 'awal' && <span className="small muted">Harga & tanggal beli mengikuti pengeluarannya ({rp(edit.cost)}, {tgl(edit.start_date)}). Mengubah umur/nilai sisa otomatis mengoreksi jurnal penyusutan.</span>}
    </Sheet>
  );
}

function Detail({ a, onClose, onEdit, onDone }) {
  const [sch, setSch] = useState(null);
  const [mode, setMode] = useState(null);
  const [g, setG] = useState({ kind: 'dijual', amount: '', account: 'kas', date: today(), note: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { supabase.rpc('asset_schedule', { p_asset: a.id }).then(({ data }) => setSch(data || [])); }, [a.id]);
  const amt = g.kind === 'dijual' ? parseRp(g.amount) || 0 : 0;
  const selisih = amt - Number(a.book_value);
  const lepas = async () => {
    if (g.kind === 'dijual' && !(amt > 0)) return toast('Isi uang hasil penjualan.');
    setBusy(true);
    const ok = await run(() => supabase.rpc('asset_dispose', { p_asset: a.id, p: { kind: g.kind, amount: amt, account: g.account, date: g.date || null, note: g.note } }), 'Aset dilepas & tercatat', errMsg);
    setBusy(false); if (ok) onDone();
  };
  const batal = async () => { const r = window.prompt('Alasan membatalkan pelepasan aset ini:') || ''; if (r.trim().length < 3) return; if (await run(() => supabase.rpc('asset_dispose_undo', { p_asset: a.id, p_reason: r }), 'Pelepasan dibatalkan', errMsg)) onDone(); };
  const hapus = async () => { const r = window.prompt(`Alasan menghapus "${a.name}" dari daftar aset (salah catat):`) || ''; if (r.trim().length < 3) return; if (await run(() => supabase.rpc('asset_delete', { p_asset: a.id, p_reason: r }), 'Aset dihapus dari daftar', errMsg)) onDone(); };
  return (
    <Sheet title={a.name} onClose={onClose}>
      <span className={'chip ' + (a.status === 'aktif' ? 'good' : 'void')} style={{ alignSelf: 'flex-start' }}>{a.status === 'aktif' ? 'Dipakai' : `${LEPAS[a.disposal_kind]} ${tgl(a.disposed_date)}`}</span>
      <dl className="kv">
        {a.category && <><dt>Jenis</dt><dd>{a.category}</dd></>}
        <dt>{a.source === 'awal' ? 'Dicatat mulai' : 'Tanggal beli'}</dt><dd>{tgl(a.start_date)}</dd>
        <dt>{a.source === 'awal' ? 'Nilai awal' : 'Harga beli'}</dt><dd>{rp(a.cost)}</dd>
        <dt>Umur manfaat</dt><dd>{umurTeks(a.life_months)}{a.life_months != null ? ` · berjalan ${a.months_done} bulan` : ''}</dd>
        {Number(a.salvage) > 0 && <><dt>Nilai sisa</dt><dd>{rp(a.salvage)}</dd></>}
        <dt>Sudah disusutkan</dt><dd>{rp(a.accumulated)}</dd>
        <dt>Nilai buku</dt><dd><b>{rp(a.book_value)}</b></dd>
        {a.status === 'dilepas' && <><dt>Hasil pelepasan</dt><dd>{rp(a.disposal_amount || 0)} · {Number(a.gain) >= 0 ? `untung ${rp(a.gain)}` : `rugi ${rp(-a.gain)}`}</dd></>}
        {a.disposal_note && <><dt>Keterangan</dt><dd>{a.disposal_note}</dd></>}
        {a.note && <><dt>Catatan</dt><dd>{a.note}</dd></>}
      </dl>
      {a.status === 'aktif' ? <>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button onClick={onEdit}>Ubah</button>
          <button className={mode === 'lepas' ? 'primary' : ''} onClick={() => setMode(mode === 'lepas' ? null : 'lepas')}>Jual / lepas aset</button>
          <button className="ghost danger" onClick={hapus}>Hapus (salah catat)</button>
        </div>
        {mode === 'lepas' && <div className="unitbox">
          <div className="seg">{Object.entries(LEPAS).map(([k, l]) => <button key={k} className={g.kind === k ? 'on' : ''} onClick={() => setG({ ...g, kind: k })}>{l}</button>)}</div>
          <div className="row">
            {g.kind === 'dijual' && <Field label="Uang diterima"><input inputMode="numeric" value={g.amount} onChange={(e) => setG({ ...g, amount: e.target.value })} /></Field>}
            <Field label="Tanggal"><input type="date" value={g.date} max={today()} onChange={(e) => setG({ ...g, date: e.target.value })} /></Field>
          </div>
          {g.kind === 'dijual' && <Field label="Uang masuk ke"><select value={g.account} onChange={(e) => setG({ ...g, account: e.target.value })}><option value="kas">Kas</option><option value="bank">Bank</option></select></Field>}
          <Field label="Keterangan (opsional)"><input value={g.note} maxLength={300} onChange={(e) => setG({ ...g, note: e.target.value })} placeholder="mis. dijual ke Pak Budi" /></Field>
          <p className="small" style={{ margin: 0 }}>Nilai buku {rp(a.book_value)} → {selisih >= 0 ? <b style={{ color: 'var(--good)' }}>untung {rp(selisih)}</b> : <b style={{ color: 'var(--bad)' }}>rugi {rp(-selisih)}</b>} (masuk {selisih >= 0 ? 'Pendapatan lain' : 'Beban non-operasional'} di Pembukuan). Penyusutan berhenti.</p>
          <button className="primary" disabled={busy} onClick={lepas}>{busy ? 'Menyimpan…' : 'Simpan pelepasan'}</button>
        </div>}
      </> : <button className="ghost" onClick={batal}>Batalkan pelepasan (salah catat)</button>}
      {a.life_months != null && <>
        <span className="label">Riwayat penyusutan</span>
        {sch === null ? <p className="small muted" style={{ margin: 0 }}>Memuat…</p> : sch.length === 0 ? <p className="small muted" style={{ margin: 0 }}>Belum ada — penyusutan pertama dicatat setelah bulan perolehan berakhir.</p>
          : <div className="list">{sch.slice(0, 12).map((s) => <div className="li" key={s.period}><span className="small">{bulanNama(s.period)}</span><b className="small">{rp(s.amount)}</b></div>)}{sch.length > 12 && <span className="small muted">… dan {sch.length - 12} bulan sebelumnya</span>}</div>}
      </>}
    </Sheet>
  );
}
