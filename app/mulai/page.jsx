'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Field } from '@/components/ui';
import { errMsg } from '@/lib/format';
import { BUSINESS_TYPES } from '@/lib/business';

// Tambah bisnis: pilih jenis dulu, lalu isi data sesuai jenisnya
export default function Mulai() {
  const router = useRouter();
  const { session, list, loadKos, pickKos } = useKos();
  const [type, setType] = useState(null);
  const [name, setName] = useState('');
  const [addr, setAddr] = useState('');
  const [count, setCount] = useState('10');
  const [prefix, setPrefix] = useState('A');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  if (!session) return null;
  const first = !list || list.length === 0;

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    const n = type === 'properti' ? parseInt(count, 10) : 0;
    if (!name.trim()) return setErr(type === 'properti' ? 'Isi nama kos / properti.' : 'Isi nama usaha.');
    if (!(n >= 0 && n <= 300)) return setErr('Jumlah kamar 0 sampai 300.');
    setBusy(true);
    const { data, error } = await supabase.rpc('create_business', { p_type: type, p_name: name, p_address: addr, p_room_count: n, p_prefix: prefix || 'A' });
    if (error) { setErr(errMsg(error)); setBusy(false); return; }
    await loadKos();
    pickKos(data);
    router.replace(type === 'properti' ? '/kamar' : BUSINESS_TYPES[type].home);
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
        : <p className="muted" style={{ margin: 0 }}>Setelah dibuat: masukkan barang di <b>Barang & stok</b>, catat uang awal laci di <b>Kas & kasbon</b>, lalu mulai jualan di <b>Kasir</b>.</p>}
      <form className="stack" onSubmit={submit}>
        <Field label={type === 'properti' ? 'Nama kos / properti' : 'Nama usaha'}><input value={name} onChange={(e) => setName(e.target.value)} placeholder={type === 'properti' ? 'mis. Kos Melati' : 'mis. Toko Subur'} /></Field>
        <Field label="Alamat (opsional)"><input value={addr} onChange={(e) => setAddr(e.target.value)} /></Field>
        {type === 'properti' && (
          <div className="row">
            <Field label="Jumlah kamar"><input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} /></Field>
            <Field label="Awalan kode" hint="A → A01, A02, …"><input value={prefix} maxLength={3} onChange={(e) => setPrefix(e.target.value.toUpperCase())} /></Field>
          </div>
        )}
        {err && <div className="notice bad">{err}</div>}
        <button className="cta" disabled={busy}>{busy ? 'Menyiapkan…' : 'Buat bisnis'}</button>
        <button type="button" className="ghost" onClick={() => setType(null)}>← Pilih jenis lain</button>
      </form>
    </div>
  );
}
