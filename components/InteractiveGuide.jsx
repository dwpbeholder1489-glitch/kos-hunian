'use client';
// Panduan interaktif PRASARA: tur onboarding (bisa diulang dari Panduan & Bantuan) dan tur kontekstual
// tombol "? Panduan" di setiap halaman, dengan sorotan elemen nyata, tooltip, Lewati/Jeda/Lanjutkan/Ulangi.
// AMAN UNTUK DATA: tur hanya MEMBACA layar (menyorot & menggulir); tidak pernah menekan tombol, mengisi
// formulir, atau memanggil RPC bisnis. Progres tur = metadata belajar (localStorage + learning_tour_*).

import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isDraft, pathAllowed, ROLES, roleOf, tabsFor, typeOf } from '@/lib/business';
import { contextualHelp } from '@/lib/learning';
import { useLearningStorage } from '@/lib/learningStorage';
import { mainTabOf } from '@/lib/menu';
import { buildPageTour, tourKey } from '@/lib/tour';
import { useTourSync } from '@/lib/tourSync';
import styles from './InteractiveGuide.module.css';

const GuideContext = createContext(null);
export const useInteractiveGuide = () => useContext(GuideContext);
const controls = 'input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select, [contenteditable=true]';
const fieldRules = [
  [/nomor pesanan/, 'Gunakan kode yang tercantum di konfirmasi atau nota pesanan.'],
  [/whatsapp|telepon|nomor hp/, 'Gunakan nomor yang dapat dihubungi. Untuk cek pesanan, gunakan nomor yang dipakai saat memesan.'],
  [/email|e-mail/, 'Gunakan alamat email lengkap, misalnya nama@contoh.id.'],
  [/nominal|jumlah.*bayar|harga|biaya|pembayaran diterima/, 'Masukkan nominal rupiah sesuai label. Untuk pembayaran, cocokkan dengan uang yang diterima.'],
  [/tanggal|jatuh tempo/, 'Pilih tanggal sesuai kejadian atau batas waktu yang disebut pada label.'],
  [/kata sandi|password/, 'Masukkan kata sandi sesuai ketentuan pada formulir. Jaga kerahasiaannya.'],
  [/bukti|lampiran/, 'Pilih berkas yang sesuai dan periksa apakah terbaca sebelum mengirim.'],
  [/cari|pencarian/, 'Ketik kata kunci pendek yang berkaitan dengan data yang dicari.'],
];

function describeField(el) {
  const label = el.labels?.[0];
  const caption = Array.from(label?.childNodes || []).filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent.trim()).filter(Boolean).join(' ');
  const name = el.getAttribute('aria-label') || el.getAttribute('data-help-label') || caption || label?.querySelector('.label')?.textContent || el.placeholder || el.name || 'Kolom ini';
  const description = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)?.textContent).filter(Boolean).join(' ');
  const hint = el.dataset.help || description || label?.querySelector('small,.hint')?.textContent ||
    fieldRules.find(([rule]) => rule.test(name.toLowerCase()))?.[1] ||
    (el.tagName === 'SELECT' ? 'Pilih salah satu opsi yang tersedia.' : el.type === 'checkbox' ? 'Centang untuk mengaktifkan pilihan ini.' : el.type === 'radio' ? 'Pilih satu jawaban dalam kelompok ini.' : 'Isi sesuai label dan contoh pada kolom.');
  return { name, hint, required: el.required, element: el };
}

// Tur yang disusun manual untuk halaman transaksi utama (target data-guide-target di halaman itu).
const LIVE_TOURS = {
  '/kasir': [['pos-demo', 'Buka Coba Kasir DEMO untuk berlatih menambahkan barang dan membayar dengan data contoh. Latihan tidak masuk ke penjualan, stok, atau kas.'], ['pos-search', 'Cari barang dengan nama, kode, atau barcode.'], ['pos-cart', 'Periksa item, satuan, jumlah, dan total.'], ['pos-pay', 'Bayar membuka pilihan pembayaran untuk keranjang toko ini. Panduan ini tidak menekan tombol apa pun — Anda yang memutuskan.']],
  '/pesanan': [['order-header', 'Pilih pesanan untuk memeriksa tahap pengerjaan.'], ['order-new', 'Pesanan baru membuka formulir layanan dan pelanggan.']],
  '/tagihan': [['invoice-header', 'Periksa riwayat dan status tagihan sewa.'], ['invoice-new', 'Tagihan tambahan untuk biaya di luar tagihan rutin.']],
};

