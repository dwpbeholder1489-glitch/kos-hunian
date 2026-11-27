'use client';

import Link from 'next/link';
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isDraft, pathAllowed, tabsFor, typeOf } from '@/lib/business';
import { contextualHelp } from '@/lib/learning';
import { useLearningStorage } from '@/lib/learningStorage';
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

const LIVE_TOURS = {
  '/kasir': [['pos-demo', 'Buka Coba Kasir DEMO untuk berlatih menambahkan barang dan membayar dengan data contoh.'], ['pos-search', 'Cari barang dengan nama, kode, atau barcode.'], ['pos-cart', 'Periksa item, satuan, jumlah, dan total.'], ['pos-pay', 'Bayar membuka pilihan pembayaran untuk keranjang toko ini.']],
  '/pesanan': [['order-header', 'Pilih pesanan untuk memeriksa tahap pengerjaan.'], ['order-new', 'Pesanan baru membuka formulir layanan dan pelanggan.']],
  '/tagihan': [['invoice-header', 'Periksa riwayat dan status tagihan sewa.'], ['invoice-new', 'Tagihan tambahan untuk biaya di luar tagihan rutin.']],
};
function guideSteps(path, title, kos, customer, wide, help) {
  if (title === 'onboarding') return [
    { selector: customer ? '[data-guide-customer] h1, [data-guide-customer] h2' : '.bizbtn, .side-biz, .topbar', text: customer ? 'Pastikan Anda membuka halaman usaha yang tepat.' : `Ini ruang kerja ${typeOf(kos).name}. Periksa bisnis aktif sebelum membuka menu.` },
    { selector: customer ? '[data-guide-customer] form, .ptabs, [data-guide-customer] main' : wide ? '.side-nav, .topbar' : '.bnav', text: customer ? 'Gunakan pilihan yang tersedia untuk melihat informasi atau memeriksa status.' : isDraft(kos) ? 'Mulai dari Pusat Konfirmasi jika tersedia untuk peran Anda. Menu operasional terbuka setelah bisnis aktif.' : wide ? 'Gunakan navigasi ruang kerja untuk memilih modul yang tersedia bagi peran Anda.' : 'Gunakan menu bawah untuk berpindah halaman. Tombol + membuka aksi cepat sesuai peran Anda.' },
    { selector: '[data-guide-onboarding], [data-guide-customer] [data-guide-button], .side-foot a[href="/bantuan"], .topbar a[href="/bantuan"], .menubtn', text: customer ? 'Buka tombol Panduan kapan saja untuk mengulang langkah halaman ini.' : 'Buka Learning Center untuk melanjutkan materi, latihan, dan evaluasi.' },
  ];
  if (LIVE_TOURS[path]) return LIVE_TOURS[path].map(([target, text]) => ({ selector: '[data-guide-target="' + target + '"]', text }));
  if (path === '/pelanggan/status') return [
    { selector: '[data-guide-customer] form input', text: 'Siapkan kode pesanan dan nomor WhatsApp yang digunakan ketika memesan.' },
    { selector: '[data-guide-customer] form button[type="submit"]', text: 'Cek status menampilkan perkembangan pesanan.' },
  ];
  if (path === '/pelanggan/penghuni') return [
    { selector: '.ptabs a[href="#tagihan"]', text: help.steps[0] },
    { selector: '.ptabs a[href="#riwayat"]', text: help.steps[1] },
  ];
  if (path === '/learning-center') return [
    { selector: '[data-guide-learning-start]', text: 'Mulai atau lanjutkan panduan transaksi dari tahap terakhir.' },
    { selector: '[data-guide-learning-progress]', text: 'Buka tahap tertentu dan periksa progres belajar.' },
  ];
  return [...help.steps, ...help.warn].map((text) => ({ selectors: [], text }));
}

function findTarget({ selector, selectors = [selector] }) {
  for (const query of selectors) {
    const target = Array.from(document.querySelectorAll(query)).find((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility === 'visible';
    });
    if (target) return target;
  }
  return null;
}

