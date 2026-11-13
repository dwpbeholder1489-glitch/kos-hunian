'use client';
// Pendaftaran bisnis (Automatic Business Setup): pilih satu/lebih kategori → isi info tiap bisnis → PRASARA menyiapkan DRAF
// per bisnis → pemilik meninjau & mengaktifkan di Pusat Konfirmasi. Semua validasi & pembuatan di server (setup_create).
import { useEffect, useState } from 'react';
import Journey from '@/components/Journey';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Field } from '@/components/ui';
import { errMsg } from '@/lib/format';
import { waOk, waNorm } from '@/lib/akun';
import LegacyMulai from './Legacy';

const STAGES = [['berjalan', 'Sudah berjalan'], ['baru', 'Baru akan dibangun'], ['dikembangkan', 'Sedang dikembangkan']];
const RELATIONS = [['pemilik', 'Pemilik'], ['pengelola', 'Pengelola'], ['perwakilan', 'Perwakilan perusahaan'], ['baru', 'Ingin membuat bisnis baru']];
const MANAGED = [['sendiri', 'Saya kelola sendiri'], ['tim', 'Bersama tim / karyawan']];
const NEEDS = [['penjualan', 'Penjualan & transaksi'], ['pembelian', 'Pembelian & pemasok'], ['stok', 'Stok & inventaris'], ['keuangan', 'Keuangan & laporan'], ['pelanggan', 'Pengelolaan pelanggan'], ['karyawan', 'Karyawan'], ['cabang', 'Cabang bisnis']];
const SUBS = ['Identitas', 'Operasional', 'Pengelolaan', 'Kebutuhan'];
const Tag = ({ t }) => <span className={'tag3' + (t === 'Wajib' ? ' req' : '')}>{t}</span>;
const L = (label, t) => <>{label}<Tag t={t} /></>;
const DRAFT_KEY = (uid) => `prasara-mulai-${uid}`;
const ENGINE_NOTE = { properti: 'Kamar, penghuni, tagihan, pembayaran, perbaikan', retail: 'Kasir, stok, belanja ke supplier, kas, laporan', jasa: 'Layanan, pesanan, tahap proses, pembayaran, antar jemput', kustom: 'Business Builder: data, formulir, alur status, laporan' };

