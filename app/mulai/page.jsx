'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Field } from '@/components/ui';
import { errMsg } from '@/lib/format';
import { BUSINESS_TYPES } from '@/lib/business';
import { PROFILE_Q, qFor, recommend } from '@/lib/modules';

// Tambah bisnis: pilih jenis dulu, lalu isi data sesuai jenisnya
export default function Mulai() {
  const router = useRouter();
  const { session, list, loadKos, pickKos } = useKos();
  const [type, setType] = useState(null);
  const [name, setName] = useState('');
  const [addr, setAddr] = useState('');
  const [count, setCount] = useState('10');
  const [prefix, setPrefix] = useState('A');
  const [tpl, setTpl] = useState('laundry'); // contoh awal bisnis jasa
  const [ktpl, setKtpl] = useState('bengkel'); // template Business Builder
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [answers, setAnswers] = useState({});
  const [mods, setMods] = useState(null);      // katalog modul jenis ini
  const [pick, setPick] = useState(null);      // Set kode modul opsional yang disetujui
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!type) return;
    setMods(null); setPick(null); setTouched(false); setAnswers({});
    supabase.from('modules').select('*').contains('applies_to', [type]).order('sort').then(({ data }) => setMods(data || []));
  }, [type]);
  const recs = useMemo(() => (type ? recommend(type, answers) : {}), [type, answers]);
  const optional = (mods || []).filter((m) => !m.core && m.status === 'available');
  // pilihan awal mengikuti rekomendasi; bila belum menjawab apa pun, semua modul opsional aktif
  const chosen = pick || new Set(Object.keys(recs).length ? Object.keys(recs) : optional.map((m) => m.code));
  const toggle = (c) => { const n = new Set(chosen); n.has(c) ? n.delete(c) : n.add(c); setPick(n); setTouched(true); };
  const answer = (k, v) => { setAnswers({ ...answers, [k]: v }); if (!touched) setPick(null); };

  if (!session) return null;
  const first = !list || list.length === 0;

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    const n = type === 'properti' ? parseInt(count, 10) : 0;
    if (!name.trim()) return setErr(type === 'properti' ? 'Isi nama kos / properti.' : 'Isi nama usaha.');
    if (!(n >= 0 && n <= 300)) return setErr('Jumlah kamar 0 sampai 300.');
    setBusy(true);
    const { data, error } = await supabase.rpc('create_business', { p_type: type, p_name: name, p_address: addr, p_room_count: n, p_prefix: type === 'jasa' ? tpl : type === 'kustom' ? ktpl : prefix || 'A' });
    if (error) { setErr(errMsg(error)); setBusy(false); return; }
    if (mods && mods.length) await supabase.rpc('business_modules_init', { p_kos: data, p_codes: [...chosen] }); // pemilik menyetujui modul awal
    await loadKos();
    pickKos(data);
    router.replace(type === 'properti' ? '/kamar' : type === 'kustom' ? '/builder' : BUSINESS_TYPES[type].home);
  }

  if (!type) {
    return (
      <div className="auth">
        <p className="hello">{first ? 'Daftarkan bisnis Anda' : 'Tambah bisnis'}</p>
        <p className="muted" style={{ margin: 0 }}>Pilih jenis bisnisnya. Satu akun bisa punya banyak bisnis, dan data tiap bisnis tetap terpisah.</p>
        <div className="stack">
          {Object.entries(BUSINESS_TYPES).map(([id, t]) => (
            <button key={id} className="typecard" onClick={() => setType(id)}>
              <span className="typeicon" aria-hidden="true">{t.icon}</span>
              <span style={{ flex: 1, textAlign: 'left' }}><b>{t.name}</b>{!t.ready && <span className="chip gold" style={{ marginLeft: 6 }}>Sedang dibangun</span>}<br /><span className="small muted" style={{ fontWeight: 500 }}>{t.desc}</span></span>
            </button>
          ))}
        </div>
        {!first && <button type="button" className="ghost" onClick={() => router.back()}>Batal</button>}
      </div>
    );
  }

  const t = BUSINESS_TYPES[type];
  return (
    <div className="auth">
      <p className="hello">{t.icon} {t.name}</p>
      {type === 'properti'
        ? <p className="muted" style={{ margin: 0 }}>Kamar dibuat otomatis dengan kode berurutan (mis. A01–A10). Harga sewa diisi nanti per kamar.</p>
        : type === 'kustom'
        ? <p className="muted" style={{ margin: 0 }}>Bisnis dibuat sebagai <b>draf</b>. Setelah dibuat Anda masuk ke <b>Business Builder</b>: sesuaikan jenis data, formulir, alur status, peran, dan laporan, lalu <b>Validasi & Aktifkan</b>.</p>
        : type === 'jasa'
        ? <p className="muted" style={{ margin: 0 }}>Setelah dibuat: cek harga di <b>Layanan & tahap</b>, lalu tekan <b>+ Pesanan baru</b> saat pelanggan datang. Semua harga & tahap contoh bisa diubah.</p>
        : <p className="muted" style={{ margin: 0 }}>Setelah dibuat: masukkan barang di <b>Barang & stok</b>, catat uang awal laci di <b>Kas & kasbon</b>, lalu mulai jualan di <b>Kasir</b>.</p>}
      <form className="stack" onSubmit={submit}>
        <Field label={type === 'properti' ? 'Nama kos / properti' : 'Nama usaha'}><input value={name} onChange={(e) => setName(e.target.value)} placeholder={type === 'properti' ? 'mis. Kos Melati' : type === 'jasa' ? 'mis. Laundry Bersih' : type === 'kustom' ? 'mis. Bengkel Jaya Motor' : 'mis. Toko Subur'} /></Field>
        <Field label="Alamat (opsional)"><input value={addr} onChange={(e) => setAddr(e.target.value)} /></Field>
        {type === 'properti' && (
          <div className="row">
            <Field label="Jumlah kamar"><input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} /></Field>
            <Field label="Awalan kode" hint="A → A01, A02, …"><input value={prefix} maxLength={3} onChange={(e) => setPrefix(e.target.value.toUpperCase())} /></Field>
          </div>
        )}
        {type === 'jasa' && (
          <Field label="Mulai dari contoh" hint="Isi awal layanan & tahap proses; bisa diubah kapan saja">
            <div className="seg">{[['laundry', 'Laundry'], ['umum', 'Jasa umum']].map(([k, l]) => <button type="button" key={k} className={tpl === k ? 'on' : ''} onClick={() => setTpl(k)}>{l}</button>)}</div>
            <span className="small muted">{tpl === 'laundry' ? 'Tahap Cuci → Kering → Setrika → Cek kualitas → Kemas; layanan kiloan & satuan (bed cover, selimut, jas, sepatu) dengan harga contoh.' : 'Tahap Dikerjakan → Dicek; layanan & harga diisi sendiri di Layanan & tahap. Cocok untuk jahit, servis, cetak, dll.'}</span>
          </Field>
        )}
        {type === 'kustom' && (
          <Field label="Cara membuat">
            <div className="stack" style={{ gap: 8 }}>
              {[['bengkel', '🔧 Template Bengkel motor', 'Pelanggan, Kendaraan, Servis (Antre → Dikerjakan → Menunggu spare part → Selesai → Diambil), laporan jasa & spare part.'],
                ['salon', '💇 Template Salon & barbershop', 'Pelanggan, Janji temu (Dijadwalkan → Datang → Selesai / Tidak datang), laporan per stylist.'],
                ['kosong', '🧩 Bangun sendiri (manual)', 'Mulai dari satu jenis data contoh; tambah sendiri field, status, dan laporan.']].map(([k, l, d]) => (
                <button type="button" key={k} className={'typecard' + (ktpl === k ? ' on' : '')} onClick={() => setKtpl(k)} style={ktpl === k ? { borderColor: 'var(--brand)', boxShadow: 'inset 0 0 0 1px var(--brand)' } : undefined}>
                  <span style={{ flex: 1, textAlign: 'left' }}><b>{l}</b><br /><span className="small muted" style={{ fontWeight: 500 }}>{d}</span></span>
                </button>
              ))}
              <div className="typecard" style={{ opacity: 0.6 }} aria-disabled="true"><span style={{ flex: 1, textAlign: 'left' }}><b>✨ Bangun dengan AI</b> <span className="chip gold">Segera hadir</span><br /><span className="small muted" style={{ fontWeight: 500 }}>Ceritakan usaha dengan bahasa sehari-hari, AI menyusun usulan konfigurasi. Belum tersedia.</span></span></div>
            </div>
          </Field>
        )}
        {mods && mods.length > 0 && <>
          <div className="panel" style={{ gap: 10 }}>
            <b>Ceritakan usaha Anda (opsional)</b>
            <span className="small muted">Dipakai untuk menyarankan modul. Bisa diubah kapan saja di Pusat konfigurasi.</span>
            {PROFILE_Q.filter((q) => qFor(q, type)).map((q) => (
              <Field key={q.key} label={q.label}><select value={answers[q.key] || ''} onChange={(e) => answer(q.key, e.target.value)}><option value="">— lewati —</option>{q.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            ))}
          </div>
          <div className="panel" style={{ gap: 10 }}>
            <b>Tinjau modul yang akan diaktifkan</b>
            <span className="small muted">Selalu aktif: {mods.filter((m) => m.core).map((m) => m.name).join(', ')}.</span>
            {optional.map((m) => (
              <label key={m.code} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                <input type="checkbox" style={{ width: 22, minHeight: 22, marginTop: 2 }} checked={chosen.has(m.code)} onChange={() => toggle(m.code)} />
                <span className="stack" style={{ gap: 2 }}>
                  <b className="small">{m.name}{m.entitlement && <span className="chip info" style={{ marginLeft: 6 }}>Paket berbayar</span>}</b>
                  <span className="small muted">{m.description}</span>
                  {recs[m.code] && <span className="small" style={{ color: 'var(--good)' }}>Disarankan: {recs[m.code].join('; ')}</span>}
                </span>
              </label>
            ))}
            <span className="small muted">Modul berbayar bisa dipakai selama masa coba; setelahnya mengikuti paket. Modul bisa diaktifkan/nonaktifkan nanti tanpa kehilangan data.</span>
          </div>
        </>}
        {err && <div className="notice bad">{err}</div>}
        <button className="cta" disabled={busy}>{busy ? 'Menyiapkan…' : 'Setujui & buat bisnis'}</button>
        <button type="button" className="ghost" onClick={() => setType(null)}>← Pilih jenis lain</button>
      </form>
    </div>
  );
}
