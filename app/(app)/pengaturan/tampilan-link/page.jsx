'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useKos } from '@/components/KosProvider';
import NavIcon from '@/components/NavIcon';
import { Field, Loading, toast } from '@/components/ui';
import { canArea } from '@/lib/business';
import { supabase } from '@/lib/supabase';
import { SITE_HOST } from '@/lib/plan';
import {
  BANNER_CATEGORIES, BANNER_MODES, BANNER_PAGES, BANNER_UPLOAD_LIMIT, bannerCategory, bannerContent,
} from '@/lib/linkBanner';
import styles from './banner.module.css';

const colors = ['#16A34A', '#159A98', '#2563EB', '#8B49CC', '#E58320', '#E96077'];

async function request(url, options = {}) {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Silakan masuk lagi.');
  const response = await fetch(url, {
    ...options, headers: { Authorization: 'Bearer ' + data.session.access_token },
  });
  if (!response.ok) {
    const message = await response.json().catch(() => null);
    throw new Error(message?.error || 'Gagal memuat banner. Coba lagi.');
  }
  return response;
}

function BannerSettings({ kosId, closed }) {
  const [draft, setDraft] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState('settings');
  const [context, setContext] = useState('beranda');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    request('/api/link-banner?kos=' + kosId, { signal: controller.signal })
      .then((r) => r.json()).then(setDraft)
      .catch((error) => { if (!controller.signal.aborted) setLoadError(error.message); });
    return () => controller.abort();
  }, [kosId]);

  useEffect(() => {
    if (!draft) return;
    setPreview(null);
    setPreviewError('');
    if (!draft.enabled || (draft.mode === 'custom' && !file && !draft.hasCustom)) return;
    const controller = new AbortController();
    let url;
    const timer = setTimeout(async () => {
      try {
        const body = bannerForm('preview', kosId, context, draft, file);
        const result = await request('/api/link-banner', { method: 'POST', body, signal: controller.signal });
        const blob = await result.blob();
        if (!controller.signal.aborted) {
          url = URL.createObjectURL(blob);
          const details = JSON.parse(decodeURIComponent(result.headers.get('X-Banner-Preview')));
          setPreview({ url, ...details });
        }
      } catch (error) {
        if (!controller.signal.aborted) setPreviewError(error.message);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [draft, file, kosId, context, retry]);

  if (loadError) return <div className="notice bad">{loadError}</div>;
  if (!draft) return <Loading />;

  const content = preview || bannerContent(draft.enabled ? draft : { ...draft, title: null, description: null }, context);
  const selectedCategory = bannerCategory(draft);
  function change(values) {
    setPreview(null);
    setDraft((old) => ({ ...old, ...values }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const result = await request('/api/link-banner', { method: 'POST', body: bannerForm('save', kosId, context, draft, file) });
      const data = await result.json();
      setDraft((old) => ({ ...old, hasCustom: data.hasCustom }));
      setFile(null);
      setDirty(false);
      toast('Tampilan berbagi disimpan.');
    } catch (error) { toast(error.message); }
    finally { setSaving(false); }
  }

  function chooseFile(event) {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (selected.size > BANNER_UPLOAD_LIMIT) {
      event.target.value = '';
      toast('File banner maksimal 3 MB.');
      return;
    }
    setPreview(null);
    setFile(selected);
    setDirty(true);
  }

  const banner = <div className={styles.banner} aria-live="polite">
    {!draft.enabled ? <img src="/og.jpg?v=3" width="1200" height="630" alt="Banner standar PRASARA" />
      : preview ? <img src={preview.url} width="1200" height="630" alt={content.shareTitle} />
      : previewError ? <div className={styles.error}><span>{previewError}</span><button type="button" className="sm" onClick={() => setRetry(retry + 1)}>Coba lagi</button></div>
      : draft.mode === 'custom' && !file && !draft.hasCustom ? <span>Unggah banner untuk melihat pratinjau</span>
      : <span>Menyiapkan pratinjau…</span>}
  </div>;

  return (
    <div className={styles.screen}>
      <nav aria-label="Lokasi halaman" className={styles.breadcrumb}><Link href="/pengaturan">Pengaturan</Link><NavIcon name="next" size={13} /> Tampilan Link</nav>
      <header className={styles.header}>
        <div><h1>Tampilan Berbagi Link</h1><p>Atur gambar, judul, dan deskripsi yang muncul saat tautan bisnis Anda dibagikan.</p></div>
        <label className={styles.switch}><input type="checkbox" role="switch" aria-label="Aktifkan banner berbagi" checked={draft.enabled} disabled={closed || saving} onChange={(e) => change({ enabled: e.target.checked })} /><span>{draft.enabled ? 'Aktif' : 'Nonaktif'}</span></label>
      </header>

      <div className={styles.layout}>
        <section className={styles.card} aria-label="Pengaturan banner">
          <nav className={styles.tabs} aria-label="Bagian pengaturan">
            <button type="button" aria-pressed={tab === 'settings'} onClick={() => setTab('settings')}>Pengaturan</button>
            <button type="button" aria-pressed={tab === 'preview'} onClick={() => setTab('preview')}>Pratinjau</button>
          </nav>
          {tab === 'settings' ? <fieldset className={styles.fields} disabled={closed || saving}>
            <div className={styles.group}>
              <h2>Sumber Gambar</h2>
              <div className={styles.modes} role="group" aria-label="Sumber gambar">
                {BANNER_MODES.map((mode) => <button key={mode.id} type="button" aria-pressed={draft.mode === mode.id} onClick={() => change({ mode: mode.id })}>
                  <NavIcon name={mode.icon} size={24} /><strong>{mode.title}</strong><span>{mode.description}</span>
                  {draft.mode === mode.id && <i className={styles.selected}><NavIcon name="done" size={17} /></i>}
                </button>)}
              </div>
              {draft.mode === 'custom' && <Field label="File banner" hint={file ? file.name : draft.hasCustom ? 'Banner custom tersimpan. Pilih file untuk menggantinya.' : 'PNG, JPG, atau WebP • 1200 × 630 piksel • maks. 3 MB'}>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseFile} />
              </Field>}
              {draft.mode === 'photo' && <p className={styles.hint}>Foto diambil dari cover atau galeri di <Link href="/halaman">Halaman bisnis</Link>.</p>}
            </div>
            {draft.mode !== 'custom' && <div className={styles.group}>
              <div className={styles.row}><h2>Template Kategori {!draft.category && '(Otomatis)'}</h2>
                {draft.category && <button className="sm ghost" type="button" onClick={() => change({ category: null })}>Ikuti kategori bisnis</button>}
              </div>
              <div className={styles.categories} role="group" aria-label="Template kategori">
                {Object.entries(BANNER_CATEGORIES).map(([id, category]) => <button type="button" key={id} aria-pressed={id === selectedCategory} onClick={() => change({ category: id })}>
                  <span style={{ color: category.color }}><NavIcon name={category.icon} size={23} /></span><strong>{category.label}</strong>
                </button>)}
              </div>
            </div>}
            <div className={styles.group}>
              <h2>Identitas Link</h2>
              <div className={styles.identity}>
                <div className={styles.group}>
                  <Field label="Judul Link"><input value={draft.title || ''} maxLength={80} placeholder={draft.name} onChange={(e) => change({ title: e.target.value })} /></Field>
                  <Field label="Deskripsi Singkat"><textarea rows={2} maxLength={150} value={draft.description || ''} placeholder={draft.tagline || 'Deskripsi mengikuti jenis halaman'} onChange={(e) => change({ description: e.target.value })} /></Field>
                  {draft.mode !== 'custom' && <div className={styles.colorGroup}>
                    <span className="label">Warna Branding</span>
                    <div className={styles.colors}>{colors.map((color) => <button key={color} aria-label={color} aria-pressed={content.color?.toUpperCase() === color} type="button" style={{ background: color }} onClick={() => change({ color })}>{content.color?.toUpperCase() === color && <NavIcon name="done" size={15} />}</button>)}</div>
                    <div className={styles.row}><input aria-label="Pilih warna branding" type="color" value={draft.color || BANNER_CATEGORIES[selectedCategory].color} onChange={(e) => change({ color: e.target.value })} />
                      <code>{(draft.color || BANNER_CATEGORIES[selectedCategory].color).toUpperCase()}</code>
                      {draft.color && <button className="sm ghost" type="button" onClick={() => change({ color: null })}>Reset</button>}
                    </div>
                  </div>}
                </div>
                <div className={styles.group}><span className="label">Pratinjau Gambar (1200 × 630)</span>{banner}</div>
              </div>
            </div>
          </fieldset> : <div className={styles.fields}>
            <Field label="Jenis halaman">
              <select value={context} onChange={(e) => { setPreview(null); setContext(e.target.value); }}>{Object.entries(BANNER_PAGES).map(([id, page]) => <option key={id} value={id}>{page.label}</option>)}</select>
            </Field>
            {banner}
          </div>}
          <div className={styles.bottom}>
            <p><NavIcon name="info" size={18} /> Perubahan muncul pada tautan setelah disimpan. Pratinjau yang sudah dibagikan dapat tersimpan sementara di aplikasi pesan.</p>
            <button className="primary" type="button" onClick={save} disabled={closed || saving || !dirty || (draft.enabled && !preview) || (draft.mode === 'custom' && !file && !draft.hasCustom)}>{saving ? 'Menyimpan…' : 'Simpan tampilan'}</button>
          </div>
        </section>

        <aside className={styles.rail}>
          <section className={styles.card} aria-label="Tampilan di WhatsApp">
            <h2>Pratinjau Berbagi</h2>
            <p className={styles.hint}>Tampilan tautan di WhatsApp</p>
            <div className={styles.chat}>
              <div className={styles.bubble}>
                {banner}
                <div className={styles.linkDetails}><b>{content.shareTitle}</b><span>{content.description}</span><small>{SITE_HOST}</small></div>
              </div>
            </div>
          </section>
          <section className={styles.card} aria-label="Pratinjau menurut jenis halaman">
            <h2>Jenis Halaman</h2>
            <div className={styles.contexts}>
              {Object.entries(BANNER_PAGES).map(([id, page]) => <button type="button" aria-pressed={context === id} key={id} onClick={() => { if (id !== context) setPreview(null); setContext(id); setTab('preview'); }}>
                <NavIcon name={page.icon} size={22} /><span>{page.label}</span>
              </button>)}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function bannerForm(action, kosId, context, { enabled, mode, category, color, title, description }, file) {
  const body = new FormData();
  body.set('action', action);
  body.set('kos', kosId);
  body.set('context', context);
  body.set('settings', JSON.stringify({ enabled, mode, category, color, title, description }));
  if (file && mode === 'custom') body.set('file', file);
  return body;
}

export default function TampilanLink() {
  const { kos } = useKos();
  if (!kos) return <Loading />;
  if (!canArea(kos, 'settings')) return <div className="notice bad">Akses pengaturan bisnis ditolak.</div>;
  return <BannerSettings key={kos.id} kosId={kos.id} closed={Boolean(kos.closed_at || kos.suspended_at)} />;
}
