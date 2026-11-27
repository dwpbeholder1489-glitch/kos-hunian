'use client';

import Link from 'next/link';
import { useState } from 'react';
import NavIcon from '@/components/NavIcon';
import PageHelp from '@/components/PageHelp';
import { rp } from '@/lib/format';
import { ROLES, typeOf } from '@/lib/business';
import { helpFor, knowledgeFor, learningTrack, quizFor, simulationTotals, STAGES } from '@/lib/learning';
import { useLearningStorage } from '@/lib/learningStorage';
import styles from './LearningCenter.module.css';

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

function Simulation({ track, onDone }) {
  const [step, setStep] = useState(0);
  const [search, setSearch] = useState('');
  const [quantities, setQuantities] = useState({});
  const [method, setMethod] = useState('lunas');
  const [amount, setAmount] = useState('');
  const { total, paid, balance, valid } = simulationTotals(track.items, quantities, method, amount);
  function change(i, delta) {
    setQuantities((previous) => ({ ...previous, [i]: Math.min(99, Math.max(0, (previous[i] || 0) + delta)) }));
  }
  return <section className={styles.card}>
    <h3>{step === 2 ? 'Review Transaksi' : 'Simulasi Transaksi'}</h3>
    <p className={styles.demo}><b>DEMO</b> Mode latihan · Data bisnis tetap utuh</p>
    <ol className={styles.stepper}>{['Pilih item', 'Pembayaran', 'Review'].map((label, i) => <li key={label} aria-current={step === i ? 'step' : undefined}><b>{i + 1}</b>{label}</li>)}</ol>
    {step === 0 && <>
      <input type="search" aria-label="Cari item contoh" placeholder="Cari item contoh…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {track.items.map(([name, price], i) => name.toLowerCase().includes(search.toLowerCase()) && <div className={styles.item} key={name}>
        <span><b>{name}</b><br />{rp(price)}</span>
        <button className="ghost" onClick={() => change(i, -1)} disabled={!quantities[i]} aria-label={`Kurangi ${name}`}>−</button>
        <output aria-label={`Jumlah ${name}`}>{quantities[i] || 0}</output>
        <button className="ghost" onClick={() => change(i, 1)} disabled={quantities[i] === 99} aria-label={`Tambah ${name}`}>+</button>
      </div>)}
    </>}
    {step === 1 && <>
      <label className="f">Metode pembayaran
        <select value={method} onChange={(e) => setMethod(e.target.value)}><option value="lunas">Lunas</option><option value="sebagian">Dibayar sebagian</option><option value="belum">Belum dibayar</option></select>
      </label>
      {method === 'sebagian' && <label className="f">Pembayaran diterima
        <input type="number" value={amount} min={1} max={total - 1} onChange={(e) => setAmount(e.target.value)} aria-describedby="demo-amount-hint" />
        <small id="demo-amount-hint">Masukkan nominal rupiah dari Rp1 sampai {rp(total - 1)}.</small>
      </label>}
    </>}
    {step === 2 && <dl className={styles.receipt}>
      <div><dt>Pelanggan</dt><dd>Pelanggan Demo</dd></div>
      {track.items.map(([name, price], i) => quantities[i] > 0 && <div key={name}><dt>{name} × {quantities[i]}</dt><dd>{rp(price * quantities[i])}</dd></div>)}
      <div><dt>Metode pembayaran</dt><dd>{{ lunas: 'Lunas', sebagian: 'Dibayar sebagian', belum: 'Belum dibayar' }[method]}</dd></div>
      <div><dt>Pembayaran diterima</dt><dd>{rp(paid)}</dd></div>
      <div><dt>Sisa tagihan</dt><dd>{rp(balance)}</dd></div>
    </dl>}
    <div className={styles.total}><b>Total transaksi</b><strong>{rp(total)}</strong></div>
    <div className={styles.actions}>
      {step > 0 && <button className="ghost" onClick={() => setStep(step - 1)}>← {step === 2 ? 'Edit' : 'Kembali'}</button>}
      <button className="primary" disabled={step === 0 ? total === 0 : !valid} onClick={() => step < 2 ? setStep(step + 1) : onDone()}>
        {['Lanjutkan ke pembayaran →', 'Review transaksi →', 'Simpan simulasi'][step]}
      </button>
    </div>
  </section>;
}

