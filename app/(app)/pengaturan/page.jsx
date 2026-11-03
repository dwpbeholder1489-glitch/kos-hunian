'use client';
import PageHelp from '@/components/PageHelp';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { useData } from '@/lib/useData';
import { Field, Loading, run, toast } from '@/components/ui';
import { KIND, errMsg } from '@/lib/format';

export default function Pengaturan() {
  const router = useRouter();
  const d = useData();
  const { kos, user, loadKos, bump } = useKos();
  const [name, setName] = useState(kos?.name || '');
  const [addr, setAddr] = useState(kos?.address || '');
  const [phone, setPhone] = useState(kos?.contact_phone || '');
  const [payInfo, setPayInfo] = useState(kos?.payment_info || '');
  const [rules, setRules] = useState(kos?.house_rules || '');
  const [notify, setNotify] = useState(kos?.notify_email !== false);
  const [digest, setDigest] = useState(kos?.daily_digest !== false);
  const [sending, setSending] = useState(false);
  const [cName, setCName] = useState('');
  const [cKind, setCKind] = useState('operasional');
  if (!d.ready || !kos) return <Loading />;
  const isOwner = kos.owner_id === user?.id;

  async function saveKos() {
    if (!name.trim()) return run(() => { throw new Error('Nama kos wajib diisi.'); });
    if (await run(() => supabase.from('kos').update({ name: name.trim(), address: addr.trim() || null }).eq('id', kos.id), 'Profil kos disimpan', errMsg)) loadKos();
  }
  async function sendNow() {
    setSending(true);
    try {
      const { data: ses } = await supabase.auth.getSession();
      const r = await fetch('/api/reminders/now', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + ses.session?.access_token }, body: JSON.stringify({ kosId: kos.id }) });
      const x = await r.json();
      toast(!r.ok ? (x.error || 'Gagal mengirim') : x.empty ? 'Tidak ada tagihan yang jatuh tempo 3 hari ke depan atau telat. Tidak ada yang dikirim.' : x.digests ? `Daftar tagih dikirim ke ${user?.email}` : 'Fitur ini butuh paket Standar.');
    } catch { toast('Gagal terhubung'); }
    setSending(false);
  }
  async function saveInfo() {
    if (await run(() => supabase.from('kos').update({ contact_phone: phone.trim() || null, payment_info: payInfo.trim() || null, house_rules: rules.trim() || null, ...(kos.notify_email !== undefined ? { notify_email: notify } : {}), ...(kos.daily_digest !== undefined ? { daily_digest: digest } : {}) }).eq('id', kos.id), 'Info penghuni disimpan', errMsg)) loadKos();
  }
  async function addCat() {
    if (!cName.trim()) return;
    if (await run(() => supabase.from('expense_categories').insert({ kos_id: kos.id, name: cName.trim(), kind: cKind }), 'Kategori ditambahkan', errMsg)) { setCName(''); bump(); }
  }
  async function delCat(c) {
    if (!confirm(`Hapus kategori "${c.name}"? Pengeluaran lama tetap ada, tapi tanpa kategori.`)) return;
    if (await run(() => supabase.from('expense_categories').delete().eq('id', c.id), 'Kategori dihapus', errMsg)) bump();
  }
  async function logout() { await supabase.auth.signOut(); router.replace('/masuk'); }

  return (
    <div className="stack">
      <div className="row"><h2>Pengaturan</h2><PageHelp page="pengaturan" /></div>
      <section className="panel"><h3>Profil kos</h3>
        <Field label="Nama kos"><input value={name} onChange={(e) => setName(e.target.value)} disabled={!isOwner} /></Field>
        <Field label="Alamat"><input value={addr} onChange={(e) => setAddr(e.target.value)} disabled={!isOwner} /></Field>
        {isOwner && <button className="primary" onClick={saveKos}>Simpan</button>}
      </section>
      {isOwner && <section className="panel"><h3>Info untuk penghuni</h3>
        <p className="small muted" style={{ margin: 0 }}>Tampil di portal penghuni dan dipakai asisten untuk menjawab pertanyaan. Kosongkan jika belum ada.</p>
        <Field label="No. WhatsApp pengelola"><input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08…" /></Field>
        <Field label="Cara bayar" hint="Nomor rekening, e-wallet, atau QRIS, dan batas waktu bayar"><textarea value={payInfo} onChange={(e) => setPayInfo(e.target.value)} placeholder={'Transfer ke BRI 1234-5678 a.n. Nama Pemilik\nPaling lambat tanggal jatuh tempo'} /></Field>
        <Field label="Peraturan kos" hint="Jam malam, tamu, kebersihan, parkir, dll."><textarea value={rules} onChange={(e) => setRules(e.target.value)} placeholder={'Jam malam 22.00\nTamu lawan jenis hanya di ruang tamu'} style={{ minHeight: 110 }} /></Field>
        {kos.notify_email !== undefined && <label className="row small" style={{ fontWeight: 700 }}><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Kirim email ke {user?.email} saat penghuni mengirim bukti transfer</label>}
        {kos.daily_digest !== undefined && <label className="row small" style={{ fontWeight: 700 }}><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={digest} onChange={(e) => setDigest(e.target.checked)} /> Kirim daftar tagih setiap pagi ke {user?.email} (paket Standar)</label>}
        <button className="primary" onClick={saveInfo}>Simpan info</button>
        {kos.daily_digest !== undefined && <button onClick={sendNow} disabled={sending}>{sending ? 'Mengirim…' : 'Kirim daftar tagih sekarang (uji)'}</button>}
      </section>}
      <section className="panel"><h3>Kategori pengeluaran</h3>
        <div className="list">{d.categories.map((c) => (
          <div className="li" key={c.id}><div className="main"><b>{c.name}</b><span className="small muted">{KIND[c.kind]}</span></div><button className="sm ghost danger" onClick={() => delCat(c)}>Hapus</button></div>
        ))}</div>
        <div className="row">
          <Field label="Kategori baru"><input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="mis. Gaji penjaga" /></Field>
          <Field label="Jenis"><select value={cKind} onChange={(e) => setCKind(e.target.value)}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        </div>
        <button onClick={addCat}>Tambah kategori</button>
      </section>
      <section className="panel"><h3>Akun</h3>
        <p className="small muted" style={{ margin: 0 }}>Masuk sebagai {user?.email}</p>
        <div className="row">
          <button onClick={() => router.push('/mulai')}>+ Tambah kos lain</button>
          <button className="danger" onClick={logout}>Keluar</button>
        </div>
      </section>
    </div>
  );
}
