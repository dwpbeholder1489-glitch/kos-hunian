'use client';
import PageHelp from '@/components/PageHelp';
import Link from 'next/link';
import { useData } from '@/lib/useData';
import { Tile, Loading, Empty, InvChip } from '@/components/ui';
import Checklist from '@/components/Checklist';
import { useKos } from '@/components/KosProvider';
import { rp, tgl, today, thisMonth, bulan, invTitle } from '@/lib/format';

export default function Beranda() {
  const d = useData();
  const { kosId } = useKos();
  if (!d.ready) return d.err ? <div className="notice bad">{d.err}</div> : <Loading />;

  const t = today(), ym = thisMonth();
  const in7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const rentable = d.rooms.filter((r) => r.status === 'tersedia' || r.status === 'terisi');
  const filled = d.rooms.filter((r) => r.status === 'terisi').length;
  const occ = rentable.length ? Math.round((filled / rentable.length) * 100) : 0;

  const live = d.invoices.filter((i) => i.status !== 'batal');
  const billedMonth = live.filter((i) => i.due_date.startsWith(ym)).reduce((s, i) => s + i.amount, 0);
  const cashIn = d.payments.filter((p) => p.status === 'terverifikasi' && p.paid_at.startsWith(ym)).reduce((s, p) => s + p.amount, 0);
  const cashOut = d.expenses.filter((x) => x.date.startsWith(ym)).reduce((s, x) => s + x.amount, 0);
  const entIn = d.entries.filter((x) => x.date.startsWith(ym) && ['pendapatan_lain', 'setoran_modal', 'pinjaman_masuk'].includes(x.kind)).reduce((s, x) => s + x.amount, 0);
  const entOut = d.entries.filter((x) => x.date.startsWith(ym) && ['prive', 'bayar_pinjaman'].includes(x.kind)).reduce((s, x) => s + x.amount, 0);
  const overdue = live.filter((i) => i.overdue);
  const arrears = overdue.reduce((s, i) => s + i.outstanding, 0);
  const pending = d.payments.filter((p) => p.status === 'menunggu');
  const upcoming = live.filter((i) => i.outstanding > 0 && !i.overdue && i.due_date <= in7).sort((a, b) => a.due_date.localeCompare(b.due_date));

  const byOcc = new Map();
  for (const i of overdue) byOcc.set(i.occupant_id, (byOcc.get(i.occupant_id) || 0) + i.outstanding);
  const debtors = [...byOcc.entries()].sort((a, b) => b[1] - a[1]);

  if (d.rooms.length === 0) {
    return <Empty title="Belum ada kamar" text="Tambahkan kamar dulu supaya bisa mencatat penghuni dan tagihan."><Link href="/kamar"><button className="primary">Ke halaman Kamar</button></Link></Empty>;
  }

  return (
    <div className="stack">
      <Checklist d={d} kosId={kosId} />
      <div className="row"><h2>Ringkasan {bulan(ym)}</h2><PageHelp page="beranda" /></div>
      <div className="grid">
        <Tile tone="hero" label="Kas bersih bulan ini" value={rp(cashIn + entIn - cashOut - entOut)} sub={`Masuk ${rp(cashIn + entIn)} · keluar ${rp(cashOut + entOut)}`} />
        <Tile label="Hunian" value={`${occ}%`} sub={`${filled} dari ${rentable.length} kamar terisi`} />
        <Tile label="Tagihan bulan ini" value={rp(billedMonth)} sub={`Terkumpul ${rp(cashIn)}`} />
        <Tile tone={arrears > 0 ? 'bad' : ''} label="Tunggakan" value={rp(arrears)} sub={`${overdue.length} tagihan lewat jatuh tempo`} />
      </div>

      {pending.length > 0 && (
        <Link href="/pembayaran" className="notice info" style={{ textDecoration: 'none' }}>
          {pending.length} pembayaran menunggu verifikasi →
        </Link>
      )}

      <section className="panel">
        <div className="row between"><h3>Penghuni menunggak</h3><Link href="/tagihan" className="small">Semua tagihan</Link></div>
        {debtors.length === 0 ? <p className="muted small" style={{ margin: 0 }}>Tidak ada tunggakan. Mantap.</p> : (
          <div className="list">
            {debtors.map(([oid, amt]) => {
              const l = d.activeByOcc.get(oid);
              return (
                <div className="li" key={oid}>
                  <div className="main"><b>{d.occName(oid)}</b><span className="small muted">{l ? 'Kamar ' + d.roomCode(l.room_id) : 'Sudah keluar'}</span></div>
                  <span className="num" style={{ color: 'var(--bad)' }}>{rp(amt)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel">
        <h3>Jatuh tempo 7 hari ke depan</h3>
        {upcoming.length === 0 ? <p className="muted small" style={{ margin: 0 }}>Tidak ada.</p> : (
          <div className="list">
            {upcoming.map((i) => (
              <div className="li" key={i.id}>
                <div className="main"><b>{d.occName(i.occupant_id)} · {d.roomCode(i.room_id)}</b><span className="small muted">{invTitle(i)} · jatuh tempo {tgl(i.due_date)}</span></div>
                <div style={{ textAlign: 'right' }}><div className="num">{rp(i.outstanding)}</div><InvChip inv={i} /></div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