function Evaluation({ track, onDone }) {
  const questions = quizFor(track);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [picked, setPicked] = useState(null);
  const checked = Object.hasOwn(answers, index);
  const current = questions[index];
  const correct = answers[index] === current?.answer;
  const score = questions.filter((q, i) => answers[i] === q.answer).length;
  if (!current) return <section className={styles.card}>
    <h3>Hasil Evaluasi</h3><strong>{score} / {questions.length} jawaban benar</strong>
    {score < questions.length && <p>Tinjau penjelasan, lalu coba kembali untuk menuntaskan tahap ini.</p>}
    <button className="ghost" onClick={() => { setIndex(0); setAnswers({}); setPicked(null); }}>Ulangi evaluasi</button>
  </section>;
  return <section className={styles.card}>
    <h3>Evaluasi Pemahaman</h3>
    <span className="small muted">Pertanyaan {index + 1} dari {questions.length}</span><Percent value={100 * (index + 1) / questions.length} />
    <fieldset className={styles.quiz}><legend>{current.question}</legend>
      {current.options.map((option, i) => <label key={option}><input type="radio" name="learning-answer" checked={(checked ? answers[index] : picked) === i} onChange={() => setPicked(i)} disabled={checked} />{option}</label>)}
    </fieldset>
    {checked && <p role="status"><b>{correct ? 'Benar.' : 'Belum tepat.'}</b> {current.reason}</p>}
    <div className={styles.actions}>
      {index > 0 && <button className="ghost" onClick={() => { setIndex(index - 1); setPicked(null); }}>← Sebelumnya</button>}
      <button className="primary" disabled={!checked && picked === null} onClick={() => {
        if (!checked) return setAnswers({ ...answers, [index]: picked });
        setIndex(index + 1);
        setPicked(null);
        if (index + 1 === questions.length) onDone(score, questions.length);
      }}>{checked ? 'Lanjutkan →' : 'Cek jawaban'}</button>
    </div>
  </section>;
}

const SHORTCUTS = [
  ['lesson', 'Mulai Belajar', 'play'], ['simulation', 'Simulasi Transaksi', 'cart'],
  ['evaluation', 'Evaluasi Pemahaman', 'done'], ['progress', 'Progres Belajar', '/laporan'],
];

export default function LearningCenter({ kos, scope }) {
  const track = learningTrack(kos);
  return <LearningContent key={`${track.id}:${track.role}`} kos={kos} scope={scope} track={track} />;
}