const STRUCT = {
  header: '.pg-h, h1, h2',
  search: '.ftb, input[type=search]',
  data: '.dt-wrap, table, .list',
  dashboard: '.dash',
  tabs: '[role=tablist], .seg',
  replay: '[data-guide-button]',
};
const SKIP = '.crumbs, [data-guide-button], [data-guide-field], [data-guide-overlay], .bnav, .side-nav, .topbar, header.top, dialog, [role=dialog]';

function visible(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

function findTarget(step) {
  for (const query of step?.selectors || []) {
    let list = [];
    try { list = Array.from(document.querySelectorAll(query)); } catch { continue; }
    const target = list.find(visible);
    if (target) return target;
  }
  return null;
}

// Kumpulkan apa yang BENAR-BENAR tampil di halaman (sesuai peran, modul, paket, dan perangkat).
function scanPage(rootSel) {
  const root = document.querySelector(rootSel) || document.body;
  document.querySelectorAll('[data-guide-auto]').forEach((el) => el.removeAttribute('data-guide-auto'));
  const pick = (q) => Array.from(root.querySelectorAll(q)).find((el) => visible(el) && !el.closest(SKIP));
  const found = {};
  for (const [k, q] of Object.entries(STRUCT)) if (k !== 'replay') found[k] = Boolean(pick(q));
  const candidates = [];
  root.querySelectorAll('button, a[href], [role=tab], summary').forEach((el) => {
    if (candidates.length >= 120 || !visible(el) || el.closest(SKIP) || el.disabled) return;
    const label = (el.getAttribute('aria-label') || el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!label) return;
    const id = candidates.length;
    el.setAttribute('data-guide-auto', String(id)); // penanda baca-saja untuk sorotan
    candidates.push({ id, label });
  });
  return { root, found, candidates };
}

function pageSteps({ path, kos, customer, help, rootSel }) {
  const role = customer ? 'pelanggan' : roleOf(kos);
  if (!customer && LIVE_TOURS[path]) {
    const live = LIVE_TOURS[path].map(([target, text]) => ({ selectors: [`[data-guide-target="${target}"]`], text }));
    const tail = buildPageTour({ help: { title: help.title, steps: [], warn: help.warn || [] }, role, roleName: ROLES[role]?.name });
    return [...live, ...tail.map(toDom(null, rootSel))];
  }
  const scan = scanPage(rootSel);
  return buildPageTour({ help, found: scan.found, candidates: scan.candidates, role, roleName: ROLES[role]?.name, customer }).map(toDom(scan, rootSel));
}

const toDom = (scan, rootSel) => (step) => {
  const t = step.target;
  const selectors = !t ? [] : typeof t === 'object' ? [`${rootSel} [data-guide-auto="${t.id}"]`] : t === 'replay' ? [STRUCT.replay] : STRUCT[t].split(', ').map((q) => `${rootSel} ${q}`);
  return { selectors, text: step.text, kind: step.kind };
};

// Tur onboarding: mengenalkan kerangka aplikasi sesuai perangkat (HP / tablet & laptop), jenis bisnis, dan peran.
function onboardingSteps(kos, customer, wide) {
  if (customer) return [
    { selectors: ['[data-guide-customer] h1', '[data-guide-customer] h2'], text: 'Pastikan Anda membuka halaman usaha yang tepat.' },
    { selectors: ['[data-guide-customer] form', '.ptabs', '[data-guide-customer] main'], text: 'Gunakan pilihan yang tersedia untuk melihat informasi atau memeriksa status.' },
    { selectors: ['[data-guide-customer] [data-guide-button]'], text: 'Buka tombol Panduan kapan saja untuk mengulang langkah halaman ini.' },
  ];
  const role = roleOf(kos);
  const type = typeOf(kos);
  const main = mainTabOf(kos);
  const s = (selectors, text) => ({ selectors, text });
  const steps = [
    s(wide ? ['.side-biz'] : ['.bizbtn'], `Ini bisnis aktif: ${kos.name} (${type.name}). Ketuk di sini untuk berpindah ke bisnis lain atau menambah bisnis baru.`),
    wide ? s(['.side-nav'], 'Menu kiri berisi modul yang sesuai jenis bisnis, modul aktif, dan peran Anda. Kelompok bisa dibuka-tutup; menu yang tidak relevan memang tidak ditampilkan.')
      : s(['.bnav'], `Menu bawah: Beranda, ${main[1]}, tombol (+), dan Akun. Ketuk untuk berpindah halaman.`),
    s(wide ? ['.tb-quick'] : ['.bnav .fab'], 'Tombol (+) Aksi cepat berisi tindakan yang paling sering dipakai untuk halaman ini dan peran Anda.'),
    s(wide ? ['.tb-search'] : ['.top a[href^="/operasional"]'], wide ? 'Cari menu dengan mengetik namanya (pintasan Ctrl K atau /).' : 'Cari menu dengan mengetik namanya, mis. "kas" atau "laporan".'),
    s(['.helpbtn.bell'], 'Lonceng notifikasi: hal yang perlu ditindaklanjuti dan kabar terbaru bisnis.'),
  ];
  if (isDraft(kos)) steps.push(s(['a[href="/konfirmasi"]'], 'Bisnis masih draf. Selesaikan dan aktifkan di Pusat Konfirmasi; menu operasional terbuka setelah itu.'));
  if (role !== 'pemilik') steps.push(s([], `Anda masuk sebagai ${ROLES[role]?.name || role}. Menu dan tombol yang tampil sudah disesuaikan dengan tugas Anda.`));
  steps.push(s(['[data-guide-button]'], 'Di setiap halaman ada tombol ? Panduan: menyorot bagian penting halaman itu langkah demi langkah. Bisa dijeda, dilewati, dan diulang.'));
  steps.push(s(wide ? ['.side-foot a[href="/bantuan"]', '.topbar a[href="/bantuan"]'] : ['.menubtn'], wide
    ? 'Panduan & Bantuan: ulangi panduan awal ini, buka tur setiap modul, cari jawaban, dan masuk ke Learning Center.'
    : 'Menu ☰ berisi Panduan & Bantuan: ulangi panduan awal ini, buka tur setiap modul, dan masuk ke Learning Center.'));
  return steps;
}

function Spotlight({ active, onClose, onMove, onRestart, customer }) {
  const card = useRef(null);
  const [pos, setPos] = useState(null);
  const step = active.steps[active.index];
  const last = active.index + 1 === active.steps.length;

  useLayoutEffect(() => {
    card.current?.focus({ preventScroll: true });
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function place() {
      const target = findTarget(step);
      const rect = target?.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      if (!rect || rect.bottom <= 0 || rect.top >= vh) return setPos(null);
      const box = { left: Math.max(4, rect.left - 6), top: Math.max(4, rect.top - 6) };
      box.width = Math.max(0, Math.min(rect.right + 6, vw - 4) - box.left);
      box.height = Math.max(0, Math.min(rect.bottom + 6, vh - 4) - box.top);
      const wide = vw >= 768;
      const ch = card.current?.offsetHeight || 220, cw = Math.min(400, vw - 24);
      let tip = null, mobile = null;
      if (!wide) {
        // HP: kartu di sisi yang lebih lega (atas/bawah) dan tingginya dibatasi agar tidak menutupi sorotan.
        const above = rect.top - 70, below = vh - 80 - rect.bottom;
        const top = above > below;
        mobile = { top, max: Math.max(170, (top ? above : below) - 14) };
      }
      if (wide) {
        const below = rect.bottom + 12 + ch < vh;
        const top = below ? rect.bottom + 12 : Math.max(12, rect.top - 12 - ch);
        const left = Math.min(Math.max(12, rect.left), vw - cw - 12);
        tip = { top, left, arrow: below ? 'up' : 'down', ax: Math.min(Math.max(16, rect.left + rect.width / 2 - left), cw - 16) };
      }
      setPos({ box, tip, mobile });
    }
    const target = findTarget(step);
    if (target) {
      const r = target.getBoundingClientRect();
      const vh = window.innerHeight, wide = window.innerWidth >= 768;
      const behavior = reduce ? 'auto' : 'smooth';
      // HP: target digulir ke bagian atas (sisakan ruang kartu di bawah); laptop: cukup terlihat.
      const ok = wide ? r.top >= 70 && r.bottom <= vh - 90 : r.top >= 70 && r.bottom <= vh * 0.48;
      if (!ok) {
        if (!wide && r.height < vh * 0.4 && document.scrollingElement.scrollHeight > vh) window.scrollTo({ top: Math.max(0, window.scrollY + r.top - 84), behavior });
        else target.scrollIntoView({ block: wide ? 'center' : 'start', inline: 'nearest', behavior });
      }
    }
    place();
    const t = setTimeout(place, 420);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { clearTimeout(t); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [step]);

  useEffect(() => {
    const handler = (e) => {
      if (!card.current?.contains(document.activeElement)) return;
      if (e.key === 'Escape') { e.preventDefault(); onClose('paused'); }
      if (e.key === 'ArrowRight') { e.preventDefault(); onMove(1); }
      if (e.key === 'ArrowLeft' && active.index > 0) { e.preventDefault(); onMove(-1); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, onMove, active.index]);

  const tipStyle = pos?.tip ? { top: pos.tip.top, left: pos.tip.left, right: 'auto', bottom: 'auto', '--ax': pos.tip.ax + 'px' }
    : pos?.mobile ? { maxHeight: pos.mobile.max } : undefined;
  return createPortal(<div className={styles.overlay} data-guide-overlay>
    {pos && <div className={styles.spotlight} aria-hidden="true" style={pos.box} />}
    <section className={styles.tooltip} ref={card} tabIndex={-1} role="dialog" aria-modal="false" aria-labelledby="ig-title" aria-describedby="ig-text"
      data-top={pos?.mobile?.top || undefined} data-arrow={pos?.tip?.arrow} style={tipStyle}>
      <div className={styles.head}>
        <span className={styles.count}>Langkah {active.index + 1} dari {active.steps.length}</span>
        <button type="button" className={styles.x} onClick={() => onClose('paused')} aria-label="Jeda panduan dan tutup">✕</button>
      </div>
      <progress className={styles.bar} value={active.index + 1} max={active.steps.length} aria-hidden="true" />
      <h3 id="ig-title">{active.title}</h3>
      <p id="ig-text" aria-live="polite">{step.text}</p>
      {!pos && step.selectors?.length > 0 && <p className={styles.note}>Bagian ini tidak terlihat di layar sekarang — dijelaskan tanpa sorotan.</p>}
      <div className={styles.nav}>
        {active.index > 0 ? <button type="button" className="ghost" onClick={() => onMove(-1)}>‹ Sebelumnya</button> : <span />}
        <button type="button" className="primary" onClick={() => onMove(1)}>{last ? 'Selesai ✓' : 'Lanjutkan ›'}</button>
      </div>
      <div className={styles.buttons}>
        <button type="button" className="ghost sm" onClick={() => onClose('paused')}>Jeda</button>
        <button type="button" className="ghost sm" onClick={() => onClose('skipped')}>Lewati</button>
        <button type="button" className="ghost sm" onClick={onRestart}>Ulangi</button>
      </div>
      {!customer && <div className={styles.links}>
        {active.path === '/kasir' && <Link className="nt-btn primary" href="/kasir/demo" onClick={() => onClose('paused')}>Coba Kasir DEMO</Link>}
        <Link className="small" href="/learning-center" onClick={() => onClose('paused')}>Learning Center</Link>
        <Link className="small" href="/bantuan" onClick={() => onClose('paused')}>Panduan &amp; Bantuan</Link>
        {active.docStep && <Link className="small" href={`/panduan#langkah-${active.docStep}`} onClick={() => onClose('paused')}>Panduan bergambar</Link>}
      </div>}
      {active.index === 0 && <p className={styles.safe}>Panduan hanya menunjukkan — tidak menekan tombol atau mengubah data bisnis.</p>}
    </section>
  </div>, document.body);
}

export function GuideBoundary({ scope, path, kos, customer, customerHelp, children }) {
  const [record, update, ready] = useLearningStorage(scope, 'guides');
  const [active, setActive] = useState(null);
  const [field, setField] = useState(null);
  const [fieldOpen, setFieldOpen] = useState(false);
  const origin = useRef(null);
  const sync = useTourSync({ kosId: kos?.id, enabled: !customer && Boolean(kos?.id), ready, record, update });
  const pageKey = tourKey(path);
  const onboarding = record.onboarding?.status;
  const displayed = active?.path === path ? active : null;
  const title = kos ? tabsFor(kos).find(([href]) => path === href || path.startsWith(href + '/'))?.[1] : null;
  const pageHelp = customerHelp || contextualHelp(kos, path, title);
  const prompt = !customer && kos && pathAllowed(kos, path) && ready && LIVE_TOURS[path] && !record[pageKey] && !displayed;
  const rootSel = customer ? '[data-guide-customer]' : '[data-guide-page]';

  const save = useCallback((key, value) => {
    const v = { ...value, at: new Date().toISOString() };
    update((cur) => ({ [key]: { ...cur[key], ...v } }));
    if (!kos?.closed_at) sync.push(key, { ...record[key], ...v });
  }, [update, sync, kos?.closed_at, record]);

  useEffect(() => {
    setActive(null);
    setField(null);
    setFieldOpen(false);
    const focus = (e) => {
      if (e.target.closest?.('[data-guide-overlay]')) return;
      if (e.target.matches?.(controls) && !e.target.closest('dialog')) setField(describeField(e.target));
      else if (!e.target.closest?.('[data-guide-field]')) { setField(null); setFieldOpen(false); }
    };
    const keyboard = (e) => {
      if (e.key === 'Escape') setFieldOpen(false);
      if (e.key === 'F1' && e.target.matches?.(controls)) {
        e.preventDefault();
        setField(describeField(e.target));
        setFieldOpen(true);
      }
    };
    document.addEventListener('focusin', focus);
    document.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('focusin', focus);
      document.removeEventListener('keydown', keyboard);
    };
  }, [path]);

  function start(kind = 'page', { restart = false, help = pageHelp } = {}) {
    const key = kind === 'onboarding' ? 'onboarding' : pageKey;
    if (!key) return;
    const content = customer ? help : contextualHelp(kos, path, help.title, help);
    const wide = window.matchMedia('(min-width: 768px)').matches;
    const all = kind === 'onboarding' ? onboardingSteps(kos, customer, wide) : pageSteps({ path, kos, customer, help: content, rootSel });
    // Langkah bertarget yang elemennya tidak tampil (beda perangkat/peran/modul) dibuang; langkah teks tetap.
    const steps = all.filter((st) => !st.selectors?.length || findTarget(st) || st.kind === 'langkah' || st.kind === 'perhatian');
    if (!steps.length) return;
    const saved = record[key];
    const resume = !restart && (saved?.status === 'paused' || saved?.status === 'active');
    const index = resume ? Math.min(saved.index || 0, steps.length - 1) : 0;
    origin.current = document.activeElement;
    save(key, { status: 'active', index, steps: steps.length, runs: (saved?.runs || 0) + (resume ? 0 : 1) });
    setActive({ path, key, index, steps, docStep: kind === 'page' ? content.step : null, title: kind === 'onboarding' ? 'Panduan awal PRASARA' : `Panduan · ${content.title}` });
  }

  function close(status) {
    const s = status === 'completed' ? { status, index: displayed.steps.length - 1 } : { status, index: displayed.index };
    save(displayed.key, { ...s, steps: displayed.steps.length });
    setActive(null);
    requestAnimationFrame(() => origin.current?.isConnected && origin.current.focus({ preventScroll: true }));
  }

  function move(delta, restart = false) {
    const index = restart ? 0 : displayed.index + delta;
    if (index < 0) return;
    if (index >= displayed.steps.length) return close('completed');
    update((cur) => ({ [displayed.key]: { ...cur[displayed.key], index } }));
    setActive({ ...displayed, index });
  }

  // Mulai otomatis dari katalog tur: /halaman?tur=1 (modul) atau ?tur=awal (onboarding).
  useEffect(() => {
    if (!ready || customer) return;
    const params = new URLSearchParams(window.location.search);
    const want = params.get('tur');
    if (!want) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const loaded = document.querySelector('[data-guide-page] .pg-h, [data-guide-page] h2') && !document.querySelector('[data-guide-page] .skel');
      if (!loaded && tries < 12) return;
      clearInterval(timer);
      params.delete('tur');
      const q = params.toString();
      window.history.replaceState(window.history.state, '', window.location.pathname + (q ? '?' + q : '') + window.location.hash);
      start(want === 'awal' ? 'onboarding' : 'page', { restart: params.get('ulang') === '1' });
    }, 350);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, path]);

  const reset = async (key = null) => {
    const ok = await sync.reset(key);
    update((cur) => {
      const next = {};
      for (const k of Object.keys(cur)) if (key ? k === key : k === 'onboarding' || k.startsWith('page:')) next[k] = undefined;
      return next;
    });
    return ok;
  };

  return <GuideContext.Provider value={{ start, ready, onboarding, prompt, record, reset, running: Boolean(displayed), syncError: sync.error, pageKey, customer: Boolean(customer),
    dismissPage: () => save(pageKey, { status: 'skipped', index: 0 }),
    dismissOnboarding: () => save('onboarding', { status: 'skipped', index: 0 }) }}>
    {children}
    {!displayed && field?.element.isConnected && <aside className={styles.field} data-guide-field>
      {fieldOpen && <div id="prasara-field-help" role="status"><b>{field.name}</b><p>{field.hint}{field.required ? ' Kolom wajib diisi.' : ''}</p></div>}
      <button className="helpchip" type="button" aria-expanded={fieldOpen} aria-controls={fieldOpen ? "prasara-field-help" : undefined} onPointerDown={(e) => e.preventDefault()} onClick={() => setFieldOpen(!fieldOpen)}>ⓘ Bantuan kolom</button>
    </aside>}
    {displayed && <Spotlight key={displayed.key} active={displayed} onClose={close} onMove={move} onRestart={() => move(0, true)} customer={customer} />}
  </GuideContext.Provider>;
}

export function GuideFallback() {
  return <div className={styles.fallback}><GuideButton /></div>;
}

export function GuideButton({ help, label = '? Panduan' }) {
  const guide = useInteractiveGuide();
  if (!guide) return null;
  const st = guide.record?.[guide.pageKey]?.status;
  const paused = !guide.running && (st === 'paused' || st === 'active');
  return <button type="button" className="helpchip noprint" data-guide-button data-paused={paused || undefined}
    aria-label={paused ? 'Lanjutkan panduan halaman ini' : 'Buka panduan interaktif halaman ini'}
    onClick={() => guide.start('page', help ? { help } : undefined)}>{paused ? '▶ Lanjutkan panduan' : label}</button>;
}

export function PageTourPrompt() {
  const guide = useInteractiveGuide();
  if (!guide?.prompt) return null;
  return <div className={styles.buttons}>
    <button className="helpchip" type="button" onClick={() => guide.start()}>Kenali halaman ini</button>
    <button className="ghost" type="button" onClick={guide.dismissPage}>Nanti</button>
  </div>;
}

export function OnboardingActions({ customer = false }) {
  const guide = useInteractiveGuide();
  if (!guide) return null;
  const paused = guide.onboarding === 'paused' || guide.onboarding === 'active';
  return <div className={styles.buttons}>
    <button type="button" className="primary" onClick={() => guide.start('onboarding')}>
      {paused ? 'Lanjutkan panduan awal' : guide.onboarding ? 'Ulangi panduan awal' : 'Mulai panduan awal'}
    </button>
    {paused && <button type="button" className="ghost" onClick={() => guide.start('onboarding', { restart: true })}>Ulangi dari awal</button>}
    {!customer && <Link href="/learning-center" data-guide-onboarding>Buka Learning Center →</Link>}
  </div>;
}

export function OnboardingPrompt() {
  const guide = useInteractiveGuide();
  if (!guide?.ready || guide.onboarding) return null;
  return <section className="panel noprint">
    <h3>Kenali ruang kerja PRASARA</h3>
    <p className="small muted">Tur singkat ±1 menit menyorot menu, tombol (+), pencarian, dan tombol ? Panduan. Bisa dijeda dan diulang kapan saja dari Panduan &amp; Bantuan.</p>
    <div className={styles.buttons}>
      <OnboardingActions />
      <button className="ghost" onClick={guide.dismissOnboarding}>Nanti saja</button>
    </div>
  </section>;
}

export function CustomerGuide({ kind, business, help, children }) {
  const scope = `pelanggan:${kind}:${business || "umum"}`;
  return <GuideBoundary key={scope} scope={scope} path={`/pelanggan/${kind}`} customer customerHelp={help}>
    <div data-guide-customer>
      <div className={styles.customer}><GuideButton /><details><summary>Panduan &amp; Bantuan</summary><OnboardingActions customer /></details></div>
      {children}
    </div>
  </GuideBoundary>;
}
