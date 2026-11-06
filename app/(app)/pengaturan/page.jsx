'use client';
import PageHelp from '@/components/PageHelp';
import { useEffect, useRef, useState } from 'react';
import { TPL, MAX_TPL, fill } from '@/lib/templates';
import { compressImage } from '@/lib/image';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { useData } from '@/lib/useData';
import { Field, Loading, run, toast } from '@/components/ui';
import { KIND, errMsg } from '@/lib/format';
import { canArea } from '@/lib/business';
import { strukSample as strukPreview } from '@/lib/struk';
import DataTutup from '@/components/DataTutup';

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
  const [footer, setFooter] = useState(kos?.receipt_footer || '');
  if (!d.ready || !kos) return <Loading />;
  const isOwner = kos.owner_id === user?.id;
  const canEdit = canArea(kos, 'settings'); // pemilik & pengelola
  const retail = kos.business_type === 'retail';
  const noun = retail ? 'toko' : 'kos';

  async function saveKos() {
    if (!name.trim()) return run(() => { throw new Error(`Nama ${noun} wajib diisi.`); });
    const extra = retail ? { contact_phone: phone.trim() || null, ...(kos.receipt_footer !== undefined ? { receipt_footer: footer.trim() || null } : {}) } : {};
    if (await run(() => supabase.from('kos').update({ name: name.trim(), address: addr.trim() || null, ...extra }).eq('id', kos.id), `Profil ${noun} disimpan`, errMsg)) loadKos();
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
      <section className="panel"><h3>Profil {noun}</h3>
        <Field label={`Nama ${noun}`}><input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} /></Field>
        <Field label="Alamat"><input value={addr} onChange={(e) => setAddr(e.target.value)} disabled={!canEdit} /></Field>
        {retail && <>
          <Field label="No. WhatsApp toko" hint="tampil di struk"><input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08…" disabled={!canEdit} /></Field>
          {kos.receipt_footer !== undefined && <Field label="Tulisan di bawah struk" hint="maks 200 huruf"><textarea value={footer} maxLength={200} onChange={(e) => setFooter(e.target.value)} placeholder={'Terima kasih\nBarang yang sudah dibeli tidak dapat ditukar'} disabled={!canEdit} /></Field>}
          <pre className="struk" style={{ margin: 0 }}>{strukPreview({ ...kos, name: name || kos.name, address: addr, contact_phone: phone, receipt_footer: footer })}</pre>
        </>}
        {canEdit && <button className="primary" onClick={saveKos}>Simpan</button>}
      </section>
      {canEdit && !retail && <section className="panel"><h3>Info untuk penghuni</h3>
        <p className="small muted" style={{ margin: 0 }}>Tampil di portal penghuni dan dipakai asisten untuk menjawab pertanyaan. Kosongkan jika belum ada.</p>
        <Field label="No. WhatsApp pengelola"><input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08…" /></Field>
        <Field label="Cara bayar" hint="Nomor rekening, e-wallet, atau QRIS, dan batas waktu bayar"><textarea value={payInfo} onChange={(e) => setPayInfo(e.target.value)} placeholder={'Transfer ke BRI 1234-5678 a.n. Nama Pemilik\nPaling lambat tanggal jatuh tempo'} /></Field>
        <Field label="Peraturan kos" hint="Jam malam, tamu, kebersihan, parkir, dll."><textarea value={rules} onChange={(e) => setRules(e.target.value)} placeholder={'Jam malam 22.00\nTamu lawan jenis hanya di ruang tamu'} style={{ minHeight: 110 }} /></Field>
        {isOwner && kos.notify_email !== undefined && <label className="row small" style={{ fontWeight: 700 }}><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Kirim email ke {user?.email} saat penghuni mengirim bukti transfer</label>}
        {isOwner && kos.daily_digest !== undefined && <label className="row small" style={{ fontWeight: 700 }}><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={digest} onChange={(e) => setDigest(e.target.checked)} /> Kirim daftar tagih setiap pagi ke {user?.email} (paket Standar)</label>}
        <button className="primary" onClick={saveInfo}>Simpan info</button>
        <a href="/notifikasi" className="small">Atur ringkasan mingguan & bulanan di menu Notifikasi (lonceng) →</a>
        {kos.daily_digest !== undefined && <button onClick={sendNow} disabled={sending}>{sending ? 'Mengirim…' : 'Kirim daftar tagih sekarang (uji)'}</button>}
      </section>}
      {canEdit && !retail && <QrisBox kosId={kos.id} />}
      {canEdit && !retail && kos.wa_reminder_tpl !== undefined && <TemplateBox kos={kos} onSaved={loadKos} />}
      <section className="panel"><h3>{retail ? 'Jenis biaya' : 'Kategori pengeluaran'}</h3>
        <div className="list">{d.categories.map((c) => (
          <div className="li" key={c.id}><div className="main"><b>{c.name}</b><span className="small muted">{KIND[c.kind]}</span></div><button className="sm ghost danger" onClick={() => delCat(c)}>Hapus</button></div>
        ))}</div>
        <div className="row">
          <Field label="Kategori baru"><input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="mis. Gaji penjaga" /></Field>
          <Field label="Jenis"><select value={cKind} onChange={(e) => setCKind(e.target.value)}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        </div>
        <button onClick={addCat}>Tambah kategori</button>
      </section>
      {canArea(kos, 'team') && <DataTutup />}
      <section className="panel"><h3>Akun</h3>
        <p className="small muted" style={{ margin: 0 }}>Masuk sebagai {user?.email}</p>
        {isOwner && kos.onboarding_emails !== undefined && <label className="row small" style={{ fontWeight: 700 }}><input type="checkbox" style={{ width: 22, minHeight: 22 }} checked={kos.onboarding_emails}
          onChange={async (e) => { const v = e.target.checked; if (await run(() => supabase.from('kos').update({ onboarding_emails: v }).eq('id', kos.id), v ? 'Email arahan dinyalakan' : 'Email arahan dimatikan', errMsg)) loadKos(); }} /> Email arahan dari PRASARA selama masa coba (paling banyak 1 email tiap 2 hari)</label>}
        <div className="row">
          <button onClick={() => router.push('/mulai')}>+ Tambah bisnis lain</button>
          <button className="danger" onClick={logout}>Keluar</button>
        </div>
      </section>
    </div>
  );
}

