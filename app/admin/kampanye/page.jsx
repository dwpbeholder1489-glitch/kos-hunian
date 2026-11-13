'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Empty, Field, Loading, Sheet, toast } from '@/components/ui';
import { errMsg, rp } from '@/lib/format';
import { can } from '@/lib/admin';

const KONTEKS = { karyawan: 'Saat batas karyawan penuh', portal: 'Saat fitur portal dibuka', umum: 'Otomatis (penawaran umum)', aktivitas: 'Setelah kejadian di aplikasi' };
const PERISTIWA = { 'TRANSAKSI.PERTAMA': 'Setelah transaksi pertama', 'LAPORAN.DIBUKA': 'Saat halaman laporan dibuka' };
const JENIS = { upgrade: 'Upgrade paket', tahunan: 'Bulanan ke tahunan' };
const KOSONG = { id: '', name: '', context: 'karyawan', kind: 'upgrade', from_plan: 'dasar', to_plan: 'bisnis', trigger_event: 'LAPORAN.DIBUKA', title: '', message: '', cta: '', cta_secondary: 'Nanti saja', priority: 100, frequency_days: 7, general: false, active: true, starts_on: '', ends_on: '' };

// Kampanye pertumbuhan (V2 §13): ubah pesan, paket tujuan, frekuensi, dan masa aktif tanpa mengubah kode.
export default function Kampanye() {
  const { adminMe } = useKos();
  const isSuper = adminMe?.role === 'super_admin';
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [edit, setEdit] = useState(null);     // { baru: boolean, ...fields }
  const [busy, setBusy] = useState(false);
  const muat = () => supabase.rpc('growth_rules_list').then(({ data, error }) => (error ? setErr(errMsg(error)) : setD(data)));
  useEffect(() => { if (can(adminMe, 'finance.view')) muat(); }, [adminMe]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!can(adminMe, 'finance.view')) return <Empty title="Tidak punya izin melihat kampanye" />;
  if (err) return <div className="notice bad">{err}</div>;
  if (!d) return <Loading />;

  const bukaUbah = (r) => setEdit({ baru: false, ...r, starts_on: r.starts_on || '', ends_on: r.ends_on || '' });
  const bukaBaru = () => setEdit({ ...KOSONG, baru: true });
  const simpan = async (data, id, pesan) => {
    setBusy(true);
    const { error } = await supabase.rpc('growth_rule_save', { p_id: id, p_data: data });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(pesan); muat();
    return true;
  };
  const simpanForm = async () => {
    const f = edit;
    const data = {
      name: f.name, context: f.context, kind: f.kind, from_plan: f.from_plan, to_plan: f.to_plan,
      trigger_event: f.context === 'aktivitas' ? (f.trigger_event || 'LAPORAN.DIBUKA') : null,
      to_months: f.kind === 'tahunan' ? 12 : 1, title: f.title, message: f.message, cta: f.cta, cta_secondary: f.cta_secondary,
      priority: Number(f.priority) || 100, frequency_days: Number(f.frequency_days) || 7, general: !!f.general, active: !!f.active,
      starts_on: f.starts_on || null, ends_on: f.ends_on || null,
    };
    if (await simpan(data, f.id.trim().toUpperCase(), f.baru ? 'Kampanye dibuat' : 'Kampanye disimpan')) setEdit(null);
  };
  const ubahAktif = (r) => simpan({ active: !r.active }, r.id, r.active ? 'Kampanye dinonaktifkan' : 'Kampanye diaktifkan');

  const paket = d.paket || [];
  const nama = (k) => paket.find((p) => p.key === k)?.name || k;

  return (
    <div className="stack">
      <div className="row"><h2>Kampanye</h2><PageHelp page="admin-kampanye" /></div>
      <p className="small muted" style={{ margin: 0 }}>Penawaran upgrade untuk pemilik bisnis. Setiap perubahan tercatat di Catatan audit. Harga tidak diatur di sini: harga mengikuti Paket & harga.</p>
      {isSuper && <button className="primary" onClick={bukaBaru}>+ Kampanye baru</button>}
      {!isSuper && <span className="small muted">Hanya Super Admin yang bisa mengubah kampanye. Anda hanya bisa melihat.</span>}

      <section className="panel">
        <div className="list">{d.aturan.map((r) => (
          <div key={r.id} className="li" style={{ alignItems: 'flex-start' }}>
            <div className="main">
              <b>{r.name}</b>
              <span className="small muted">{r.id}</span>
              <span className="small">{KONTEKS[r.context]}{r.trigger_event ? ` (${PERISTIWA[r.trigger_event] || r.trigger_event})` : ''} · {JENIS[r.kind]} · {nama(r.from_plan)} → {nama(r.to_plan)}{r.to_months === 12 ? ' (12 bulan)' : ''}</span>
              <span className="small">Frekuensi: tiap {r.frequency_days} hari{r.general ? ' · ikut batas pop-up umum 7 hari' : ''}</span>
              {(r.starts_on || r.ends_on) && <span className="small muted">Periode: {r.starts_on || '…'} s/d {r.ends_on || 'tanpa akhir'}</span>}
              {isSuper && <div className="row" style={{ marginTop: 6, flexWrap: 'wrap' }}>
                <button className="sm ghost" onClick={() => bukaUbah(r)}>Ubah</button>
                <button className="sm ghost" disabled={busy} onClick={() => ubahAktif(r)}>{r.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
              </div>}
            </div>
            <span className={'chip ' + (r.active ? 'good' : 'void')}>{r.active ? 'Aktif' : 'Nonaktif'}</span>
          </div>
        ))}</div>
      </section>

      {edit && (
        <Sheet title={edit.baru ? 'Kampanye baru' : 'Ubah kampanye'} onClose={() => setEdit(null)}>
          {edit.baru && <Field label="ID kampanye" hint="Huruf besar, angka, titik, atau garis bawah. Contoh: UPGRADE.PROMO.AKHIR_TAHUN"><input value={edit.id} onChange={(e) => setEdit({ ...edit, id: e.target.value })} /></Field>}
          {!edit.baru && <span className="small muted">ID: {edit.id}</span>}
          <Field label="Nama internal"><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Kapan ditawarkan">
            <select value={edit.context} onChange={(e) => setEdit({ ...edit, context: e.target.value })}>{Object.entries(KONTEKS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </Field>
          {edit.context === 'aktivitas' && <Field label="Peristiwa" hint="Penawaran muncul setelah kejadian ini">
            <select value={edit.trigger_event || 'LAPORAN.DIBUKA'} onChange={(e) => setEdit({ ...edit, trigger_event: e.target.value })}>{Object.entries(PERISTIWA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </Field>}
          <Field label="Jenis">
            <select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value, to_plan: e.target.value === 'tahunan' ? edit.from_plan : edit.to_plan })}>{Object.entries(JENIS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </Field>
          <div className="row" style={{ gap: 8 }}>
            <Field label="Paket asal"><select value={edit.from_plan} onChange={(e) => setEdit({ ...edit, from_plan: e.target.value })}>{paket.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</select></Field>
            <Field label="Paket tujuan"><select value={edit.to_plan} disabled={edit.kind === 'tahunan'} onChange={(e) => setEdit({ ...edit, to_plan: e.target.value })}>{paket.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</select></Field>
          </div>
          <Field label="Judul"><input value={edit.title} maxLength={80} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
          <Field label="Pesan"><textarea rows={3} value={edit.message} maxLength={400} onChange={(e) => setEdit({ ...edit, message: e.target.value })} /></Field>
          <div className="row" style={{ gap: 8 }}>
            <Field label="Tombol utama"><input value={edit.cta} maxLength={40} onChange={(e) => setEdit({ ...edit, cta: e.target.value })} /></Field>
            <Field label="Tombol kedua"><input value={edit.cta_secondary} maxLength={40} onChange={(e) => setEdit({ ...edit, cta_secondary: e.target.value })} /></Field>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Field label="Frekuensi (hari)" hint="1–90"><input type="number" min={1} max={90} value={edit.frequency_days} onChange={(e) => setEdit({ ...edit, frequency_days: e.target.value })} /></Field>
            <Field label="Prioritas" hint="Angka kecil tampil lebih dulu"><input type="number" value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: e.target.value })} /></Field>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Field label="Mulai"><input type="date" value={edit.starts_on} onChange={(e) => setEdit({ ...edit, starts_on: e.target.value })} /></Field>
            <Field label="Berakhir"><input type="date" value={edit.ends_on} onChange={(e) => setEdit({ ...edit, ends_on: e.target.value })} /></Field>
          </div>
          <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={!!edit.general} onChange={(e) => setEdit({ ...edit, general: e.target.checked })} /> Ikut batas pop-up umum (maks. satu tiap 7 hari)</label>
          <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={!!edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Aktif</label>

          <span className="label">Pratinjau sebelum diaktifkan</span>
          <Pratinjau edit={edit} harga={d.harga || {}} nama={nama} />

          <button className="cta" style={{ width: '100%' }} disabled={busy} onClick={simpanForm}>{busy ? 'Menyimpan…' : 'Simpan kampanye'}</button>
          <span className="small muted">Perubahan langsung berlaku bagi pemilik yang memenuhi syarat. Pastikan pratinjau sudah benar.</span>
        </Sheet>
      )}
    </div>
  );
}

// Pratinjau desktop dan mobile dari isian yang sedang diedit (harga dari paket yang berlaku sekarang)
function Pratinjau({ edit, harga, nama }) {
  const h = harga[edit.to_plan] || {};
  const tahunan = edit.kind === 'tahunan';
  const harganya = tahunan ? h.tahunan : h.bulan;
  const normal = tahunan ? h.tahunan_normal : h.bulan_normal;
  const kartu = (
    <div className="tile" style={{ borderColor: 'var(--gold)', borderWidth: 2, maxWidth: 360 }}>
      <span className="label">{edit.title || 'Judul penawaran'}</span>
      <span className="small">{edit.message || 'Pesan penawaran'}</span>
      <span className="small muted">Paket {nama(edit.from_plan)} → {nama(edit.to_plan)}</span>
      <span className="v">{harganya != null ? rp(harganya) : '—'}<span className="small muted">{tahunan ? ' /tahun' : ' /bulan'}</span></span>
      {normal != null && normal > harganya && <span className="small"><s>{rp(normal)}</s></span>}
      <button className="cta" style={{ width: '100%' }}>{edit.cta || 'Tombol utama'}</button>
      <button className="ghost" style={{ width: '100%' }}>{edit.cta_secondary || 'Nanti saja'}</button>
    </div>
  );
  return (
    <div className="stack" style={{ gap: 12 }}>
      <span className="small muted">Desktop</span>
      <div style={{ padding: 12, border: '1px dashed var(--line, #ddd)', borderRadius: 12 }}>{kartu}</div>
      <span className="small muted">Mobile (bottom sheet)</span>
      <div style={{ padding: 12, border: '1px dashed var(--line, #ddd)', borderRadius: 16, maxWidth: 320, margin: '0 auto' }}>
        <div style={{ borderRadius: '16px 16px 0 0', background: 'var(--card, #fff)', padding: 12, boxShadow: '0 -4px 14px rgba(0,0,0,.08)' }}>
          <div style={{ width: 36, height: 4, borderRadius: 4, background: 'var(--line, #ccc)', margin: '0 auto 10px' }} />
          {kartu}
        </div>
      </div>
    </div>
  );
}
