'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Sheet, Field, toast } from '@/components/ui';
import { rp, tgl, tglShort, today, parseRp, angka, waLink } from '@/lib/format';
import { DEMO_TOKEN, DEMO_PORTAL, demoAnswer } from '@/components/demo/portalDemo';
import { compressImage } from '@/lib/image';

const PAY = { menunggu: ['Diperiksa pengelola', 'gold'], terverifikasi: ['Diterima', 'good'], ditolak: ['Ditolak', 'bad'], dibatalkan: ['Dibatalkan', 'void'] };
const QUICK = ['Berapa tagihan saya bulan ini?', 'Ke mana saya harus transfer?', 'Kapan jatuh tempo berikutnya?', 'Ada kamar kosong untuk teman?'];
const title = (i) => (i.kind === 'sewa' ? `Sewa ${tglShort(i.period_start)} – ${tglShort(i.period_end)}` : i.description || 'Tagihan tambahan');

function InvChip({ i }) {
  if (i.pay_state === 'lunas') return <span className="chip good">Lunas</span>;
  if (i.overdue) return <span className="chip bad">Lewat jatuh tempo</span>;
  if (i.pay_state === 'sebagian') return <span className="chip gold">Dibayar sebagian</span>;
  return <span className="chip info">Belum dibayar</span>;
}