function QrisBox({ kosId }) {
  const [img, setImg] = useState(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    supabase.from('kos').select('qris_image').eq('id', kosId).maybeSingle()
      .then(({ data, error }) => setImg(error ? null : data?.qris_image || null));
  }, [kosId]);
  async function save(v) {
    setBusy(true);
    const ok = await run(() => supabase.from('kos').update({ qris_image: v }).eq('id', kosId), v ? 'QRIS disimpan' : 'QRIS dihapus', errMsg);
    setBusy(false);
    if (ok) setImg(v);
  }
  async function pick(e) {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try { await save(await compressImage(f, 1100, 0.9)); } catch (er) { toast(er.message); }
  }
  return (
    <section className="panel"><h3>QRIS kos</h3>
      <p className="small muted" style={{ margin: 0 }}>Tampil di portal penghuni agar mereka bisa langsung scan dan bayar. Pakai screenshot atau foto QRIS dari aplikasi bank / merchant Anda yang tajam dan tidak terpotong.</p>
      {img === undefined ? <p className="small muted" style={{ margin: 0 }}>Memuat…</p> : img ? (
        <img src={img} alt="QRIS kos" className="qris" />
      ) : <div className="empty"><span className="muted small">Belum ada gambar QRIS</span></div>}
      <label className="f">{img ? 'Ganti gambar QRIS' : 'Unggah gambar QRIS'}<input type="file" accept="image/*" onChange={pick} disabled={busy} /></label>
      {img && <button className="sm ghost danger" onClick={() => confirm('Hapus gambar QRIS?') && save(null)} disabled={busy}>Hapus QRIS</button>}
      <p className="small muted" style={{ margin: 0 }}>Setelah mengganti QRIS, uji dengan satu pembayaran kecil.</p>
    </section>
  );
}