function Question({ q, value, onChange }) {
  if (q.type === 'multi') {
    const v = Array.isArray(value) ? value : [];
    return <Field label={q.label}><div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>{q.choices.map(([k, l]) => {
      const on = v.includes(k);
      return <button type="button" key={k} className={'sm' + (on ? ' primary' : '')} aria-pressed={on} onClick={() => onChange(on ? v.filter((x) => x !== k) : [...v, k])}>{on ? '✓ ' : ''}{l}</button>;
    })}</div></Field>;
  }
  if (q.type === 'choice') return <Field label={q.label}><div className="seg">{q.choices.map(([k, l]) => <button type="button" key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}</div></Field>;
  if (q.type === 'yesno') return <Field label={q.label}><div className="seg">{[[true, 'Ya'], [false, 'Tidak']].map(([k, l]) => <button type="button" key={l} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}</div></Field>;
  return <Field label={q.label}><input value={value ?? ''} inputMode={q.type === 'number' ? 'numeric' : undefined} placeholder={q.placeholder} onChange={(e) => onChange(q.type === 'number' ? e.target.value.replace(/\D/g, '') : e.target.value)} /></Field>;
}

export default function Mulai() {
  const router = useRouter();
  const { session, list, loadKos, pickKos } = useKos();
  const [cats, setCats] = useState(null);
  const [subs, setSubs] = useState([]);
  const [tpls, setTpls] = useState({});
  const [legacy, setLegacy] = useState(false);
  const [sel, setSel] = useState([]);          // kode kategori terpilih (urut)
  const [biz, setBiz] = useState({});          // kategori → isian
  const [step, setStep] = useState(0);         // 0 = kategori, 1..n = bisnis, n+1 = tinjau
  const [employee, setEmployee] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState({});        // kategori → id draf yang sudah dibuat
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState(null);
  const [welcomed, setWelcomed] = useState(false);
  const [sub, setSub] = useState(0);           // bagian formulir per bisnis: 0 identitas, 1 operasional, 2 pengelolaan, 3 kebutuhan
  const [restored, setRestored] = useState(false);
  const [ready, setReady] = useState(false);
  const uid = session?.user?.id;

  // Simpan otomatis di perangkat ini; dipulihkan saat halaman dibuka lagi (belum dikirim ke server sampai draf dibuat)
  useEffect(() => {
    if (!uid) return;
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY(uid)) || 'null');
      if (d && Array.isArray(d.sel) && d.sel.length) { setSel(d.sel); setBiz(d.biz || {}); setStep(Math.min(d.step || 0, d.sel.length + 1)); setSub(d.sub || 0); setWelcomed(true); setRestored(true); }
    } catch {}
    setReady(true);
  }, [uid]);
  useEffect(() => {
    if (!uid || !ready) return;
    try { if (sel.length) localStorage.setItem(DRAFT_KEY(uid), JSON.stringify({ sel, biz, step, sub })); else localStorage.removeItem(DRAFT_KEY(uid)); } catch {}
  }, [uid, ready, sel, biz, step, sub]);
  const startOver = () => { setSel([]); setBiz({}); setStep(0); setSub(0); setRestored(false); setErr(null); try { localStorage.removeItem(DRAFT_KEY(uid)); } catch {} };

  useEffect(() => {
    Promise.all([
      supabase.from('biz_categories').select('*').eq('active', true).order('sort'),
      supabase.from('biz_subcategories').select('*').eq('active', true).order('sort'),
      supabase.from('biz_templates').select('code,name,engine,spec'),
    ]).then(([c, s, t]) => {
      if (c.error || !c.data?.length) return setLegacy(true);
      setCats(c.data); setSubs(s.data || []); setTpls(Object.fromEntries((t.data || []).map((x) => [x.code, x])));
    }, () => setLegacy(true));
  }, []);

  const n = sel.length;
  const resolve = (code) => {
    const c = cats?.find((x) => x.code === code); const b = biz[code] || {};
    const s = subs.find((x) => x.code === b.subcategory);
    const engine = s?.engine || c?.engine; const tpl = tpls[s?.template || (s?.engine && s.engine !== c?.engine ? null : c?.template)] || tpls[c?.template];
    return { c, s, engine, tpl, note: s?.note || c?.note };
  };
  const setB = (code, k, v) => setBiz((x) => ({ ...x, [code]: { ...(x[code] || {}), [k]: v } }));
  const setA = (code, k, v) => setBiz((x) => ({ ...x, [code]: { ...(x[code] || {}), answers: { ...(x[code]?.answers || {}), [k]: v } } }));
  const subsOf = (code) => subs.filter((s) => s.category_code === code);
  const first = !list || list.length === 0;

  if (!session) return null;
  if (legacy) return <LegacyMulai />;
  if (!cats) return <div className="auth"><p className="muted">Memuat kategori bisnis…</p></div>;

  const Steps = () => (
    <div className="stack" style={{ gap: 6 }}>
      <span className="small muted">{step >= 1 && step <= n ? `${n > 1 ? `Bisnis ${step} dari ${n} · ` : ''}Bagian ${sub + 1} dari 4: ${SUBS[sub]}` : `Langkah ${Math.min(step + 1, n + 2)} dari ${n + 2}`}</span>
      <div className="progress" aria-hidden="true"><i style={{ width: `${Math.round((100 * (step === 0 ? 1 : step > n ? n * 4 + 2 : (step - 1) * 4 + sub + 2)) / (n * 4 + 2))}%` }} /></div>
      {step >= 1 && <span className="small muted">Tersimpan otomatis di perangkat ini — bisa dilanjutkan nanti.</span>}
    </div>
  );

  // ---------- Sambutan (hanya untuk bisnis pertama) ----------
  if (first && !welcomed && step === 0 && !employee) {
    const nm = session.user?.user_metadata?.name;
    return (
      <div className="auth" style={{ maxWidth: 520 }}>
        <Journey at={2} />
        <p className="hello">Selamat datang di PRASARA{nm ? `, ${String(nm).split(' ')[0]}` : ''}.</p>
        <p className="muted" style={{ margin: 0 }}>Mulai dengan mendaftarkan bisnis Anda. PRASARA akan membantu menyiapkan sistem berdasarkan jenis dan kebutuhan bisnis Anda.</p>
        <ol className="welcome">
          <li><i>1</i><div><b>Daftarkan bisnis Anda</b><span>Pilih jenis usaha dan isi info singkatnya — beberapa menit saja.</span></div></li>
          <li><i>2</i><div><b>Bangun sistem bisnis Anda</b><span>PRASARA menyusun modul yang disarankan; Anda setujui, ubah, atau tolak satu per satu.</span></div></li>
          <li><i>3</i><div><b>Mulai mengelola operasional</b><span>Catat transaksi pertama dari HP. Paket bisa dipilih belakangan.</span></div></li>
        </ol>
        <button className="cta" onClick={() => setWelcomed(true)}>Daftarkan Bisnis Saya</button>
        <button type="button" className="ghost" onClick={() => { setWelcomed(true); setEmployee(true); }}>Saya karyawan di bisnis yang sudah memakai PRASARA</button>
        <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>Isian Anda bisa dilanjutkan nanti — akun tetap aktif walau bisnis belum selesai didaftarkan. <a href="/panduan" target="_blank" rel="noreferrer">Panduan</a></p>
      </div>
    );
  }

  // ---------- Langkah 0: kategori (boleh lebih dari satu) ----------
  if (step === 0) {
    if (employee) return (
      <div className="auth">
        <p className="hello">Bergabung sebagai karyawan</p>
        <p className="muted" style={{ margin: 0 }}>Karyawan tidak membuat bisnis baru. Minta pemilik bisnis membuka menu <b>Karyawan</b> di PRASARA, lalu mengundang email Anda:</p>
        <div className="panel"><b style={{ overflowWrap: 'anywhere' }}>{session.user?.email}</b><span className="small muted">Setelah diundang, keluar lalu masuk lagi. Anda otomatis berada di bisnis itu dengan menu sesuai peran.</span></div>
        <button className="primary" onClick={async () => { const d = await loadKos(); if (d?.length) router.replace('/'); }}>Saya sudah diundang — cek lagi</button>
        <button className="ghost" onClick={() => setEmployee(false)}>← Kembali</button>
      </div>
    );
    return (
      <div className="auth" style={{ maxWidth: 560 }}>
        {first && <Journey at={2} />}
        <p className="hello">{first ? 'Kenalkan bisnis Anda' : 'Tambah bisnis'}</p>
        <p className="muted" style={{ margin: 0 }}><b>Apa jenis bisnis yang Anda miliki atau kelola?</b> Boleh pilih lebih dari satu — tiap bisnis dibuat terpisah dengan data sendiri. PRASARA menyiapkan draf konfigurasinya; Anda yang meninjau dan menyetujui.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          {cats.map((c) => {
            const on = sel.includes(c.code);
            return (
              <button key={c.code} type="button" className="typecard" aria-pressed={on} onClick={() => setSel(on ? sel.filter((x) => x !== c.code) : [...sel, c.code])}
                style={{ flexDirection: 'column', gap: 4, minHeight: 96, ...(on ? { borderColor: 'var(--gold)', boxShadow: 'inset 0 0 0 1px var(--gold)' } : {}) }}>
                <span className="row between" style={{ width: '100%' }}><span style={{ fontSize: 22 }} aria-hidden="true">{c.icon}</span>{on && <span className="chip good">✓</span>}</span>
                <b className="small" style={{ textAlign: 'left' }}>{c.name}</b>
                <span className="small muted" style={{ fontWeight: 500, textAlign: 'left', fontSize: 12 }}>{c.description}</span>
              </button>
            );
          })}
        </div>
        {restored && n > 0 && <div className="notice">Isian Anda sebelumnya dipulihkan. <button type="button" className="linkbtn" onClick={startOver}>Mulai dari awal</button></div>}
        {err && <div className="notice bad">{err}</div>}
        <button className="cta" disabled={!n} onClick={() => { setErr(null); setSub(0); setStep(1); }}>{n ? `Lanjut · ${n} bisnis` : 'Pilih minimal satu'}</button>
        <button type="button" className="ghost" onClick={() => setEmployee(true)}>Saya karyawan di bisnis yang sudah memakai PRASARA</button>
        {!first && <button type="button" className="ghost" onClick={() => router.back()}>Batal</button>}
      </div>
    );
  }

  // ---------- Langkah 1..n: informasi tiap bisnis, per bagian ----------
  const meta = session.user?.user_metadata || {};
  if (step <= n) {
    const code = sel[step - 1];
    const { c, engine, tpl, note } = resolve(code);
    const b = biz[code] || {};
    const locked = !!done[code];
    const needs = Array.isArray(b.needs) ? b.needs : [];
    const phone = b.phone ?? meta.whatsapp ?? '';
    const check = () => {
      if (sub === 0) {
        if (!(b.name || '').trim() || b.name.trim().length < 2) return 'Isi nama bisnis (minimal 2 huruf).';
        if (subsOf(code).length && !b.subcategory) return 'Pilih subkategori.';
      }
      if (sub === 1 && String(phone).trim() && !waOk(phone)) return 'Nomor kontak bisnis belum benar. Contoh: 081234567890. Boleh dikosongkan dulu.';
      return null;
    };
    const next = () => {
      const e = check(); if (e) return setErr(e);
      setErr(null);
      if (sub < 3) return setSub(sub + 1);
      setSub(0); setStep(step + 1);
    };
    const back = () => { setErr(null); if (sub > 0) return setSub(sub - 1); if (step > 1) { setSub(3); return setStep(step - 1); } setStep(0); };
    return (
      <div className="auth" style={{ maxWidth: 560 }}>
        <Steps />
        <p className="hello" style={{ fontSize: 26 }}>{c.icon} {b.name?.trim() || c.name}</p>
        {locked && <div className="notice">Draf bisnis ini sudah dibuat. Perubahan selanjutnya di Pusat Konfirmasi.</div>}

        {sub === 0 && <>
          <Field label={L('Nama bisnis', 'Wajib')}><input value={b.name || ''} onChange={(e) => setB(code, 'name', e.target.value)} placeholder="mis. Laundry Bersih" maxLength={80} disabled={locked} /></Field>
          {subsOf(code).length > 0 && <Field label={L('Jenis usaha', 'Wajib')} hint={`Kategori: ${c.name}`}><select value={b.subcategory || ''} onChange={(e) => setB(code, 'subcategory', e.target.value)} disabled={locked}>
            <option value="">— pilih —</option>{subsOf(code).map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}</select></Field>}
          <Field label={L('Deskripsi singkat', 'Opsional')} hint="Satu–dua kalimat tentang usaha Anda. Jenis usaha khusus? Tuliskan di sini."><textarea rows={3} value={b.description || ''} maxLength={300} onChange={(e) => setB(code, 'description', e.target.value)} placeholder="mis. Laundry kiloan dan satuan, antar jemput gratis radius 3 km" disabled={locked} /></Field>
          <div className="panel" style={{ gap: 4 }}><span className="label">Logo bisnis<Tag t="Bisa nanti" /></span><span className="small muted">Logo dipasang setelah draf bisnis dibuat, di <b>Pusat Konfirmasi</b>.</span></div>
          {engine && <div className="panel" style={{ gap: 6 }}>
            <span className="label">Yang akan disiapkan</span>
            <span className="small">{tpl?.code === 'kuliner' ? 'Menu & harga, pesanan makan di tempat/bungkus/antar, layar dapur, bahan baku, kas' : ENGINE_NOTE[engine]}{tpl ? ` · template ${tpl.name}` : ''}</span>
            {note && <span className="small muted">{note}</span>}
          </div>}
        </>}

        {sub === 1 && <>
          <Field label={L('Alamat atau lokasi', 'Opsional')} hint="Kota/kecamatan atau alamat lengkap"><input value={b.location || ''} onChange={(e) => setB(code, 'location', e.target.value)} placeholder="mis. Jl. Mawar 1, Majalengka" maxLength={200} disabled={locked} /></Field>
          <Field label={L('Nomor kontak bisnis (WhatsApp)', 'Opsional')} hint="Dipakai pelanggan untuk menghubungi usaha Anda"><input inputMode="tel" value={phone} onChange={(e) => setB(code, 'phone', e.target.value.replace(/[^0-9+ -]/g, '').slice(0, 20))} placeholder="081234567890" disabled={locked} /></Field>
          <Field label={L('Jam operasional', 'Bisa nanti')}><input value={b.hours || ''} maxLength={120} onChange={(e) => setB(code, 'hours', e.target.value)} placeholder="mis. Senin–Sabtu 08.00–20.00" disabled={locked} /></Field>
          <Field label={L('Status bisnis', 'Wajib')}><div className="seg">{STAGES.map(([k, l]) => <button type="button" key={k} className={(b.stage || 'berjalan') === k ? 'on' : ''} onClick={() => setB(code, 'stage', k)}>{l}</button>)}</div></Field>
        </>}

        {sub === 2 && <>
          <Field label={L('Nama pemilik', 'Opsional')}><input value={b.owner_name ?? meta.name ?? ''} maxLength={80} onChange={(e) => setB(code, 'owner_name', e.target.value)} placeholder="Nama pemilik usaha" disabled={locked} /></Field>
          <Field label={L('Peran Anda di bisnis ini', 'Wajib')}><select value={b.relation || 'pemilik'} onChange={(e) => setB(code, 'relation', e.target.value)}>{RELATIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          {(b.relation === 'pengelola' || b.relation === 'perwakilan') && <span className="small muted">Bila bisnis ini <b>sudah</b> memakai PRASARA, jangan buat baru — minta pemiliknya mengundang Anda di menu Karyawan.</span>}
          <Field label={L('Cara mengelola', 'Wajib')}><div className="seg">{MANAGED.map(([k, l]) => <button type="button" key={k} className={(b.managed || 'sendiri') === k ? 'on' : ''} onClick={() => setB(code, 'managed', k)}>{l}</button>)}</div></Field>
          {(b.managed || 'sendiri') === 'tim' && <span className="small muted">Karyawan ditambahkan setelah bisnis aktif, di menu <b>Karyawan</b>. Jumlahnya mengikuti paket.</span>}
        </>}

        {sub === 3 && <>
          <Field label={L('Apa saja yang ingin Anda kelola?', 'Opsional')} hint="Boleh lebih dari satu. Ini catatan kebutuhan Anda — modul tetap Anda putuskan sendiri di Pusat Konfirmasi.">
            <div className="needs">{NEEDS.map(([k, l]) => { const on = needs.includes(k); return <button type="button" key={k} aria-pressed={on} onClick={() => setB(code, 'needs', on ? needs.filter((x) => x !== k) : [...needs, k])}>{on ? '✓ ' : ''}{l}</button>; })}</div>
          </Field>
          {needs.includes('cabang') && <Field label={L('Jumlah cabang selain tempat utama', 'Opsional')}><input inputMode="numeric" value={b.branches ?? '0'} onChange={(e) => setB(code, 'branches', e.target.value.replace(/\D/g, '').slice(0, 3))} /></Field>}
          {(tpl?.spec?.questions || []).map((q) => <Question key={q.key} q={q} value={b.answers?.[q.key]} onChange={(v) => setA(code, q.key, v)} />)}
          {tpl?.engine === 'jasa' && <span className="small muted">Harga dan estimasi waktu <b>tidak</b> diisi otomatis — Anda mengisinya di Pusat Konfirmasi.</span>}
        </>}

        {err && <div className="notice bad">{err}</div>}
        <button className="cta" onClick={next}>{sub < 3 ? 'Lanjut' : step < n ? 'Lanjut ke bisnis berikutnya' : 'Lihat ringkasan'}</button>
        <button type="button" className="ghost" onClick={back}>← Kembali</button>
      </div>
    );
  }

  // ---------- Ringkasan & buat draf ----------
  const create = async () => {
    setBusy(true); setErr(null);
    const made = { ...done }; const bad = {};
    for (const code of sel) {
      if (made[code]) continue;
      const b = biz[code] || {};
      const ans = { ...(b.answers || {}) };
      if (ans.room_count !== undefined) ans.room_count = ans.room_count === '' ? null : Number(ans.room_count);
      const ph = String(b.phone ?? meta.whatsapp ?? '').trim();
      const needs = Array.isArray(b.needs) ? b.needs : [];
      const { data, error } = await supabase.rpc('setup_create', { p: { category: code, subcategory: b.subcategory || null, name: (b.name || '').trim(), location: b.location || '', stage: b.stage || 'berjalan', relation: b.relation || 'pemilik',
        branches: needs.includes('cabang') ? Number(b.branches || 0) : 0, answers: ans, description: (b.description || '').trim(), phone: ph && waOk(ph) ? waNorm(ph) : '', hours: (b.hours || '').trim(),
        owner_name: String(b.owner_name ?? meta.name ?? '').trim(), managed: b.managed || 'sendiri', needs } });
      if (error) bad[code] = errMsg(error); else made[code] = data;
    }
    setDone(made); setErrs(bad); setBusy(false);
    if (Object.keys(bad).length) return setErr('Sebagian bisnis belum berhasil dibuat. Periksa pesan di bawah, perbaiki, lalu tekan lagi.');
    try { localStorage.removeItem(DRAFT_KEY(uid)); } catch {}
    setSel([]);
    await loadKos();
    pickKos(made[sel[0]]);
    router.replace('/konfirmasi');
  };
  const goto = (i, sb) => { setErr(null); setSub(sb); setStep(i + 1); };
  return (
    <div className="auth" style={{ maxWidth: 560 }}>
      <Steps />
      <p className="hello" style={{ fontSize: 26 }}>Ringkasan</p>
      <p className="muted" style={{ margin: 0 }}>Periksa dulu sebelum dibuat. PRASARA akan membuat <b>{n} draf bisnis</b>{n > 1 ? ' terpisah' : ''}. Belum ada yang aktif: menu operasional terbuka setelah Anda menyetujui konfigurasi di <b>Pusat Konfirmasi</b>.</p>
      {sel.map((code, i) => {
        const { c, s: sc, tpl, note } = resolve(code); const b = biz[code] || {};
        const needs = Array.isArray(b.needs) ? b.needs : [];
        const ph = String(b.phone ?? meta.whatsapp ?? '').trim();
        const Row = ({ k, v, sb }) => <div className="kv"><span>{k}</span><b>{v || <i className="muted" style={{ fontWeight: 500 }}>belum diisi</i>}{!done[code] && <> <button type="button" className="linkbtn" onClick={() => goto(i, sb)}>Ubah</button></>}</b></div>;
        return (
          <div className="panel" key={code} style={{ gap: 2 }}>
            <div className="row between"><b>{c.icon} {b.name}</b>{done[code] && <span className="chip good">Draf dibuat</span>}</div>
            <Row k="Kategori" v={`${c.name}${sc ? ` · ${sc.name}` : ''}`} sb={0} />
            <Row k="Deskripsi" v={(b.description || '').trim()} sb={0} />
            <Row k="Lokasi" v={(b.location || '').trim()} sb={1} />
            <Row k="Kontak" v={ph} sb={1} />
            <Row k="Jam operasional" v={(b.hours || '').trim()} sb={1} />
            <Row k="Status" v={STAGES.find(([k]) => k === (b.stage || 'berjalan'))[1]} sb={1} />
            <Row k="Pemilik" v={String(b.owner_name ?? meta.name ?? '').trim()} sb={2} />
            <Row k="Peran Anda" v={`${RELATIONS.find(([k]) => k === (b.relation || 'pemilik'))[1]} · ${MANAGED.find(([k]) => k === (b.managed || 'sendiri'))[1].toLowerCase()}`} sb={2} />
            <Row k="Kebutuhan" v={needs.map((k) => NEEDS.find(([x]) => x === k)?.[1]).filter(Boolean).join(', ')} sb={3} />
            <span className="small" style={{ marginTop: 6 }}>Disiapkan: {tpl?.name || '—'} — modul yang disarankan, {tpl?.code === 'kuliner' ? 'tahap dapur (Dimasak → Siap saji), jumlah meja; menu & harga Anda isi sendiri' : tpl?.engine === 'jasa' ? 'layanan yang Anda pilih (tanpa harga), tahap proses' : tpl?.engine === 'properti' ? 'kamar (harga sewa Anda isi)' : tpl?.engine === 'retail' ? 'cara jual & gudang (barang Anda isi setelah aktif)' : 'data & alur di Business Builder'}, daftar informasi yang perlu dilengkapi{tpl?.spec?.portal ? ', draf halaman bisnis' : ''}.</span>
            {note && <span className="small muted">{note}</span>}
            {errs[code] && <div className="notice bad">{errs[code]}</div>}
          </div>
        );
      })}
      <p className="small muted" style={{ margin: 0 }}>Yang belum diisi bisa dilengkapi nanti di Pusat Konfirmasi atau Pengaturan. Isian di atas tidak perlu diketik ulang.</p>
      {err && <div className="notice bad">{err}</div>}
      <button className="cta" disabled={busy} onClick={create}>{busy ? 'Menyiapkan draf…' : `Buat ${n} draf bisnis`}</button>
      <button type="button" className="ghost" disabled={busy} onClick={() => { setSub(3); setStep(n); }}>← Kembali</button>
    </div>
  );
}
