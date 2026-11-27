'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import NavIcon from '@/components/NavIcon';
import PageHelp from '@/components/PageHelp';
import LearningPractice from '@/components/LearningPractice';
import { curriculum, GLOSSARY, PRACTICE_TASKS, readiness, recoveryCases, TRANSACTION_STAGES as STAGES } from '@/lib/learningCurriculum';
import { isDraft, ROLES, typeOf } from '@/lib/business';
import { knowledgeFor, learningTrack, quizFor } from '@/lib/learning';
import { useJourneySync } from '@/lib/learningSync';
import { useLearningStorage } from '@/lib/learningStorage';
import styles from './LearningCenter.module.css';

const BuilderLearningContext = dynamic(() => import('@/components/BuilderLearningContext'));

const Percent = ({ value }) => <progress className={styles.progress} value={value} max={100} aria-label="Progres belajar">{value}%</progress>;

export function KnowledgeAssistant({ kos }) {
  const [query, setQuery] = useState('');
  const [asked, setAsked] = useState('');
  const matches = asked ? knowledgeFor(kos, asked).slice(0, 3) : [];
  return <section className={styles.card}>
    <h3>Asisten Bisnis</h3>
    <p className="muted small">Cari jawaban di basis pengetahuan PRASARA.</p>
    {asked && <div aria-live="polite" className={styles.answers}>
      <b>{asked}</b>
      {matches.map((h) => <details key={h.id} open={h === matches[0]}>
        <summary>{h.q}</summary><ol>{h.a.map((line) => <li key={line}>{line}</li>)}</ol>
        {h.tip && <p>{h.tip}</p>}<Link href={h.href}>Buka modul →</Link>
      </details>)}
      {!matches.length && <p>Coba kata kunci lain atau <Link href="/bantuan">buka Pusat Bantuan</Link>.</p>}
    </div>}
    <form className={styles.search} onSubmit={(e) => { e.preventDefault(); setAsked(query.trim()); }}>
      <input value={query} onChange={(e) => setQuery(e.target.value)} type="search" maxLength={150} placeholder="Tanyakan soal penggunaan PRASARA" aria-label="Pertanyaan bantuan" required />
      <button className="primary" aria-label="Cari jawaban"><NavIcon name="search" size={18} /></button>
    </form>
  </section>;
}

function ModuleMap({ track }) {
  return <section className={styles.card}>
    <h3>Hubungan dengan Modul Lain</h3>
    <div className={styles.map}>
      <Link href={track.href} className={styles.hub}><NavIcon name="cart" size={23} />{track.subject}</Link>
      {track.related.map(({ href, name, text }) => <Link href={href} key={href} className={styles.node}>
        <NavIcon name={href} size={18} /><div><b>{name}</b><p>{text}</p></div>
      </Link>)}
    </div>
    {!track.related.length && <p className="muted">Modul terkait akan muncul saat tersedia untuk peran Anda.</p>}
  </section>;
}

function Evaluation({ track, onDone, draft, onDraft }) {
  const questions = quizFor(track);
  const [index, setIndex] = useState(draft?.index || 0);
  const [answers, setAnswers] = useState(draft?.answers || {});
  const [picked, setPicked] = useState(null);
  const checked = Object.hasOwn(answers, index);
  const current = questions[index];
  const correct = answers[index] === current?.answer;
  const valid = current?.type === 'amount' ? Number.isSafeInteger(picked) && picked >= 0 : picked !== null;
  const score = questions.filter((q, i) => answers[i] === q.answer).length;
  function save(nextIndex, nextAnswers) {
    setIndex(nextIndex);
    setAnswers(nextAnswers);
    setPicked(null);
    if (nextIndex < questions.length) onDraft({ index: nextIndex, answers: nextAnswers });
  }
  if (!current) return <section className={styles.card}>
    <h3>Hasil Evaluasi</h3><strong>{score} / {questions.length} jawaban benar</strong>
    {score < questions.length && <p>Tinjau penjelasan, lalu coba kembali untuk menuntaskan tahap ini.</p>}
    <button className="ghost" onClick={() => save(0, {})}>Ulangi evaluasi</button>
  </section>;
  return <section className={styles.card}>
    <h3>Evaluasi Pemahaman</h3>
    <span className="small muted">Pertanyaan {index + 1} dari {questions.length}</span><Percent value={100 * (index + 1) / questions.length} />
    <fieldset className={styles.quiz}><legend>{current.question}</legend>
      {current.type === 'amount' ? <label className="f">Kembalian (rupiah)
        <input type="number" min="0" step="1" inputMode="numeric" value={(checked ? answers[index] : picked) ?? ''} disabled={checked}
          onChange={(event) => setPicked(event.target.value === '' ? null : Number(event.target.value))} />
      </label> : current.options.map((option, i) => <label key={option}><input type="radio" name="learning-answer" checked={(checked ? answers[index] : picked) === i} onChange={() => setPicked(i)} disabled={checked} />{option}</label>)}
    </fieldset>
    {checked && <p role="status"><b>{correct ? 'Benar.' : 'Belum tepat.'}</b> {current.reason}</p>}
    <div className={styles.actions}>
      {index > 0 && <button className="ghost" onClick={() => save(index - 1, answers)}>← Sebelumnya</button>}
      <button className="primary" disabled={!checked && !valid} onClick={() => {
        if (!checked) return save(index, { ...answers, [index]: picked });
        save(index + 1, answers);
        if (index + 1 === questions.length) onDone(score, questions.length);
      }}>{checked ? 'Lanjutkan →' : 'Cek jawaban'}</button>
    </div>
  </section>;
}