export default function Portal() {
  const { token } = useParams();
  const [p, setP] = useState(undefined);
  const [tab, setTab] = useState('tagihan');
  const [pay, setPay] = useState(null);
  const [ai, setAi] = useState(false);

  const demo = token === DEMO_TOKEN;
  const load = async () => {
    if (demo) { setAi(true); return setP(DEMO_PORTAL); }
    if (!supabase) return setP(null);
    const { data, error } = await supabase.rpc('portal_get', { p_token: token });
    setP(error ? null : data);
  };
  useEffect(() => { load(); if (token !== DEMO_TOKEN) fetch('/api/portal-chat').then((r) => r.json()).then((x) => setAi(Boolean(x.enabled))).catch(() => {}); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (p === undefined) return <main className="auth"><p className="muted">Membuka portal…</p></main>;
  if (p === null) return <main className="auth"><p className="hello">Link tidak ditemukan</p><p className="muted">Link portal ini salah atau sudah diganti. Mintalah link terbaru kepada pengelola kos.</p></main>;
  if (p.locked) return (
    <main className="auth">
      <p className="hello">{p.kos.name}</p>
      <p className="muted">Portal penghuni belum aktif untuk kos ini. Untuk info tagihan, silakan hubungi pengelola.</p>
      {p.kos.contact_phone && <a href={waLink(p.kos.contact_phone, 'Halo, saya penghuni ' + p.kos.name + '.')} target="_blank" rel="noreferrer"><button className="primary" style={{ width: '100%' }}>WhatsApp pengelola</button></a>}
    </main>
  );

  const open = p.invoices.filter((i) => i.outstanding > 0);
  const due = open.reduce((s, i) => s + Number(i.outstanding), 0);
  const waiting = p.payments.filter((x) => x.status === 'menunggu').reduce((s, x) => s + Number(x.amount), 0);

  return (
    <>
      <header className="top">
        <div className="wrap" style={{ paddingBottom: 0 }}>
          <div className="brandrow">
            <div className="brand"><span className="mark">P</span><div><h1>{p.kos.name}</h1><small>Portal penghuni</small></div></div>
            {p.kos.contact_phone && <a className="helpbtn" style={{ width: 'auto', padding: '0 12px', borderRadius: 999, fontSize: 13 }} href={waLink(p.kos.contact_phone, `Halo, saya ${p.occupant.name}${p.lease ? ' kamar ' + p.lease.room : ''}.`)} target="_blank" rel="noreferrer">Hubungi</a>}
          </div>
          <nav className="tabs">
            {[['tagihan', 'Tagihan'], ['riwayat', 'Riwayat'], ['info', 'Info kos'], ...(ai ? [['tanya', 'Tanya asisten']] : [])].map(([k, l]) => (
              <a key={k} href={'#' + k} className={tab === k ? 'on' : ''} onClick={(e) => { e.preventDefault(); setTab(k); }}>{l}</a>
            ))}
          </nav>
        </div>
      </header>
      <main className="wrap stack" style={{ paddingBottom: 60 }}>
        {p.demo && <div className="notice info" style={{ fontWeight: 500 }}><b>Ini halaman contoh.</b> Nama dan angka adalah data contoh. Penghuni Anda akan mendapat link pribadi dengan data aslinya.</div>}
        <div><h2>Halo, {p.occupant.name}</h2>{p.lease && <p className="muted" style={{ margin: 0 }}>Kamar {p.lease.room} · {rp(p.lease.rent)}/bulan{p.lease.status !== 'aktif' ? ' · sewa sudah berakhir' : ''}</p>}</div>

        {tab === 'tagihan' && (
          <>
            <div className={'tile ' + (due > 0 ? 'hero' : '')}>
              <span className="label">Total yang perlu dibayar</span>
              <span className="v" style={{ fontSize: 26 }}>{due > 0 ? rp(due) : 'Lunas semua 🎉'}</span>
              {waiting > 0 && <span className="s">{rp(waiting)} sedang diperiksa pengelola</span>}
            </div>
            {open.length > 0 ? (
              <section className="panel"><div className="list">{open.map((i) => (
                <div className="li" key={i.id} style={{ alignItems: 'flex-start' }}>
                  <div className="main"><b>{title(i)}</b><span className="small muted">Jatuh tempo {tgl(i.due_date)}{Number(i.paid) > 0 ? ` · sudah dibayar ${rp(i.paid)}` : ''}</span>
                    <div style={{ marginTop: 6 }}><button className="sm primary" onClick={() => setPay(i)}>Bayar & kirim bukti</button></div></div>
                  <div style={{ textAlign: 'right' }}><div className="num">{rp(i.outstanding)}</div><InvChip i={i} /></div>
                </div>
              ))}</div></section>
            ) : <p className="muted small" style={{ margin: 0 }}>Tidak ada tagihan yang perlu dibayar. Terima kasih!</p>}
            {p.kos.qris && <QrisPanel src={p.kos.qris} kos={p.kos.name} />}
            {p.kos.payment_info && <section className="panel"><span className="label">Cara bayar</span><p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{p.kos.payment_info}</p></section>}
            <EmailBox demo={demo} token={token} current={p.occupant.email} onSaved={load} />
          </>
        )}

        {tab === 'riwayat' && (
          <section className="panel">
            <h3>Riwayat pembayaran</h3>
            {p.payments.length === 0 ? <p className="muted small" style={{ margin: 0 }}>Belum ada pembayaran.</p> : (
              <div className="list">{p.payments.map((x) => {
                const i = p.invoices.find((v) => v.id === x.invoice_id);
                return <div className="li" key={x.id}><div className="main"><b>{rp(x.amount)}</b><span className="small muted">{tgl(x.paid_at)}{i ? ' · ' + title(i) : ''}</span></div><span className={'chip ' + PAY[x.status][1]}>{PAY[x.status][0]}</span></div>;
              })}</div>
            )}
            <h3 style={{ marginTop: 8 }}>Semua tagihan</h3>
            <div className="list">{p.invoices.map((i) => <div className="li" key={i.id}><div className="main"><b>{title(i)}</b><span className="small muted">Jatuh tempo {tgl(i.due_date)}</span></div><div style={{ textAlign: 'right' }}><div className="num">{rp(i.amount)}</div><InvChip i={i} /></div></div>)}</div>
          </section>
        )}

        {tab === 'info' && (
          <>
            {p.lease && <section className="panel"><span className="label">Kamar Anda</span><dl className="kv"><dt>Kamar</dt><dd>{p.lease.room}</dd><dt>Sewa</dt><dd>{rp(p.lease.rent)}/bulan</dd><dt>Mulai</dt><dd>{tgl(p.lease.start_date)}</dd>{p.lease.facilities?.length > 0 && <><dt>Fasilitas</dt><dd>{p.lease.facilities.join(', ')}</dd></>}</dl></section>}
            {p.kos.house_rules && <section className="panel"><span className="label">Peraturan kos</span><p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{p.kos.house_rules}</p></section>}
            {p.kos.payment_info && <section className="panel"><span className="label">Cara bayar</span><p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{p.kos.payment_info}</p></section>}
            <section className="panel"><span className="label">Alamat & kontak</span><p style={{ margin: 0 }}>{p.kos.address || '—'}</p>{p.kos.contact_phone && <a href={waLink(p.kos.contact_phone, 'Halo, saya ' + p.occupant.name + '.')} target="_blank" rel="noreferrer">WhatsApp pengelola: {p.kos.contact_phone}</a>}</section>
          </>
        )}

        {tab === 'tanya' && ai && <Chat demo={demo} token={token} name={p.occupant.name} kos={p.kos.name} />}
      </main>
      {pay && <PaySheet demo={demo} token={token} inv={pay} info={p.kos.payment_info} qris={p.kos.qris} onClose={() => setPay(null)} onDone={() => { setPay(null); load(); }} />}
    </>
  );
}

function PaySheet({ demo, token, inv, info, qris, onClose, onDone }) {
  const [amt, setAmt] = useState(angka(inv.outstanding));
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState('transfer');
  const [note, setNote] = useState('');
  const [proof, setProof] = useState(null);
  const [busy, setBusy] = useState(false);
  async function pick(e) {
    const f = e.target.files?.[0]; if (!f) return;
    try { setProof(await compressImage(f)); } catch (er) { toast(er.message); }
  }
  async function send() {
    const a = parseRp(amt);
    if (!(a > 0)) return toast('Isi jumlah yang dibayar');
    if (!proof && !confirm('Kirim tanpa foto bukti? Pengelola mungkin perlu waktu lebih lama untuk memeriksa.')) return;
    if (demo) { toast('Contoh: di portal asli, bukti ini terkirim ke pengelola untuk diperiksa.'); return onClose(); }
    setBusy(true);
    let error = null;
    try {
      const r = await fetch('/api/portal-pay', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, invoice: inv.id, amount: a, paid_at: date, method, note, proof }) });
      const x = await r.json(); if (!r.ok) error = x.error || 'Gagal mengirim';
    } catch { error = 'Gagal terhubung. Periksa internet lalu coba lagi.'; }
    setBusy(false);
    if (error) return toast(error);
    toast('Terkirim. Pengelola akan memeriksa pembayaran Anda.');
    onDone();
  }
  return (
    <Sheet title="Bayar & kirim bukti" onClose={onClose}>
      <p className="small muted" style={{ margin: 0 }}>{title(inv)} · sisa {rp(inv.outstanding)}</p>
      {info && <div className="notice info" style={{ whiteSpace: 'pre-wrap', fontWeight: 500 }}><b>Cara bayar</b>{'\n'}{info}</div>}
      {qris && <details><summary className="small" style={{ fontWeight: 800, cursor: 'pointer', minHeight: 36 }}>Tampilkan QRIS</summary><img src={qris} alt="QRIS kos" className="qris" style={{ display: 'block', margin: '8px auto 0' }} /></details>}
      <div className="row">
        <Field label="Jumlah yang dibayar"><input inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} /></Field>
        <Field label="Tanggal bayar"><input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <Field label="Metode"><select value={method} onChange={(e) => setMethod(e.target.value)}><option value="transfer">Transfer bank</option><option value="ewallet">E-wallet / QRIS</option><option value="tunai">Tunai (dititipkan)</option><option value="lainnya">Lainnya</option></select></Field>
      <Field label="Foto bukti transfer" hint="Screenshot dari aplikasi bank / e-wallet">
        <input type="file" accept="image/*" onChange={pick} />
      </Field>
      {proof && <img src={proof} alt="Pratinjau bukti" style={{ maxHeight: 220, objectFit: 'contain', borderRadius: 10, border: '1px solid var(--line)' }} />}
      <Field label="Catatan (opsional)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. transfer dari rekening a.n. ibu" /></Field>
      <button className="cta" onClick={send} disabled={busy}>{busy ? 'Mengirim…' : 'Kirim ke pengelola'}</button>
      <p className="small muted" style={{ margin: 0 }}>Tagihan berubah menjadi lunas setelah pengelola memeriksa uang masuk.</p>
    </Sheet>
  );
}