// Teks pesan WhatsApp yang bisa diubah pemilik (pengingat tagihan & link portal)
function TemplateBox({ kos, onSaved }) {
  const [vals, setVals] = useState({ reminder: kos.wa_reminder_tpl || TPL.reminder.def, portal: kos.wa_portal_tpl || TPL.portal.def });
  const [busy, setBusy] = useState(false);
  const refs = { reminder: useRef(null), portal: useRef(null) };
  useEffect(() => { if (window.location.hash === '#pesan') document.getElementById('pesan')?.scrollIntoView({ behavior: 'smooth' }); }, []);

  const set = (k, v) => setVals((s) => ({ ...s, [k]: v }));
  function insert(k, word) {
    const el = refs[k].current, tag = `{${word}}`;
    const v = vals[k], a = el ? el.selectionStart : v.length, b = el ? el.selectionEnd : v.length;
    set(k, v.slice(0, a) + tag + v.slice(b));
    requestAnimationFrame(() => { if (el) { el.focus(); el.setSelectionRange(a + tag.length, a + tag.length); } });
  }
  async function save() {
    for (const k of ['reminder', 'portal']) {
      if (!vals[k].trim()) return run(() => { throw new Error(`Teks "${TPL[k].title}" tidak boleh kosong. Tekan "Pakai teks bawaan" bila ingin kembali ke awal.`); });
      if (vals[k].length > MAX_TPL) return run(() => { throw new Error(`Teks "${TPL[k].title}" maksimal ${MAX_TPL} karakter.`); });
    }
    // sama dengan teks bawaan → simpan kosong, agar ikut pembaruan teks bawaan berikutnya
    const norm = (k) => (vals[k].trim() === TPL[k].def ? null : vals[k].trim());
    setBusy(true);
    const ok = await run(() => supabase.from('kos').update({ wa_reminder_tpl: norm('reminder'), wa_portal_tpl: norm('portal') }).eq('id', kos.id), 'Teks pesan disimpan', errMsg);
    setBusy(false);
    if (ok) onSaved();
  }

  return (
    <section className="panel" id="pesan"><h3>Teks pesan WhatsApp</h3>
      <p className="small muted" style={{ margin: 0 }}>Sesuaikan kata-kata pesan yang dikirim ke penghuni. Ketuk kata berwarna untuk menyisipkannya; saat dikirim, kata itu otomatis diganti dengan data penghuni.</p>
      {['reminder', 'portal'].map((k) => {
        const t = TPL[k];
        const missLink = k === 'portal' && !vals[k].includes('{link}');
        return (
          <div className="stack" key={k} style={{ gap: 8 }}>
            <b>{t.title}</b>
            <span className="small muted">{t.where}</span>
            <textarea ref={refs[k]} value={vals[k]} maxLength={MAX_TPL} onChange={(e) => set(k, e.target.value)} style={{ minHeight: 150 }} />
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {t.vars.map(([w, label]) => <button key={w} type="button" className="sm" title={label} onClick={() => insert(k, w)}>{'{' + w + '}'}</button>)}
            </div>
            <span className="small muted">{t.vars.map(([w, label]) => `{${w}} = ${label}`).join(' · ')}</span>
            {missLink && <span className="small" style={{ color: 'var(--warn)' }}>Tidak ada {'{link}'} — link portal akan ditambahkan otomatis di akhir pesan.</span>}
            <span className="label">Contoh pesan</span>
            <div className="mini-wa" style={{ whiteSpace: 'pre-wrap', fontSize: 13, alignSelf: 'stretch', maxWidth: '100%' }}>{fill(vals[k], t.sample)}{missLink ? '\n\n' + t.sample.link : ''}</div>
            {vals[k] !== t.def && <button type="button" className="sm ghost" onClick={() => set(k, t.def)}>Pakai teks bawaan</button>}
          </div>
        );
      })}
      <button className="primary" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan teks pesan'}</button>
    </section>
  );
}