const SHORTCUTS = [
  ['start', 'Memulai', 'play'], ['catalog', 'Materi', '/laporan'], ['practice', 'Pusat Praktik', 'cart'],
  ['progress', 'Progres', 'done'], ['help', 'Bantuan', 'search'],
];

const DETAILS = {
  0: ['Penjualan mencatat nilai barang atau layanan. Penerimaan adalah uang yang masuk. Piutang adalah nilai yang masih harus ditagih.', 'Buka riwayat yang tersedia, pilih periode, dan baca rincian atau bukti transaksi.'],
  1: ['Periksa nama, satuan, harga, dan identitas pihak yang tepat. Lihat ketersediaan barang bila bisnis memakai stok.', 'Gunakan modul data yang tersedia untuk menyiapkan barang, layanan, atau penghuni sebelum mencatat transaksi.'],
  2: ['Ikuti alur yang diizinkan untuk peran Anda. Periksa catatan sebelum meneruskan ke petugas berikutnya.'],
  3: ['Cocokkan identitas, jumlah, harga, diskon, total, penerimaan, dan sisa tagihan sebelum menyimpan.', 'Edit selagi masih di layar pemeriksaan. Setelah tercatat, ikuti jalur koreksi resmi dan persetujuan yang berlaku.'],
  4: ['Lunas: penerimaan memenuhi tagihan. Belum dibayar: belum ada penerimaan. Dibayar sebagian: masih ada sisa.', 'Jatuh tempo adalah batas bayar. Tagihan terlambat jika masih bersisa setelah batas tersebut. Pembatalan dan retur diperiksa dari riwayat.'],
};

const FIRST_STAGE = {
  properti: 'Tagihan menyatakan kewajiban sewa. Pembayaran menurunkan sisa. Laporan Kos mengikuti penerimaan yang tercatat sesuai periode penyajian.',
  laundry: 'Nilai pesanan dan uang muka dicatat terpisah. Pesanan yang masih dikerjakan belum diperlakukan sama dengan pesanan yang sudah diserahkan.',
  jasa: 'Nilai pekerjaan dapat berbeda dari penerimaan saat ini. Gunakan tahap penyerahan untuk mengetahui kapan pekerjaan selesai.',
  kuliner: 'Nilai pesanan berasal dari menu yang dipilih. Periksa posisi pesanan di dapur dan status pembayarannya secara terpisah.',
  kustom: 'Penerimaan kas mencatat uang masuk. Hubungkan penerimaan dengan bukti atau catatan yang relevan untuk alur bisnis Anda.',
};

export default function LearningCenter({ kos, scope }) {
  const track = learningTrack(kos);
  return <LearningContent key={`${track.id}:${track.role}`} kos={kos} scope={scope} track={track} />;
}

