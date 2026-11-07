'use client';
// Pendaftaran bisnis (Automatic Business Setup): pilih satu/lebih kategori → isi info tiap bisnis → PRASARA menyiapkan DRAF
// per bisnis → pemilik meninjau & mengaktifkan di Pusat Konfirmasi. Semua validasi & pembuatan di server (setup_create).
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Field } from '@/components/ui';
import { errMsg } from '@/lib/format';
import LegacyMulai from './Legacy';

const STAGES = [['berjalan', 'Sudah berjalan'], ['baru', 'Baru akan dibangun'], ['dikembangkan', 'Sedang dikembangkan']];
const RELATIONS = [['pemilik', 'Pemilik'], ['pengelola', 'Pengelola'], ['perwakilan', 'Perwakilan perusahaan'], ['baru', 'Ingin membuat bisnis baru']];
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
      <span className="small muted">Langkah {Math.min(step + 1, n + 2)} dari {n + 2}</span>
      <div className="progress" aria-hidden="true"><i style={{ width: `${Math.round((100 * Math.min(step + 1, n + 2)) / (n + 2))}%` }} /></div>
    </div>
  );

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
        <p className="hello">{first ? 'Kenalkan bisnis Anda' : 'Tambah bisnis'}</p>
        <p className="muted" style={{ margin: 0 }}><b>Apa jenis bisnis yang Anda miliki atau kelola?</b> Boleh pilih lebih dari satu — tiap bisnis dibuat terpisah dengan data sendiri. PRASARA menyiapkan draf konfigurasinya; Anda yang meninjau dan menyetujui.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
          {cats.map((c) => {
            const on = sel.includes(c.code);
            return (
              <button key={c.code} type="button" className="typecard" aria-pressed={on} onClick={() => setSel(on ? sel.filter((x) => x !== c.code) : [...sel, c.code])}
                style={{ flexDirection: 'column', gap: 4, minHeight: 96, ...(on ? { borderColor: 'var(--brand)', boxShadow: 'inset 0 0 0 1px var(--brand)' } : {}) }}>
                <span className="row between" style={{ width: '100%' }}><span style={{ fontSize: 22 }} aria-hidden="true">{c.icon}</span>{on && <span className="chip good">✓</span>}</span>
                <b className="small" style={{ textAlign: 'left' }}>{c.name}</b>
                <span className="small muted" style={{ fontWeight: 500, textAlign: 'left', fontSize: 12 }}>{c.description}</span>
              </button>
            );
          })}
        </div>
        {err && <div className="notice bad">{err}</div>}
        <button className="cta" disabled={!n} onClick={() => { setErr(null); setStep(1); }}>{n ? `Lanjut · ${n} bisnis` : 'Pilih minimal satu'}</button>
        <button type="button" className="ghost" onClick={() => setEmployee(true)}>Saya karyawan di bisnis yang sudah memakai PRASARA</button>
        {!first && <button type="button" className="ghost" onClick={() => router.back()}>Batal</button>}
      </div>
    );
  }

  // ---------- Langkah 1..n: informasi tiap bisnis ----------
  if (step <= n) {
    const code = sel[step - 1];
    const { c, engine, tpl, note } = resolve(code);
    const b = biz[code] || {};
    const next = () => {
      if (!(b.name || '').trim() || b.name.trim().length < 2) return setErr('Isi nama bisnis.');
      if (subsOf(code).length && !b.subcategory) return setErr('Pilih subkategori.');
      setErr(null); setStep(step + 1);
    };
    return (
      <div className="auth" style={{ maxWidth: 560 }}>
        <Steps />
        <p className="hello" style={{ fontSize: 26 }}>{c.icon} {c.name}</p>
        {done[code] && <div className="notice">Draf bisnis ini sudah dibuat. Perubahan selanjutnya di Pusat Konfirmasi.</div>}
        <Field label="Nama bisnis"><input value={b.name || ''} onChange={(e) => setB(code, 'name', e.target.value)} placeholder="mis. Laundry Bersih" maxLength={80} disabled={!!done[code]} /></Field>
        {subsOf(code).length > 0 && <Field label="Subkategori"><select value={b.subcategory || ''} onChange={(e) => setB(code, 'subcategory', e.target.value)} disabled={!!done[code]}>
          <option value="">— pilih —</option>{subsOf(code).map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select></Field>}
        <Field label="Lokasi" hint="Kota/kecamatan atau alamat lengkap"><input value={b.location || ''} onChange={(e) => setB(code, 'location', e.target.value)} placeholder="mis. Majalengka" maxLength={200} disabled={!!done[code]} /></Field>
        <Field label="Status bisnis"><div className="seg">{STAGES.map(([k, l]) => <button type="button" key={k} className={(b.stage || 'berjalan') === k ? 'on' : ''} onClick={() => setB(code, 'stage', k)}>{l}</button>)}</div></Field>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <Field label="Hubungan Anda"><select value={b.relation || 'pemilik'} onChange={(e) => setB(code, 'relation', e.target.value)}>{RELATIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Jumlah cabang" hint="0 bila hanya satu tempat"><input inputMode="numeric" value={b.branches ?? '0'} onChange={(e) => setB(code, 'branches', e.target.value.replace(/\D/g, '').slice(0, 3))} /></Field>
        </div>
        {(b.relation === 'pengelola' || b.relation === 'perwakilan') && <span className="small muted">Bila bisnis ini <b>sudah</b> memakai PRASARA, jangan buat baru — minta pemiliknya mengundang Anda di menu Karyawan.</span>}
        {engine && <div className="panel" style={{ gap: 6 }}>
          <span className="label">Yang akan disiapkan</span>
          <span className="small">{tpl?.code === 'kuliner' ? 'Menu & harga, pesanan makan di tempat/bungkus/antar, layar dapur, bahan baku, kas' : ENGINE_NOTE[engine]}{tpl ? ` · template ${tpl.name}` : ''}</span>
          {note && <span className="small muted">{note}</span>}
        </div>}
        {(tpl?.spec?.questions || []).map((q) => <Question key={q.key} q={q} value={b.answers?.[q.key]} onChange={(v) => setA(code, q.key, v)} />)}
        {tpl?.engine === 'jasa' && <span className="small muted">Harga dan estimasi waktu <b>tidak</b> diisi otomatis — Anda mengisinya di Pusat Konfirmasi.</span>}
        {err && <div className="notice bad">{err}</div>}
        <button className="cta" onClick={next}>{step < n ? 'Lanjut ke bisnis berikutnya' : 'Tinjau'}</button>
        <button type="button" className="ghost" onClick={() => { setErr(null); setStep(step - 1); }}>← Kembali</button>
      </div>
    );
  }

  // ---------- Tinjau & buat draf ----------
  const create = async () => {
    setBusy(true); setErr(null);
    const made = { ...done }; const bad = {};
    for (const code of sel) {
      if (made[code]) continue;
      const b = biz[code] || {};
      const ans = { ...(b.answers || {}) };
      if (ans.room_count !== undefined) ans.room_count = ans.room_count === '' ? null : Number(ans.room_count);
      const { data, error } = await supabase.rpc('setup_create', { p: { category: code, subcategory: b.subcategory || null, name: (b.name || '').trim(), location: b.location || '', stage: b.stage || 'berjalan', relation: b.relation || 'pemilik', branches: Number(b.branches || 0), answers: ans } });
      if (error) bad[code] = errMsg(error); else made[code] = data;
    }
    setDone(made); setErrs(bad); setBusy(false);
    if (Object.keys(bad).length) return setErr('Sebagian bisnis belum berhasil dibuat. Periksa pesan di bawah, perbaiki, lalu tekan lagi.');
    await loadKos();
    pickKos(made[sel[0]]);
    router.replace('/konfirmasi');
  };
  return (
    <div className="auth" style={{ maxWidth: 560 }}>
      <Steps />
      <p className="hello" style={{ fontSize: 26 }}>Tinjau</p>
      <p className="muted" style={{ margin: 0 }}>PRASARA akan membuat <b>{n} draf bisnis</b> terpisah. Belum ada yang aktif: menu operasional terbuka setelah Anda menyetujui konfigurasi di <b>Pusat Konfirmasi</b>.</p>
      {sel.map((code, i) => {
        const { c, s, tpl, note } = resolve(code); const b = biz[code] || {};
        return (
          <div className="panel" key={code} style={{ gap: 4 }}>
            <div className="row between"><b>{c.icon} {b.name}</b>{done[code] ? <span className="chip good">Draf dibuat</span> : <button className="sm ghost" onClick={() => setStep(i + 1)}>Ubah</button>}</div>
            <span className="small muted">{c.name}{s ? ` · ${s.name}` : ''} · {STAGES.find(([k]) => k === (b.stage || 'berjalan'))[1]} · {RELATIONS.find(([k]) => k === (b.relation || 'pemilik'))[1]}{Number(b.branches) > 0 ? ` · ${b.branches} cabang` : ''}</span>
            <span className="small">Disiapkan: {tpl?.name || '—'} — modul yang disarankan, {tpl?.code === 'kuliner' ? 'tahap dapur (Dimasak → Siap saji), jumlah meja; menu & harga Anda isi sendiri' : tpl?.engine === 'jasa' ? 'layanan yang Anda pilih (tanpa harga), tahap proses' : tpl?.engine === 'properti' ? 'kamar (harga sewa Anda isi)' : tpl?.engine === 'retail' ? 'cara jual & gudang (barang Anda isi setelah aktif)' : 'data & alur di Business Builder'}, daftar informasi yang perlu dilengkapi{tpl?.spec?.portal ? ', draf halaman bisnis' : ''}.</span>
            {note && <span className="small muted">{note}</span>}
            {errs[code] && <div className="notice bad">{errs[code]}</div>}
          </div>
        );
      })}
      <div className="panel" style={{ opacity: 0.75 }}><span className="small"><b>✨ Asisten AI untuk mengisi draf</b> <span className="chip gold">Segera hadir</span><br /><span className="muted">Saat ini draf disusun dari template per jenis usaha (bukan AI).</span></span></div>
      {err && <div className="notice bad">{err}</div>}
      <button className="cta" disabled={busy} onClick={create}>{busy ? 'Menyiapkan draf…' : `Buat ${n} draf bisnis`}</button>
      <button type="button" className="ghost" disabled={busy} onClick={() => setStep(n)}>← Kembali</button>
    </div>
  );
}
