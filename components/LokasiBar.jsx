'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { toast } from '@/components/ui';
import { errMsg } from '@/lib/format';
import { multiLoc } from '@/lib/business';

// Lokasi kerja (cabang/gudang): penjualan, belanja, dan penyesuaian stok tercatat di lokasi ini. Muncul hanya bila ada >1 lokasi.
export default function LokasiBar({ note }) {
  const { kos, kosId, loadKos, bump } = useKos();
  const [busy, setBusy] = useState(false);
  if (!multiLoc(kos)) return null;
  const { list, current, locked } = kos.locs;
  const cur = list.find((b) => b.id === current);
  const change = async (id) => {
    setBusy(true);
    const { error } = await supabase.rpc('my_location_set', { p_kos: kosId, p_branch: id });
    if (error) { setBusy(false); return toast(errMsg(error)); }
    await loadKos(); bump(); setBusy(false);
    toast('Lokasi kerja: ' + (list.find((b) => b.id === id)?.name || ''));
  };
  return (
    <div className="notice" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 12px' }}>
      <span className="small">📍 Lokasi kerja</span>
      {locked ? <b className="small">{cur?.name} <span className="muted">(ditetapkan pemilik)</span></b> : (
        <select value={current || ''} disabled={busy} onChange={(e) => change(e.target.value)} aria-label="Pilih lokasi kerja" style={{ flex: 1, minWidth: 150, minHeight: 36, padding: '4px 8px' }}>
          {list.map((b) => <option key={b.id} value={b.id}>{b.name}{b.is_main ? ' (utama)' : b.kind === 'gudang' ? ' (gudang)' : ''}</option>)}
        </select>
      )}
      {note && <span className="small muted" style={{ flexBasis: '100%' }}>{note}</span>}
    </div>
  );
}
