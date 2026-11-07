'use client';
// Pustaka media: semua foto publik bisnis di satu tempat — unggah, cari, filter, lihat dipakai di mana,
// ganti gambar (berlaku di semua pemakaian), lepas dari satu pemakaian, hapus (konfirmasi bila masih dipakai).
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Sheet, Field, Loading, Empty, toast } from '@/components/ui';
import { errMsg } from '@/lib/format';
import { mediaUrl, CATEGORIES, deleteMedia } from '@/lib/media';
import MediaUploader from '@/components/media/MediaUploader';
import Lightbox from '@/components/media/Lightbox';

const mb = (b) => (b >= 1048576 ? `${(b / 1048576).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const tz = { timeZone: 'Asia/Jakarta' };
const when = (t) => new Date(t).toLocaleString('id-ID', { ...tz, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
// kategori yang relevan per jenis bisnis (urutan = prioritas)
const CATS_BY_TYPE = { properti: ['kamar', 'fasilitas', 'cover', 'galeri', 'lainnya'], retail: ['produk', 'cover', 'galeri', 'lainnya'], jasa: ['layanan', 'portofolio', 'fasilitas', 'cover', 'galeri', 'lainnya'], kustom: ['portofolio', 'fasilitas', 'cover', 'galeri', 'lainnya'] };

export default function Media() {
  const { kos, kosId, ver } = useKos();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [cat, setCat] = useState('semua');
  const [q, setQ] = useState('');
  const [up, setUp] = useState(null);
  const [cur, setCur] = useState(null);
  const load = () => supabase.rpc('media_list', { p_kos: kosId }).then(({ data, error }) => (error ? setErr(/media_list/.test(error.message) ? 'Pustaka media sedang dipasang. Coba lagi beberapa menit lagi.' : errMsg(error)) : (setErr(null), setD(data))));
  useEffect(() => { load(); }, [kosId, ver]);
  const cats = CATS_BY_TYPE[kos?.business_type] || CATS_BY_TYPE.kustom;
  const items = useMemo(() => (d?.items || []).filter((m) => (cat === 'semua' || m.category === cat)
    && (!q.trim() || `${m.caption || ''} ${m.name || ''} ${(m.uses || []).map((u) => u.label).join(' ')}`.toLowerCase().includes(q.trim().toLowerCase()))), [d, cat, q]);
  if (err) return <div className="notice bad">{err}</div>;
  if (!d) return <Loading />;
  const lim = d.limit_mb ? d.limit_mb * 1048576 : null;
  const pct = lim ? Math.min(100, Math.round((d.used / lim) * 100)) : 0;
  const unused = (d.items || []).filter((m) => !m.uses.length).length;
  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Pustaka media</h2><PageHelp page="media" /></div><button className="primary" onClick={() => setUp(cats[0])}>+ Foto</button></div>
      <section className="panel" style={{ gap: 6 }}>
        <div className="row between"><span className="small">Penyimpanan foto & lampiran</span><span className="small"><b>{mb(d.used)}</b>{lim ? ` dari ${mb(lim)}` : ''}</span></div>
        {lim && <div className="bar"><span style={{ width: `${pct}%`, background: pct > 90 ? 'var(--bad)' : undefined }} /></div>}
        <span className="small muted">Foto di sini tampil di halaman bisnis, katalog, kamar, dan layanan. Dokumentasi internal (nota, bukti, kondisi barang) tetap di 📎 Lampiran tiap data — tidak publik.</span>
      </section>
      <div className="seg" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
        <button className={cat === 'semua' ? 'on' : ''} onClick={() => setCat('semua')} style={{ whiteSpace: 'nowrap' }}>Semua ({d.items.length})</button>
        {cats.map((c) => <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)} style={{ whiteSpace: 'nowrap' }}>{CATEGORIES[c]} ({d.items.filter((m) => m.category === c).length})</button>)}
      </div>
      {d.items.length > 6 && <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari keterangan, nama file, atau tempat dipakai" aria-label="Cari foto" />}
      {d.items.length === 0 ? (
        <Empty title="Belum ada foto" text={kos.business_type === 'properti' ? 'Mulai dari foto kamar dan fasilitas — calon penghuni lebih yakin bila bisa melihat kamarnya.' : kos.business_type === 'retail' ? 'Mulai dari foto barang terlaris dan tampak depan toko.' : 'Mulai dari foto layanan/menu dan hasil kerja.'}>
          <button className="primary" onClick={() => setUp(cats[0])}>+ Foto {CATEGORIES[cats[0]].toLowerCase()}</button>
        </Empty>
      ) : items.length === 0 ? <span className="small muted">Tidak ada foto yang cocok.</span> : (
        <div className="mediagrid">{items.map((m) => (
          <button key={m.id} type="button" className="mediacell" onClick={() => setCur(m)} aria-label={m.caption || m.name || 'Foto'}>
            <img src={mediaUrl(m.thumb_path)} alt="" loading="lazy" />
            <span className={'mediabadge' + (m.uses.length ? '' : ' muted')}>{m.uses.length ? `Dipakai ${m.uses.length}` : 'Belum dipakai'}</span>
          </button>
        ))}</div>
      )}
      {unused > 0 && <span className="small muted">{unused} foto belum dipakai di mana pun. Tempelkan lewat menu terkait (mis. {kos.business_type === 'properti' ? 'Kamar › ketuk kamar › + Foto' : kos.business_type === 'retail' ? 'Barang › ubah barang › + Foto' : 'Layanan › ketuk layanan › + Foto'}) atau hapus agar kuota lega.</span>}
      <span className="small muted">Tempat foto: {kos.business_type === 'properti' ? 'Kamar (foto tiap kamar)' : kos.business_type === 'retail' ? 'Barang (foto produk)' : 'Layanan/Menu (foto layanan)'} · <Link href="/halaman">Halaman bisnis</Link> (cover & galeri).</span>
      {up && <MediaUploader kosId={kosId} category={up} onClose={() => setUp(null)} onDone={() => { setUp(null); load(); }} title={`Tambah foto · ${CATEGORIES[up]}`} />}
      {cur && !up && <Detail m={(d.items || []).find((x) => x.id === cur.id) || cur} kosId={kosId} canManage={d.can_manage} onClose={() => setCur(null)} onChanged={load} />}
    </div>
  );
}

function Detail({ m, kosId, canManage, onClose, onChanged }) {
  const [replace, setReplace] = useState(false);
  const [view, setView] = useState(false);
  const [cap, setCap] = useState(m.caption || '');
  const [busy, setBusy] = useState(false);
  const saveCap = async () => {
    const { error } = await supabase.rpc('media_caption', { p_id: m.id, p_caption: cap });
    if (error) return toast(errMsg(error));
    toast('Keterangan disimpan'); onChanged();
  };
  const unlink = async (u) => {
    if (!window.confirm(`Lepas dari ${u.label}? File tetap di pustaka.`)) return;
    const { error } = await supabase.rpc('media_unlink', { p_link: u.id });
    if (error) return toast(errMsg(error));
    toast('Dilepas'); onChanged();
  };
  const del = async () => {
    const n = m.uses.length;
    if (!window.confirm(n ? `Foto ini masih dipakai di ${n} tempat (${m.uses.map((u) => u.label).join(', ')}).\n\nHapus juga dari semua tempat itu? Tidak bisa dibatalkan.` : 'Hapus foto ini? Tidak bisa dibatalkan.')) return;
    setBusy(true);
    try { await deleteMedia(m.id, n > 0); toast('Foto dihapus'); onClose(); onChanged(); } catch (e) { toast(e.message); }
    setBusy(false);
  };
  if (replace) return <MediaUploader kosId={kosId} category={m.category} multiple={false} replaceId={m.id} onClose={() => setReplace(false)} onDone={() => { setReplace(false); onChanged(); }} />;
  return (
    <Sheet title={CATEGORIES[m.category] || 'Foto'} onClose={onClose}>
      <button type="button" className="mediaprev" onClick={() => setView(true)} aria-label="Perbesar"><img src={mediaUrl(m.path)} alt={m.caption || ''} /></button>
      <span className="small muted">{m.width && m.height ? `${m.width}×${m.height} px · ` : ''}{mb(m.size)} · diunggah {when(m.created_at)}{m.created_email ? ` oleh ${m.created_email}` : ''}</span>
      <Field label="Keterangan (opsional, tampil di halaman bisnis)"><div className="row" style={{ flexWrap: 'nowrap' }}><input value={cap} maxLength={200} onChange={(e) => setCap(e.target.value)} placeholder="mis. Kamar A07 dengan jendela besar" />{cap !== (m.caption || '') && <button className="sm" onClick={saveCap}>Simpan</button>}</div></Field>
      <span className="label">Dipakai di</span>
      {m.uses.length ? <div className="list">{m.uses.map((u) => <div className="li" key={u.id}><span className="small">{u.label}{u.sort === 0 && u.entity !== 'kos_gallery' ? ' · utama' : ''}</span><button className="sm ghost" onClick={() => unlink(u)}>Lepas</button></div>)}</div>
        : <span className="small muted">Belum dipakai di mana pun.</span>}
      <div className="row">
        <button className="sm" disabled={busy} onClick={() => setReplace(true)}>Ganti gambar{m.uses.length > 1 ? ` (${m.uses.length} tempat)` : ''}</button>
        {(canManage || m.mine) && <button className="sm ghost danger" disabled={busy} onClick={del}>Hapus</button>}
      </div>
      <details><summary className="small">Riwayat</summary><div className="list">{(m.log || []).slice().reverse().map((e, i) => <div className="li" key={i}><span className="small">{e.text}</span><span className="small muted" style={{ textAlign: 'right' }}>{when(e.at)}<br />{e.actor}</span></div>)}</div></details>
      {view && <Lightbox items={[m]} urlOf={mediaUrl} onClose={() => setView(false)} />}
    </Sheet>
  );
}