function Chat({ demo, token, name, kos }) {
  const [msgs, setMsgs] = useState([{ role: 'assistant', content: `Halo ${name}! Saya asisten ${kos}. Saya bisa bantu soal tagihan, cara bayar, jatuh tempo, peraturan, dan info kamar. Mau tanya apa?` }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, busy]);

  async function ask(q) {
    const content = (q ?? text).trim(); if (!content || busy) return;
    const next = [...msgs, { role: 'user', content }];
    setMsgs(next); setText(''); setBusy(true);
    if (demo) { setTimeout(() => { setMsgs([...next, { role: 'assistant', content: demoAnswer(content) }]); setBusy(false); }, 600); return; }
    try {
      const r = await fetch('/api/portal-chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, messages: next.slice(1) }) });
      const x = await r.json();
      setMsgs([...next, { role: 'assistant', content: x.text || x.error || 'Maaf, terjadi kesalahan.' }]);
    } catch { setMsgs([...next, { role: 'assistant', content: 'Gagal terhubung. Periksa internet lalu coba lagi.' }]); }
    setBusy(false);
  }

  return (
    <section className="stack" style={{ gap: 10 }}>
      {msgs.map((m, i) => (
        <div key={i} className={'chatmsg ' + m.role}><div>{m.content}</div></div>
      ))}
      {busy && <div className="chatmsg assistant"><div className="muted">Mengetik…</div></div>}
      {msgs.length === 1 && <div className="row">{QUICK.map((q) => <button key={q} className="sm" onClick={() => ask(q)}>{q}</button>)}</div>}
      <div ref={end} />
      <form className="chatform" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Tulis pertanyaan soal kos…" maxLength={500} />
        <button className="primary" disabled={busy || !text.trim()}>Kirim</button>
      </form>
      <p className="small muted" style={{ margin: 0 }}>Asisten hanya menjawab urusan kos berdasarkan data Anda. Untuk keluhan atau keringanan, hubungi pengelola.</p>
    </section>
  );
}

function EmailBox({ demo, token, current, onSaved }) {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(current || '');
  const [busy, setBusy] = useState(false);
  async function save(v) {
    if (demo) { toast('Contoh: di portal asli, email ini disimpan untuk pengingat.'); return setEdit(false); }
    setBusy(true);
    const { error } = await supabase.rpc('portal_set_email', { p_token: token, p_email: v });
    setBusy(false);
    if (error) return toast(error.message);
    toast(v ? 'Pengingat email aktif' : 'Pengingat email dimatikan');
    setEdit(false); onSaved();
  }
  return (
    <section className="panel">
      <span className="label">Pengingat email</span>
      {current && !edit ? (
        <>
          <p className="small" style={{ margin: 0 }}>Pengingat jatuh tempo dikirim ke <b>{current}</b>: 3 hari sebelum, pada hari jatuh tempo, dan bila terlambat.</p>
          <div className="row"><button className="sm" onClick={() => setEdit(true)}>Ganti email</button><button className="sm ghost danger" onClick={() => save('')} disabled={busy}>Berhenti</button></div>
        </>
      ) : (
        <>
          <p className="small muted" style={{ margin: 0 }}>Mau diingatkan sebelum jatuh tempo? Isi email Anda. Bisa dimatikan kapan saja.</p>
          <div className="row">
            <input type="email" inputMode="email" value={val} onChange={(e) => setVal(e.target.value)} placeholder="nama@gmail.com" style={{ flex: '1 1 200px' }} />
            <button className="primary" onClick={() => save(val.trim())} disabled={busy || !val.trim()}>{busy ? 'Menyimpan…' : 'Aktifkan'}</button>
          </div>
        </>
      )}
    </section>
  );
}

function QrisPanel({ src, kos }) {
  return (
    <section className="panel" style={{ alignItems: 'center', textAlign: 'center' }}>
      <span className="label">Bayar dengan QRIS</span>
      <img src={src} alt={`QRIS ${kos}`} className="qris" />
      <span className="small muted">Scan dengan aplikasi bank atau e-wallet, masukkan nominal sesuai tagihan, lalu tekan "Bayar & kirim bukti".</span>
      <a href={src} download={`QRIS-${kos}.jpg`} className="small">Simpan gambar QRIS</a>
    </section>
  );
}
