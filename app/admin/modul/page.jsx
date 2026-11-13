'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Loading, Empty, Tile } from '@/components/ui';
import { angka, errMsg } from '@/lib/format';
import { can } from '@/lib/admin';
import { MODULE_TYPES } from '@/lib/modules';
import { FEATURE_CODES } from '@/lib/plan';

const IMPL = { production_ready: ['Siap pakai', 'good'], testing: ['Pengujian', 'gold'], in_development: ['Dikembangkan', 'gold'], planned: ['Direncanakan', 'void'], deprecated: ['Dihentikan', 'bad'] };
const TYPE = { properti: 'Properti', retail: 'Toko', jasa: 'Jasa/kuliner', kustom: 'Kustom' };

// Universal Module Registry (Master Prompt Modul V2.0 Bab 5–6, 44): sumber kebenaran modul platform.
// Hanya metadata & jumlah bisnis yang mengaktifkan — tanpa data transaksi pelanggan.
export default function AdminModul() {
  const { adminMe } = useKos();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [f, setF] = useState({ q: '', impl: '', type: '' });
  useEffect(() => { if (can(adminMe, 'system.view')) supabase.rpc('admin_module_registry').then(({ data, error }) => (error ? setErr(errMsg(error)) : setD(data))); }, [adminMe]);
  if (!can(adminMe, 'system.view')) return <Empty title="Tidak punya izin melihat registry modul" />;
  if (err) return <div className="notice bad">{/admin_module_registry/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;
  const name = (c) => d.find((m) => m.code === c)?.name || c;
  const rows = d.filter((m) => (!f.impl || m.impl_status === f.impl) && (!f.type || m.module_type === f.type) && (!f.q || (m.code + m.name + m.description).toLowerCase().includes(f.q.toLowerCase())));
  const count = (s) => d.filter((m) => m.impl_status === s).length;
  return (
    <div className="stack">
      <div className="row"><h2>Registry modul</h2><PageHelp page="admin-modul" /></div>
      <p className="small muted" style={{ margin: 0 }}>Daftar semua modul platform: jenis, status pengembangan, dependensi, fitur paket, dan berapa bisnis yang memakainya. Status pengembangan berbeda dari status aktif di tiap bisnis.</p>
      <div className="grid">
        <Tile label="Siap pakai" value={count('production_ready')} tone="good" />
        <Tile label="Direncanakan" value={count('planned') + count('in_development') + count('testing')} />
        <Tile label="Dihentikan" value={count('deprecated')} />
      </div>
      <div className="row" style={{ gap: 6 }}>
        <input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} placeholder="Cari kode/nama" aria-label="Cari modul" style={{ flex: 2, minWidth: 140 }} />
        <select value={f.impl} onChange={(e) => setF({ ...f, impl: e.target.value })} aria-label="Status pengembangan" style={{ flex: 1, minWidth: 120 }}><option value="">Semua status</option>{Object.entries(IMPL).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} aria-label="Jenis modul" style={{ flex: 1, minWidth: 120 }}><option value="">Semua jenis</option>{Object.entries(MODULE_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>
      <section className="panel"><div className="list">{rows.map((m) => (
        <details key={m.code} className="li" style={{ display: 'block' }}>
          <summary style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span className="small"><b>{m.name}</b> <span className="muted">· {m.code}</span><br /><span className="muted">{MODULE_TYPES[m.module_type] || m.module_type} · {m.applies_to.map((t) => TYPE[t] || t).join(', ')}{m.core ? ' · inti' : ''}</span></span>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}><span className={'chip ' + IMPL[m.impl_status][1]}>{IMPL[m.impl_status][0]}</span><span className="small muted">{angka(m.bisnis_aktif)} bisnis</span></span>
          </summary>
          <div className="small" style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
            <span>{m.description}</span>
            <span><b>Butuh:</b> {m.depends_on.length ? m.depends_on.map(name).join(', ') : '—'}{m.optional_deps.length ? ` · opsional: ${m.optional_deps.map(name).join(', ')}` : ''}</span>
            <span><b>Dipakai oleh:</b> {d.filter((x) => x.depends_on.includes(m.code)).map((x) => x.name).join(', ') || '—'}</span>
            <span><b>Fitur paket:</b> {[m.entitlement, ...m.feature_keys].filter(Boolean).map((k) => FEATURE_CODES[k] || k).join(', ') || 'semua paket'}</span>
            <span><b>Izin area:</b> {m.area || 'semua anggota'} · <b>Menu:</b> {m.paths.join(', ') || '—'} · <b>Versi</b> {m.version}{m.owner_approval && !m.core ? ' · perubahan oleh pengelola perlu persetujuan pemilik' : ''}</span>
          </div>
        </details>
      ))}</div></section>
    </div>
  );
}
