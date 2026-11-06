'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Field } from '@/components/ui';
import { errMsg } from '@/lib/format';

export default function Mulai() {
  const router = useRouter();
  const { session, list, loadKos, pickKos } = useKos();
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
    const n = parseInt(count, 10);
    if (!name.trim()) return setErr('Isi nama kos.');
    if (!(n >= 0 && n <= 300)) return setErr('Jumlah kamar 0 sampai 300.');
    setBusy(true);
    const { data, error } = await supabase.rpc('create_kos', { p_name: name, p_address: addr, p_room_count: n, p_prefix: prefix || 'A' });
    if (error) { setErr(errMsg(error)); setBusy(false); return; }
    await loadKos();
    pickKos(data);
    router.replace('/kamar');
  }

  return (
    <div className="auth">
      <p className="hello">{first ? 'Daftarkan kos Anda' : 'Tambah kos baru'}</p>
      <p className="muted" style={{ margin: 0 }}>Kamar dibuat otomatis dengan kode berurutan (mis. A01–A10). Harga sewa diisi nanti per kamar.</p>
      <form className="stack" onSubmit={submit}>
        <Field label="Nama kos"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Kos Melati" /></Field>
        <Field label="Alamat (opsional)"><input value={addr} onChange={(e) => setAddr(e.target.value)} /></Field>
        <div className="row">
          <Field label="Jumlah kamar"><input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} /></Field>
          <Field label="Awalan kode" hint="A → A01, A02, …"><input value={prefix} maxLength={3} onChange={(e) => setPrefix(e.target.value.toUpperCase())} /></Field>
        </div>
        {err && <div className="notice bad">{err}</div>}
        <button className="cta" disabled={busy}>{busy ? 'Menyiapkan…' : 'Buat kos'}</button>
        {!first && <button type="button" className="ghost" onClick={() => router.back()}>Batal</button>}
      </form>
    </div>
  );
}