function LearningContent({ kos, scope, track }) {
  const [record, update, ready, progressError] = useLearningStorage(scope, `track:${track.id}:${track.role}`);
  const syncError = useJourneySync({ kosId: kos.id, role: track.role, track: track.id, ready, userId: scope.split(':')[0],
    disabled: isDraft(kos) || Boolean(kos.closed_at || kos.suspended_at), journey: record.journey, update });
  const [library, updateLibrary, , libraryError] = useLearningStorage(scope, 'library');
  const [view, setView] = useState('home');
  const [stage, setStage] = useState(0);
  const [lesson, setLesson] = useState(null);
  const [category, setCategory] = useState('');
  const [task, setTask] = useState(null);
  const modules = curriculum(kos);
  const activeLesson = modules.find((item) => item.href === lesson?.href);
  // Catatan versi pertama disimpan pada key yang sama. Riwayat lama tetap tersedia.
  const done = record.journey?.done || (record.done || []).filter((i) => [0, 1, 3].includes(i)).map((i) => i === 3 ? 5 : i);
  const next = STAGES.findIndex((_, i) => !done.includes(i));
  const resume = record.journey?.current;
  const destination = Number.isInteger(resume) && !done.includes(resume) ? resume : Math.max(0, next);
  const percent = Math.round(done.length * 100 / STAGES.length);
  const journey = { started: record.journey?.started || new Date().toISOString(), done, ...record.journey, version: 2, category: kos.category_code || kos.business_type, role: track.role };
  function saveJourney(patch, sync = true) {
    update((value) => ({ journey: { ...journey, ...value.journey, ...patch, ...(sync ? { touched: new Date().toISOString() } : {}) } }));
  }
  const go = (index) => {
    setStage(index);
    saveJourney({ current: index });
    setView(index === 2 && track.canPractice ? 'simulation' : index === 7 ? 'evaluation' : 'lesson');
  };
  const finish = (indices, extra = {}, step = stage) => {
    const completed = [...new Set([...done, ...indices])];
    saveJourney({ ...extra, current: step, done: completed, ...(completed.length === STAGES.length ? { completed: journey.completed || new Date().toISOString() } : {}) });
  };
  const passed = library.finished || {};
  const startItems = modules.filter(({ href }) => ['/konfirmasi', '/konfigurasi', '/barang', '/layanan', '/kamar', '/kontak', '/penghuni', track.href].includes(href) || /^\/laporan(?:-|$)/.test(href));
  const hiddenHistory = Object.keys(passed).filter((href) => !modules.some((item) => item.href === href));
  function advance() { finish([stage], {}, stage + 1); setStage(stage + 1); setView(stage === 1 && track.canPractice ? 'simulation' : stage === 6 ? 'evaluation' : 'lesson'); }

  return <div className={styles.center} data-guide-learning>
    <div className={styles.heading}>
      <div>{view !== 'home' && <button className="ghost" onClick={() => setView('home')}>← Learning Center</button>}
        <h1>Learning Center</h1><p>{typeOf(kos).name} · {ROLES[track.role]?.name || track.role}</p>
      </div><PageHelp page="learning-center" />
    </div>
    {(progressError || libraryError) && <p className="notice bad" role="alert">Progres belum bisa disimpan di peramban ini. Periksa izin penyimpanan sebelum menutup halaman.</p>}
    {syncError && !progressError && <p className="notice" role="status">Sinkronisasi belum tersedia. Progres dapat dilanjutkan di peramban ini.</p>}
    {!ready ? <p className="muted">Membaca progres…</p> : <>
      {view === 'home' && <>
        <button data-guide-learning-start className={styles.hero} onClick={() => go(destination)}>
          <span className={styles.heroIcon}><NavIcon name="play" size={30} /></span>
          <span><strong>Panduan {track.subject}</strong><small>{next < 0 ? 'Pelajari kembali' : done.length || resume != null ? 'Lanjutkan belajar' : 'Mulai belajar'} · Delapan tahap</small></span>
        </button>
        <div className={styles.shortcuts}>{SHORTCUTS.map(([id, name, icon]) => <button key={id} onClick={() => setView(id)}><NavIcon name={icon} size={22} />{name}</button>)}</div>
        {done.length > 0 && next >= 0 && library.reminders !== false && <p className="notice">Lanjutkan saat siap. Rekomendasi Anda adalah {STAGES[next].toLowerCase()}.</p>}
      </>}
      {['home', 'progress'].includes(view) && <div className={styles.grid}>
        <section className={styles.card} data-guide-learning-progress>
          <h3>Progres belajar</h3><Percent value={percent} /><p>{done.length} dari {STAGES.length} tahap · {percent}%</p>
          <ol className={styles.timeline}>{STAGES.map((name, i) => <li key={name}><button className={i === next ? styles.current : ''} onClick={() => go(i)}><span data-done={done.includes(i)}>{done.includes(i) ? '✓' : i + 1}</span>{name}{done.includes(i) ? <small>Selesai</small> : i === 7 && journey.score != null ? <small>Perlu diulang</small> : i === resume ? <small>Sedang dipelajari</small> : null}</button></li>)}</ol>
        </section>
        <section className={styles.card}>
          <h3>Kesiapan operasional</h3><p>{readiness(done, track.canPractice)}</p>
          <p>Materi modul · {modules.filter((item) => passed[item.href]).length}/{modules.length} selesai</p>
          <p>Latihan selesai · {journey.simulations || 0}</p>
          {journey.score != null && <p>Evaluasi terakhir · {journey.score}/{quizFor(track).length} · {journey.score === quizFor(track).length ? 'Lulus' : 'Perlu diulang'}</p>}
          <p>Rekomendasi · {STAGES[next] || 'Tinjau materi modul'}</p>
          {hiddenHistory.length > 0 && <p>{hiddenHistory.length} materi riwayat tidak relevan untuk konfigurasi atau akses saat ini.</p>}
          {!record.journey && record.done?.length > 0 && <p>Riwayat versi sebelumnya · {record.done.length} tahap selesai.</p>}
          <label><input type="checkbox" checked={library.reminders !== false} onChange={(e) => updateLibrary({ reminders: e.target.checked })} /> Pengingat belajar di Learning Center</label>
        </section>
      </div>}
      {view === 'start' && <section className={styles.card}><h2>Memulai di PRASARA</h2>
        <p>Kenali dashboard bisnis. Gunakan checklist untuk menemukan materi yang sesuai tugas dan konfigurasi Anda.</p>
        <Link href={modules[0]?.href || '/operasional'}>Lihat ruang kerja</Link>
        <ul>{startItems.map((item) => <li key={item.href}><button className="ghost" onClick={() => { setLesson(item); setView('module'); }}>{passed[item.href] ? 'Selesai · ' : ''}{item.title}</button></li>)}</ul>
        <button className="primary" onClick={() => go(destination)}>Buka panduan transaksi</button>
      </section>}
      {view === 'catalog' && <section className={styles.card}>
        <h2>Katalog materi</h2><label className="f">Kategori<select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Semua kategori</option>{[...new Set(modules.map((item) => item.category))].map((name) => <option key={name}>{name}</option>)}</select></label>
        {category && <p>{modules.filter((item) => item.category === category && passed[item.href]).length} dari {modules.filter((item) => item.category === category).length} materi selesai.</p>}
        {modules.filter((item) => !category || item.category === category).map((item) => <button key={item.href} className="ghost" onClick={() => { setLesson(item); setView('module'); }}><b>{item.title}</b> · {item.difficulty} · {item.minutes} menit · {passed[item.href] ? 'Selesai' : 'Belum selesai'}</button>)}
      </section>}
      {view === 'module' && !activeLesson && <p className="notice">Materi ini tidak tersedia untuk konfigurasi atau akses saat ini.</p>}
      {view === 'module' && activeLesson && <section className={styles.card}><h2>{activeLesson.title}</h2>
        <p>Tujuan belajar · Mengenal penggunaan {activeLesson.title.toLowerCase()} sesuai izin Anda.</p>
        <ol>{activeLesson.help.steps.map((line) => <li key={line}>{line}</li>)}</ol>
        {activeLesson.help.warn.map((line) => <p className="notice" key={line}>{line}</p>)}
        {kos.business_type === 'kustom' && (activeLesson.href === '/builder' || activeLesson.href.startsWith('/catatan')) && <BuilderLearningContext key={activeLesson.href} kosId={kos.id} href={activeLesson.href} role={track.role} />}
        <Link href={activeLesson.href}>Buka modul</Link>
        <button className="primary" onClick={() => { updateLibrary({ finished: { ...passed, [activeLesson.href]: new Date().toISOString() } }); setView('catalog'); }}>Tandai sudah dibaca</button>
      </section>}
      {view === 'lesson' && <section className={styles.card}>
        <span className="small muted">Tahap {stage + 1} dari {STAGES.length}</span><h2>{STAGES[stage]}</h2>
        {stage === 0 && <p>{track.explanation}</p>}
        {(stage === 0 && FIRST_STAGE[track.id] ? [FIRST_STAGE[track.id], DETAILS[0][1]]
          : !track.canPractice && [0, 1, 3, 4].includes(stage) ? track.help.steps.slice(0, 3) : DETAILS[stage])
          ?.map((line) => <p key={line}>{line}</p>)}
        {stage === 0 && track.canPractice && <div className={styles.grid}><p>Catatan DEMO · Nilai Rp500.000</p><p>Penerimaan Rp300.000 · Sisa Rp200.000</p></div>}
        {stage === 1 && track.related.map((item) => <Link key={item.href} href={item.href}>{item.name}</Link>)}
        {stage === 5 && <ModuleMap track={track} />}
        {stage === 6 && recoveryCases(track).map(([title, why, fix, confirm]) => <details key={title}><summary>{title}</summary><p>{why}</p><p>{fix}</p><p>{confirm}</p></details>)}
        <Link href={track.href}>Buka {track.help.title}</Link>
        <div className={styles.actions}>{stage > 0 && <button className="ghost" onClick={() => go(stage - 1)}>Sebelumnya</button>}<button className="primary" onClick={advance}>Lanjutkan</button></div>
      </section>}
      {view === 'practice' && <section className={styles.card}><h2>Pusat Praktik</h2>
        <p className={styles.demo}><b>MODE DEMO</b> Bukan transaksi nyata</p>
        {track.canPractice && <button className="primary" onClick={() => go(2)}>Mulai simulasi {track.subject.toLowerCase()}</button>}
        {PRACTICE_TASKS.filter(({ path }) => modules.some(({ href }) => href === path)).map((item) => <button key={item.id} className="ghost" onClick={() => { setTask(item); setView('exercise'); }}>{item.title}{library.exercises?.[item.id] ? ' · Selesai' : ''}</button>)}
        {!track.canPractice && !PRACTICE_TASKS.some(({ path }) => modules.some(({ href }) => href === path)) && <p>Latihan untuk akses Anda belum tersedia. Buka katalog untuk mempelajari modul.</p>}
      </section>}
      {view === 'exercise' && task && modules.some(({ href }) => href === task.path) && <ShortExercise key={task.id} task={task} onDone={() => updateLibrary({ exercises: { ...library.exercises, [task.id]: new Date().toISOString() } })} onBack={() => setView('practice')} />}
      {view === 'simulation' && <LearningPractice track={track} taxRate={track.id === 'retail' && kos.profile?.tax?.aktif ? Number(kos.profile.tax.rate) || 0 : 0} draft={journey.draft} onDraft={(draft) => saveJourney({ current: 2, draft }, false)}
        onBack={() => go(done.includes(2) ? 3 : 1)}
        onDone={(mode) => finish([2, 3], { draft: null, simulations: (journey.simulations || 0) + 1, lastMode: mode }, 4)} />}
      {view === 'evaluation' && <Evaluation track={track} draft={journey.quizDraft} onDraft={(quizDraft) => saveJourney({ current: 7, quizDraft }, false)} onDone={(score, max) => finish(score === max ? [7] : [], { score, quizDraft: null, attempts: [...(journey.attempts || []).slice(-49), { at: new Date().toISOString(), score, max }] }, 7)} />}
      {view === 'help' && <><KnowledgeAssistant kos={kos} /><section className={styles.card}><h2>Glosarium</h2><dl>{Object.entries(GLOSSARY).map(([term, meaning]) => <div key={term}><dt><b>{term}</b></dt><dd>{meaning}</dd></div>)}</dl></section></>}
    </>}
  </div>;
}

function ShortExercise({ task, onDone, onBack }) {
  const [result, setResult] = useState(null);
  return <section className={styles.card}><h2>{task.title}</h2><p className={styles.demo}><b>MODE DEMO</b> Bukan transaksi nyata</p><p>{task.prompt}</p>
    <form className="stack" onSubmit={(event) => {
      event.preventDefault();
      const passed = task.check(Object.fromEntries(new FormData(event.currentTarget)));
      if (passed) onDone();
      setResult(passed);
    }}>
      {task.fields.map(([name, label]) => <label className="f" key={name}>{label}<input name={name} autoComplete="off" maxLength={70} required /></label>)}
      <button className="primary">Periksa latihan</button>
    </form>
    {result !== null && <p role="status">{result ? 'Latihan selesai. ' : 'Coba periksa lagi. '}{task.hint}</p>}
    <button className="ghost" onClick={onBack}>Kembali ke Pusat Praktik</button>
  </section>;
}
