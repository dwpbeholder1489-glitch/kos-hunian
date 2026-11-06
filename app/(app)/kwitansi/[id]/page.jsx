'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useKos } from '@/components/KosProvider';
import { useData } from '@/lib/useData';
import { Loading, Empty } from '@/components/ui';
import Locked from '@/components/Locked';
import { hasPlan } from '@/lib/plan';
import { rp, tgl, invTitle, METHOD, waLink } from '@/lib/format';

const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
function terbilang(n) {
  n = Math.floor(Math.abs(n));
  if (n < 12) return SATUAN[n];
  if (n < 20) return terbilang(n - 10) + ' belas';
  if (n < 100) return terbilang(Math.floor(n / 10)) + ' puluh' + (n % 10 ? ' ' + terbilang(n % 10) : '');
  if (n < 200) return 'seratus' + (n - 100 ? ' ' + terbilang(n - 100) : '');
  if (n < 1000) return terbilang(Math.floor(n / 100)) + ' ratus' + (n % 100 ? ' ' + terbilang(n % 100) : '');
  if (n < 2000) return 'seribu' + (n - 1000 ? ' ' + terbilang(n - 1000) : '');
  if (n < 1e6) return terbilang(Math.floor(n / 1000)) + ' ribu' + (n % 1000 ? ' ' + terbilang(n % 1000) : '');
  if (n < 1e9) return terbilang(Math.floor(n / 1e6)) + ' juta' + (n % 1e6 ? ' ' + terbilang(n % 1e6) : '');
  return terbilang(Math.floor(n / 1e9)) + ' miliar' + (n % 1e9 ? ' ' + terbilang(n % 1e9) : '');
}

export default function Kwitansi() {
  const { id } = useParams();
  const { kos } = useKos();
  const d = useData();
  if (!hasPlan(kos, 'standar')) return <Locked need="standar" title="Kwitansi PDF" text="Cetak dan kirim kwitansi resmi ke penghuni dengan paket Standar." />;
  if (!d.ready) return <Loading />;
  const p = d.payments.find((x) => x.id === id);
  const inv = p && d.invById.get(p.invoice_id);
  if (!p || !inv) return <Empty title="Kwitansi tidak ditemukan" />;
  if (p.status !== 'terverifikasi') return <Empty title="Pembayaran belum terverifikasi" text="Kwitansi hanya untuk pembayaran yang sudah diterima." />;

  const occ = d.occById.get(inv.occupant_id);
  const no = 'KW-' + p.paid_at.replace(/-/g, '') + '-' + p.id.slice(0, 4).toUpperCase();
  const words = terbilang(p.amount);
  const msg = `Halo ${occ?.name || ''}, terima kasih. Pembayaran Anda sudah kami terima:\n\nNo. ${no}\n${invTitle(inv)} · Kamar ${d.roomCode(inv.room_id)}\nJumlah: ${rp(p.amount)}\nTanggal: ${tgl(p.paid_at)}\nSisa tagihan ini: ${rp(inv.outstanding)}\n\n— ${kos.name}`;

  return (
    <div className="stack">
      <div className="row between noprint">
        <Link href="/tagihan"><button className="ghost">← Tagihan</button></Link>
        <div className="row">
          {occ?.phone && <a href={waLink(occ.phone, msg)} target="_blank" rel="noreferrer"><button>Kirim via WhatsApp</button></a>}
          <button className="primary" onClick={() => window.print()}>Cetak / PDF</button>
        </div>
      </div>
      <p className="small muted noprint" style={{ margin: 0 }}>Pilih "Simpan sebagai PDF" di jendela cetak untuk mendapat file PDF.</p>

      <section className="panel" style={{ gap: 16 }}>
        <div className="row between" style={{ alignItems: 'flex-start' }}>
          <div className="brand"><span className="mark">P</span><div><b style={{ fontSize: 18 }}>{kos.name}</b>{kos.address && <div className="small muted">{kos.address}</div>}</div></div>
          <div style={{ textAlign: 'right' }}><div style={{ fontFamily: 'var(--display)', fontSize: 28, lineHeight: 1 }}>Kwitansi</div><div className="small muted">No. {no}</div></div>
        </div>
        <dl className="kv" style={{ fontSize: 15 }}>
          <dt>Telah terima dari</dt><dd>{occ?.name || '—'}</dd>
          <dt>Kamar</dt><dd>{d.roomCode(inv.room_id)}</dd>
          <dt>Untuk pembayaran</dt><dd>{invTitle(inv)}</dd>
          <dt>Tanggal bayar</dt><dd>{tgl(p.paid_at)}</dd>
          <dt>Metode</dt><dd>{METHOD[p.method]}{p.ref ? ` · ${p.ref}` : ''}</dd>
        </dl>
        <div style={{ background: 'var(--sunk)', borderRadius: 10, padding: '12px 14px' }}>
          <div className="label">Jumlah</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{rp(p.amount)}</div>
          <div className="small muted" style={{ fontStyle: 'italic', textTransform: 'capitalize' }}>{words} rupiah</div>
        </div>
        <dl className="kv">
          <dt>Total tagihan</dt><dd>{rp(inv.amount)}</dd>
          <dt>Sisa tagihan</dt><dd>{inv.outstanding > 0 ? rp(inv.outstanding) : 'Lunas'}</dd>
        </dl>
        <div className="row between" style={{ alignItems: 'flex-end', marginTop: 12 }}>
          <span className="small muted">Dibuat dengan PRASARA</span>
          <div style={{ textAlign: 'center', minWidth: 160 }}>
            <div className="small muted">{tgl(p.paid_at)}</div>
            <div style={{ height: 56 }} />
            <div style={{ borderTop: '1px solid var(--fg)', paddingTop: 4, fontWeight: 700 }}>Pengelola {kos.name}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
