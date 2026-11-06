'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Loading, Tile } from '@/components/ui';
import { rp, bulan, today, errMsg } from '@/lib/format';
import { typeOf } from '@/lib/business';
import { PLANS } from '@/lib/plan';

// Ringkasan semua bisnis dalam satu akun. Angka tiap bisnis dihitung terpisah, tidak dijumlahkan lintas jenis usaha.
export default function Bisnis() {
  const { kosId, pickKos, ver } = useKos();
  const router = useRouter();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { supabase.rpc('owner_overview').then(({ data, error }) => (error ? setErr(errMsg(error)) : setRows(data || []))); }, [ver]);
  if (err) return <div className="notice bad">{err.includes('owner_overview') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!rows) return <Loading />;
  const open = (b) => { pickKos(b.id); router.push(typeOf(b).home); };
  const props = rows.filter((b) => b.business_type === 'properti');
  return (
    <div className="stack">
      <div className="row between"><div className="row"><h2>Bisnis saya</h2><PageHelp page="bisnis" /></div><Link href="/mulai"><button className="primary">+ Tambah bisnis</button></Link></div>
      <p className="small muted" style={{ margin: 0 }}>Angka bulan {bulan(today().slice(0, 7))}. Setiap bisnis punya pembukuan sendiri; ketuk untuk membukanya.</p>
      {props.length > 1 && (
        <div className="grid">
          <Tile label="Pemasukan semua properti" value={rp(props.reduce((s, b) => s + Number(b.income), 0))} sub={`${props.length} properti`} />
          <Tile label="Belum dibayar" value={rp(props.reduce((s, b) => s + Number(b.outstanding), 0))} sub={`${props.reduce((s, b) => s + b.overdue, 0)} tagihan telat`} tone={props.some((b) => b.overdue) ? 'bad' : ''} />
          <Tile label="Kamar terisi" value={`${props.reduce((s, b) => s + b.occupied, 0)} / ${props.reduce((s, b) => s + b.rooms, 0)}`} sub="semua properti" />
        </div>
      )}
      {rows.map((b) => {
        const t = typeOf(b);
        return (
          <button key={b.id} className="typecard" onClick={() => open(b)} aria-current={b.id === kosId ? 'true' : undefined} style={b.id === kosId ? { borderColor: 'var(--brand)' } : undefined}>
            <span className="typeicon" aria-hidden="true">{t.icon}</span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="row between"><b>{b.name}</b><span className="chip info">{PLANS[b.plan]?.name || b.plan}</span></span>
              <span className="small muted" style={{ fontWeight: 500 }}>{t.name}{b.id === kosId ? ' · sedang dibuka' : ''}</span>
              {b.business_type === 'properti' ? (
                <span className="small" style={{ fontWeight: 500 }}>
                  {b.occupied}/{b.rooms} kamar terisi · masuk {rp(b.income)} · biaya {rp(b.ops)}
                  {Number(b.outstanding) > 0 && <> · <span style={{ color: 'var(--bad)' }}>belum dibayar {rp(b.outstanding)}</span></>}
                  {b.pending > 0 && <> · {b.pending} bukti menunggu</>}
                </span>
              ) : <span className="small muted" style={{ fontWeight: 500 }}>Modul kasir & stok sedang dibangun.</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
