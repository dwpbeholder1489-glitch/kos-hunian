'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Field, Loading, Tile, toast } from '@/components/ui';
import { errMsg, angka, waLink } from '@/lib/format';
import { canArea } from '@/lib/business';

const LINK_PRESETS = [['📍 Lokasi (Google Maps)', 'Lokasi (Google Maps)'], ['📷 Instagram', 'Instagram'], ['🖼️ Foto (Google Drive/Photos)', 'Foto'], ['🎵 TikTok', 'TikTok']];
const slugify = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

// Halaman bisnis publik (blueprint 24, Phase 1): pemilik mengisi & menerbitkan profil, katalog, formulir; permintaan masuk ke Prospek
export default function Halaman() {
  const { kos, kosId, ver } = useKos();
  const owner = canArea(kos, 'team');
  const retail = kos?.business_type === 'retail';
  const jasa = kos?.business_type === 'jasa';
  const [f, setF] = useState(null);
  const [saved, setSaved] = useState(null);
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState('');
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const load = async () => {
    const [p, s] = await Promise.all([
      supabase.from('public_pages').select('*').eq('kos_id', kosId).maybeSingle(),
      supabase.rpc('public_page_stats', { p_kos: kosId }),
    ]);
    if (p.error) return setErr(errMsg(p.error));
    const d = p.data ? { ...p.data, links: p.data.links || [] } : { links: [], slug: slugify(kos.name), enabled: false, catalog_mode: retail ? 'favorit' : 'semua', show_prices: true, email_notify: true, wa_phone: kos.contact_phone || '', address: kos.address || '' };
    setSaved(p.data); setF(d); setStats(s.data);
  };
  useEffect(() => { load(); }, [kosId, ver]);
  if (err) return <div className="notice bad">{/public_pages/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!f) return <Loading />;
  const set = (k, v) => setF({ ...f, [k]: v });
  const url = `${origin}/b/${saved?.slug || f.slug}`;
  const save = async (enabled) => {
    if (enabled && !saved?.enabled && !window.confirm(`Terbitkan halaman ${kos.name}?\n\nYang terlihat oleh siapa saja yang membuka tautan:\n• nama, keterangan, alamat, jam buka, WhatsApp\n• ${f.catalog_mode === 'tidak' ? 'tanpa daftar' : retail ? `daftar barang (${f.catalog_mode === 'semua' ? 'semua barang aktif' : 'barang cepat/favorit'}) dan status tersedia/habis` : jasa ? 'daftar layanan aktif' : 'kamar yang tersedia'}${f.show_prices ? ' beserta harga' : ', tanpa harga'}\n\nHarga modal, laba, stok persis, dan data pelanggan TIDAK pernah ditampilkan.`)) return;
    setBusy(true);
    const { error } = await supabase.rpc('public_page_save', { p_kos: kosId, p: { ...f, enabled, links: (f.links || []).filter((l) => l.url.trim()) } });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(enabled ? (saved?.enabled ? 'Perubahan diterbitkan' : 'Halaman diterbitkan') : saved?.enabled ? 'Halaman disembunyikan' : 'Disimpan (belum diterbitkan)');
    load();
  };
  const copy = async () => { try { await navigator.clipboard.writeText(url); toast('Tautan disalin'); } catch { window.prompt('Salin tautan ini:', url); } };

  return (
    <div className="stack">
      <div className="row"><h2>Halaman bisnis</h2><PageHelp page="halaman" /></div>
      <p className="small muted" style={{ margin: 0 }}>Satu tautan untuk pelanggan: profil {kos.name}, {retail ? 'katalog barang' : jasa ? 'daftar layanan' : 'kamar yang tersedia'}, dan formulir permintaan. Setiap permintaan masuk ke <Link href="/crm">Prospek & tindak lanjut</Link> — bukan penjualan otomatis.</p>

      {saved?.enabled ? (
        <section className="panel">
          <div className="row between"><b>Sudah terbit</b><span className="chip good">Online</span></div>
          <a href={url} target="_blank" rel="noreferrer" className="small" style={{ wordBreak: 'break-all' }}>{url}</a>
          <div className="row">
            <button className="sm" onClick={copy}>Salin tautan</button>
            <a href={waLink('', `Lihat ${kos.name} dan kirim pesanan/pertanyaan di sini: ${url}`)} target="_blank" rel="noreferrer"><button className="sm">Bagikan ke WhatsApp</button></a>
            <a href={url} target="_blank" rel="noreferrer"><button className="sm ghost">Lihat halaman</button></a>
          </div>
        </section>
      ) : <div className="notice">Belum terbit. Isi data di bawah, lalu tekan <b>Terbitkan</b>.</div>}

      {stats && <div className="grid">
        <Tile label="Permintaan 30 hari" value={angka(stats.d30)} sub={`${stats.jadi30} jadi`} />
        <Tile label="Belum ditanggapi" value={angka(stats.baru)} tone={stats.baru > 0 ? 'bad' : undefined} sub="tahap Baru" />
      </div>}
      {stats?.ditolak7 > 0 && <span className="small muted">{stats.ditolak7} kiriman 7 hari terakhir ditolak otomatis (terlalu cepat/terlalu sering — kemungkinan spam).</span>}

      <section className="panel">
        <h3>Isi halaman</h3>
        <Field label="Alamat halaman" hint={`${origin}/b/${f.slug || '…'}`}><input value={f.slug} onChange={(e) => set('slug', slugify(e.target.value))} disabled={!owner} autoCapitalize="none" /></Field>
        <Field label="Kalimat singkat (tagline)"><input value={f.tagline || ''} maxLength={120} onChange={(e) => set('tagline', e.target.value)} disabled={!owner} placeholder={retail ? 'mis. Sembako lengkap, harga grosir, bisa antar' : jasa ? 'mis. Laundry kiloan 2 hari, bisa antar-jemput' : 'mis. Kos putri dekat kampus, WiFi & AC'} /></Field>
        <Field label="Tentang"><textarea rows={3} maxLength={1000} value={f.about || ''} onChange={(e) => set('about', e.target.value)} disabled={!owner} /></Field>
        <Field label="Alamat"><input value={f.address || ''} maxLength={200} onChange={(e) => set('address', e.target.value)} disabled={!owner} /></Field>
        <Field label="Jam buka"><input value={f.hours || ''} maxLength={200} onChange={(e) => set('hours', e.target.value)} disabled={!owner} placeholder="mis. Setiap hari 06.00–21.00" /></Field>
        <Field label="No. WhatsApp untuk pelanggan"><input inputMode="tel" value={f.wa_phone || ''} maxLength={20} onChange={(e) => set('wa_phone', e.target.value)} disabled={!owner} /></Field>
        <Field label={retail ? 'Barang yang ditampilkan' : jasa ? 'Daftar layanan' : 'Daftar kamar'}><select value={f.catalog_mode} onChange={(e) => set('catalog_mode', e.target.value)} disabled={!owner}>
          {retail ? <><option value="favorit">Hanya barang cepat (★ di Barang)</option><option value="semua">Semua barang aktif</option></> : <option value="semua">{jasa ? 'Semua layanan aktif' : 'Kamar yang tersedia'}</option>}
          <option value="tidak">Jangan tampilkan daftar</option>
        </select></Field>
        <label className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={f.show_prices} onChange={(e) => set('show_prices', e.target.checked)} disabled={!owner} />Tampilkan harga {retail ? 'jual (eceran)' : jasa ? 'layanan' : 'sewa (per bulan)'}</label>
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">Tautan (opsional)</span>
          <span className="small muted">Mis. lokasi Google Maps, Instagram, atau album foto {retail ? 'toko' : jasa ? 'hasil kerja' : 'kamar'}. Tampil sebagai tombol di halaman. Cara salin di iPhone: buka aplikasinya › <b>Bagikan</b> › <b>Salin tautan</b>, lalu tempel di kolom alamat.</span>
          {(f.links || []).map((l, i) => (
            <div key={i} className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
              <div className="stack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
                <input value={l.label} maxLength={40} placeholder="Nama tombol, mis. Lokasi" onChange={(e) => set('links', f.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} disabled={!owner} aria-label={`Nama tautan ${i + 1}`} />
                <input value={l.url} maxLength={300} inputMode="url" type="url" autoCapitalize="none" autoCorrect="off" placeholder="https://…" onChange={(e) => set('links', f.links.map((x, j) => (j === i ? { ...x, url: e.target.value.trim() } : x)))} disabled={!owner} aria-label={`Alamat tautan ${i + 1}`} />
              </div>
              {owner && <button className="sm ghost" aria-label={`Hapus tautan ${i + 1}`} onClick={() => set('links', f.links.filter((_, j) => j !== i))}>✕</button>}
            </div>
          ))}
          {owner && (f.links || []).length < 6 && <div className="row" style={{ flexWrap: 'wrap' }}>
            {LINK_PRESETS.filter(([, lb]) => !(f.links || []).some((x) => x.label === lb)).map(([t, lb]) => <button key={lb} className="sm ghost" onClick={() => set('links', [...(f.links || []), { label: lb, url: '' }])}>+ {t}</button>)}
            <button className="sm ghost" onClick={() => set('links', [...(f.links || []), { label: '', url: '' }])}>+ Tautan lain</button>
          </div>}
          <span className="small muted">Alamat https:// di kolom Tentang, Kalimat di atas formulir, dan Ketentuan juga bisa diketuk pengunjung.</span>
        </div>
        <Field label="Kalimat di atas formulir (opsional)"><input value={f.form_intro || ''} maxLength={300} onChange={(e) => set('form_intro', e.target.value)} disabled={!owner} placeholder={retail ? 'mis. Pesan sebelum jam 10, diantar siang' : jasa ? 'mis. Jemput gratis radius 2 km' : 'mis. Survei kamar bisa setiap hari'} /></Field>
        <Field label="Ketentuan (opsional)"><textarea rows={2} maxLength={1000} value={f.policy || ''} onChange={(e) => set('policy', e.target.value)} disabled={!owner} placeholder={retail ? 'mis. Ongkir gratis radius 2 km' : jasa ? 'mis. Minimal 3 kg; cucian tidak diambil 30 hari di luar tanggung jawab' : 'mis. Deposit 1 bulan, khusus putri'} /></Field>
        <label className="row small" style={{ flexWrap: 'nowrap' }}><input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={f.email_notify} onChange={(e) => set('email_notify', e.target.checked)} disabled={!owner} />Kirim email ke saya setiap ada permintaan baru</label>
        {owner ? <div className="row">
          <button className="primary" disabled={busy} onClick={() => save(true)}>{saved?.enabled ? 'Simpan & terbitkan' : 'Terbitkan'}</button>
          {saved?.enabled ? <button className="ghost danger" disabled={busy} onClick={() => save(false)}>Sembunyikan halaman</button> : <button className="ghost" disabled={busy} onClick={() => save(false)}>Simpan saja</button>}
        </div> : <span className="small muted">Hanya pemilik yang bisa mengubah dan menerbitkan halaman.</span>}
      </section>
      <span className="small muted">Pengunjung tidak perlu memasang aplikasi. Kiriman formulir dilindungi dari spam (dibatasi per perangkat) dan wajib persetujuan pengunjung. Pembayaran online dan pesanan langsung jadi belum tersedia — setiap permintaan Anda tindak lanjuti lewat WhatsApp.</span>
    </div>
  );
}