function LearningContent({ kos, scope, track }) {
  const [record, update] = useLearningStorage(scope, `track:${track.id}:${track.role}`);
  const [view, setView] = useState('home');
  const [lesson, setLesson] = useState(null);
  const [message, setMessage] = useState('');
  const done = record.done || [];
  const next = STAGES.findIndex((_, index) => !done.includes(index));
  const stage = lesson ?? Math.max(0, next);
  const percent = done.length * 20;
  const labels = [`Mengenal ${track.subject}`, 'Memahami data terkait', track.canPractice ? 'Praktik membuat transaksi' : 'Praktik membaca alur', 'Hubungan dengan modul lain', 'Evaluasi pemahaman'];
  const open = (destination, index) => { setView(destination); setLesson(index ?? null); setMessage(''); };
  const goStage = (index = Math.max(0, next)) => open(index === 2 && track.canPractice ? 'simulation' : index === 4 ? 'evaluation' : 'lesson', index);
  const finish = (index, extra) => update({ done: [...new Set([...done, index])], ...extra });
  const dataSteps = adaptiveSteps(kos, track).slice(1, 4);
  return <div className={styles.center} data-guide-learning>
    <div className={styles.heading}>
      <div>{view !== 'home' && <button className="ghost" onClick={() => open('home')}>← Learning Center</button>}
        <h1>{view === 'progress' ? 'Progres Belajar' : 'Learning Center'}</h1>
        <p>{typeOf(kos).name} · {ROLES[track.role]?.name || track.role}</p>
      </div><PageHelp page="learning-center" />
    </div>
    {message && <p className="notice good" role="status">{message}</p>}
    {view === 'home' && <>
      <button data-guide-learning-start className={styles.hero} onClick={() => goStage()}>
        <span className={styles.heroIcon}><NavIcon name="play" size={30} /></span>
        <span><strong>Panduan {track.subject} Interaktif</strong><small>Belajar, praktik, dan pahami alur kerja secara bertahap.</small></span>
        <span aria-hidden="true">→</span>
      </button>
      <div className={styles.shortcuts}>{SHORTCUTS.filter(([id]) => id !== 'simulation' || track.canPractice).map(([id, name, icon]) => <button key={id} onClick={() => id === 'lesson' ? goStage() : open(id)}><NavIcon name={icon} size={22} />{name}</button>)}</div>
    </>}
    {(view === 'home' || view === 'progress') && <div className={styles.grid}>
      <section className={styles.card} data-guide-learning-progress>
        <h3>Progres Belajar</h3><div className={styles.progressRow}><Percent value={percent} /><b>{percent}%</b></div>
        <p className="small muted">{done.length} dari {STAGES.length} tahap selesai</p>
        <ol className={styles.timeline}>{labels.map((label, i) => <li key={label}>
          <button className={i === next ? styles.current : ''} onClick={() => goStage(i)}>
            <span data-done={done.includes(i)} aria-label={done.includes(i) ? 'Selesai' : undefined}>{done.includes(i) ? '✓' : i === next ? <NavIcon name="play" size={13} /> : i + 1}</span><b>Tahap {i + 1}</b>{label}
          </button>
        </li>)}</ol>
      </section>
      <section className={styles.card}>
        <h3>Rekomendasi untuk Anda</h3>
        <p>{next < 0 ? 'Semua tahap selesai. Anda bisa mengulang materi atau menjelajahi modul yang tersedia.' : labels[next]}</p>
        {record.score != null && <p className="small muted">Evaluasi terakhir · {record.score}/{quizFor(track).length} benar</p>}
        <button className="primary" onClick={() => goStage()}>{next < 0 ? 'Pelajari kembali' : done.length ? 'Lanjutkan belajar' : 'Mulai belajar'} →</button>
        <Link className="small" href="/bantuan">Buka Panduan &amp; Bantuan</Link>
      </section>
    </div>}
    {view === 'lesson' && <>
      {stage === 3 ? <ModuleMap track={track} /> : <section className={styles.card}>
        <span className="small muted">Tahap {stage + 1} dari {STAGES.length}</span>
        <Percent value={20 * (stage + 1)} />
        <h3>{labels[stage]}</h3>
        <p>{stage === 0 ? track.explanation : stage === 1 ? 'Kenali informasi yang perlu Anda periksa sebelum melanjutkan.' : 'Amati alur pada modul, lalu cocokkan dengan langkah penggunaan di bawah.'}</p>
        <ul>{(stage === 1 && dataSteps.length ? dataSteps : adaptiveSteps(kos, track)).map((step) => <li key={step}>{step}</li>)}</ul>
        <Link href={track.href}>Buka {track.help.title} →</Link>
      </section>}
      <div className={styles.actions}>
        {stage > 0 && <button className="ghost" onClick={() => goStage(stage - 1)}>← Sebelumnya</button>}
        <button className="primary" onClick={() => { finish(stage); goStage(stage + 1); }}>Lanjutkan →</button>
      </div>
    </>}
    {view === 'simulation' && <Simulation key={track.id} track={track} onDone={() => {
      finish(2); open('lesson', 3); setMessage('Simulasi selesai. Progres latihan telah disimpan.');
    }} />}
    {view === 'evaluation' && <Evaluation key={track.id} track={track} onDone={(score, max) => score === max ? finish(4, { score }) : update({ score })} />}
    {view === 'home' && <div className={styles.grid}><ModuleMap track={track} /><KnowledgeAssistant kos={kos} /></div>}
  </div>;
}

function adaptiveSteps(kos, track) {
  if (track.canPractice) return track.help.steps.slice(0, 4);
  if (track.role === 'operator' && kos.business_type === 'jasa') return ['Lihat antrean pada halaman Pesanan.', 'Pilih pesanan untuk memeriksa tahap pengerjaan.', 'Gunakan alur yang ditetapkan pengelola saat memindahkan tahap.'];
  return helpFor(track.href, track.subject).steps.slice(0, 4);
}