function Spotlight({ active, onClose, onMove, onRestart, customer }) {
  const card = useRef(null);
  const [position, setPosition] = useState(null);
  const step = active.steps[active.index];

  useLayoutEffect(() => {
    card.current?.focus({ preventScroll: true });
    function positionTooltip() {
      const target = findTarget(step);
      const rect = target?.getBoundingClientRect();
      const height = Math.max(0, window.innerHeight - 16);
      if (!rect || rect.bottom <= 0 || rect.top >= height) return setPosition(null);
      setPosition({
        left: Math.max(4, rect.left - 4), top: Math.max(4, rect.top - 4),
        width: Math.max(0, Math.min(rect.right + 4, window.innerWidth - 4) - Math.max(4, rect.left - 4)),
        height: Math.max(0, Math.min(rect.bottom + 4, height) - Math.max(4, rect.top - 4)),
        cardOnTop: rect.top > window.innerHeight / 2 || rect.bottom > window.innerHeight - 235,
      });
    }
    findTarget(step)?.scrollIntoView({ block: 'center', inline: 'nearest' });
    positionTooltip();
    window.addEventListener('resize', positionTooltip);
    window.addEventListener('scroll', positionTooltip, true);
    return () => {
      window.removeEventListener('resize', positionTooltip);
      window.removeEventListener('scroll', positionTooltip, true);
    };
  }, [step]);

  useEffect(() => {
    const handler = (event) => {
      if (event.key === 'Escape' && card.current?.contains(document.activeElement)) onClose('paused');
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return createPortal(<aside className={styles.overlay} aria-labelledby="interactive-guide-title">
    {position && <div className={styles.spotlight} aria-hidden="true" style={{ top: position.top, left: position.left, width: position.width, height: position.height }} />}
    <div className={styles.tooltip} ref={card} tabIndex={-1} data-top={position?.cardOnTop || undefined}>
      <span className="small muted">Langkah {active.index + 1} dari {active.steps.length}</span>
      <h3 id="interactive-guide-title">{active.title}</h3>
      <p>{step.text}</p>
      <div className={styles.buttons}>
        <button className="ghost" onClick={() => onClose('skipped')}>Lewati</button>
        <button className="ghost" onClick={() => onClose('paused')}>Jeda</button>
        <button className="ghost" onClick={onRestart}>Ulangi</button>
        {active.index > 0 && <button className="ghost" onClick={() => onMove(-1)}>Sebelumnya</button>}
        <button className="primary" onClick={() => onMove(1)}>{active.index + 1 === active.steps.length ? 'Selesai' : 'Lanjutkan →'}</button>
      </div>
      {!customer && <div className={styles.buttons}>
        {active.path === '/kasir' && <Link className="nt-btn primary" href="/kasir/demo" onClick={() => onClose('paused')}>Coba Kasir DEMO</Link>}
        <Link className="small" href="/learning-center" onClick={() => onClose('paused')}>Learning Center</Link>
        <Link className="small" href="/bantuan" onClick={() => onClose('paused')}>Pusat Bantuan</Link>
        {active.docStep && <Link className="small" href={`/panduan#langkah-${active.docStep}`} onClick={() => onClose('paused')}>Panduan bergambar</Link>}
      </div>}
    </div>
  </aside>, document.body);
}

export function GuideBoundary({ scope, path, kos, customer, customerHelp, children }) {
  const [record, update, ready] = useLearningStorage(scope, 'guides');
  const [active, setActive] = useState(null);
  const [field, setField] = useState(null);
  const [fieldOpen, setFieldOpen] = useState(false);
  const origin = useRef(null);
  const onboarding = record.onboarding?.status;
  const displayed = active?.path === path ? active : null;
  const title = kos ? tabsFor(kos).find(([href]) => path === href || path.startsWith(href + '/'))?.[1] : null;
  const pageHelp = customerHelp || contextualHelp(kos, path, title);
  const prompt = !customer && kos && pathAllowed(kos, path) && ready && LIVE_TOURS[path] && !record['page:' + path] && !displayed;

  useEffect(() => {
    setActive(null);
    setField(null);
    setFieldOpen(false);
    const focus = (e) => {
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
    const key = kind === 'onboarding' ? kind : `page:${path}`;
    const content = customer ? help : contextualHelp(kos, path, help.title, help);
    const steps = guideSteps(path, kind, kos, customer, window.matchMedia('(min-width: 768px)').matches, content);
    const available = steps.filter((step) => !step.selector || findTarget(step));
    if (!available.length) available.push(...content.steps.map((text) => ({ selectors: [], text })));
    if (!available.length) return;
    const saved = record[key];
    const index = !restart && saved?.status === 'paused' ? Math.min(saved.index || 0, available.length - 1) : 0;
    origin.current = document.activeElement;
    update({ [key]: { status: 'paused', index } });
    setActive({ path, key, index, steps: available, docStep: kind === 'page' ? help.step : null, title: kind === 'onboarding' ? 'Panduan awal PRASARA' : help.title });
  }

  function close(status) {
    update({ [displayed.key]: { status, index: displayed.index } });
    setActive(null);
    requestAnimationFrame(() => origin.current?.focus({ preventScroll: true }));
  }

  function move(delta, restart = false) {
    let index = restart ? 0 : displayed.index + delta;
    while (index >= 0 && index < displayed.steps.length && displayed.steps[index].selector && !findTarget(displayed.steps[index])) index += delta < 0 ? -1 : 1;
    if (index < 0) return;
    if (index >= displayed.steps.length) return close('completed');
    update({ [displayed.key]: { status: 'paused', index } });
    setActive({ ...displayed, index });
  }

  return <GuideContext.Provider value={{ start, ready, onboarding, prompt, dismissPage: () => update({ ['page:' + path]: { status: 'skipped', index: 0 } }), dismissOnboarding: () => update({ onboarding: { status: 'skipped', index: 0 } }) }}>
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
  return <button type="button" className="helpchip noprint" data-guide-button onClick={() => guide.start('page', help ? { help } : undefined)}>{label}</button>;
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
  return <div className={styles.buttons}>
    <button type="button" className="primary" onClick={() => guide.start('onboarding')}>
      {guide.onboarding === 'paused' ? 'Lanjutkan panduan awal' : guide.onboarding ? 'Ulangi panduan awal' : 'Mulai panduan awal'}
    </button>
    {guide.onboarding === 'paused' && <button type="button" className="ghost" onClick={() => guide.start('onboarding', { restart: true })}>Ulangi dari awal</button>}
    {!customer && <Link href="/learning-center" data-guide-onboarding>Buka Learning Center →</Link>}
  </div>;
}

export function OnboardingPrompt() {
  const guide = useInteractiveGuide();
  if (!guide?.ready || guide.onboarding) return null;
  return <section className="panel noprint">
    <h3>Kenali ruang kerja PRASARA</h3>
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
