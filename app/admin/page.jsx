'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Loading, Tile } from '@/components/ui';
import { rp, angka, errMsg } from '@/lib/format';
import { can } from '@/lib/admin';
import { health } from '@/lib/health';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
const change = (now, prev) => (prev ? `${now >= prev ? '+' : ''}${Math.round(((now - prev) / prev) * 100)}% dari 30 hari sebelumnya` : 'belum ada pembanding');

// Dashboard bisnis PRASARA: semua angka dari database (bisnis milik admin tidak dihitung)
export default function AdminHome() {
  const { adminMe } = useKos();
  const [o, setO] = useState(null);
  const [cs, setCs] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!can(adminMe, 'dashboard.view')) return;
    Promise.all([supabase.rpc('admin_overview'), can(adminMe, 'customers.view') ? supabase.rpc('admin_customers') : Promise.resolve({ data: [] })])
      .then(([a, b]) => (a.error || b.error ? setErr(errMsg(a.error || b.error)) : (setO(a.data), setCs(b.data))));
  }, [adminMe]);

  if (!can(adminMe, 'dashboard.view')) {
    return <div className="stack"><h2>Selamat datang</h2><p className="muted">Pilih menu di atas sesuai tugas Anda.</p></div>;
  }
  if (err) return <div className="notice bad">{err.includes('admin_overview') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!o) return <Loading />;

  const scored = cs.map((c) => ({ ...c, h: health(c) }));
  const risk = scored.filter((c) => c.h.score != null && c.h.score < 60);
  const idle14 = scored.filter((c) => c.idle_days >= 14);
  const paying = (o.plans.dasar || 0) + (o.plans.bisnis || 0) + (o.plans.standar || 0) + o.plans.pro;
  const occ = pct(o.occupied, o.rooms);

  // Peringatan bisnis dengan prioritas
  const alerts = [
    o.pending_old > 0 && ['Tinggi', 'bad', `${o.pending_old} pembayaran langganan menunggu verifikasi lebih dari 24 jam`, '/admin/langganan'],
    o.pending_payments > o.pending_old && ['Sedang', 'gold', `${o.pending_payments - o.pending_old} pembayaran langganan baru menunggu verifikasi`, '/admin/langganan'],
    o.trial_ending > 0 && ['Sedang', 'gold', `${o.trial_ending} masa coba berakhir dalam 3 hari`, '/admin/pelanggan?f=trial'],
    o.expiring > 0 && ['Sedang', 'gold', `${o.expiring} langganan berakhir dalam 7 hari`, '/admin/pelanggan?f=expiring'],
    risk.length > 0 && ['Sedang', 'gold', `${risk.length} pelanggan dengan skor kesehatan di bawah 60`, '/admin/pelanggan?f=risk'],
    idle14.length > 0 && ['Rendah', 'void', `${idle14.length} pelanggan tidak aktif 14 hari atau lebih`, '/admin/pelanggan?f=idle'],
    o.new_prev_30 > 0 && o.new_30 < o.new_prev_30 * 0.7 && ['Rendah', 'void', `Pendaftaran turun: ${o.new_30} vs ${o.new_prev_30} pada 30 hari sebelumnya`, null],
  ].filter(Boolean);

  return (
    <div className="stack">
      <div className="row"><h2>Dashboard bisnis</h2><PageHelp page="admin" /></div>
      <p className="small muted" style={{ margin: 0 }}>Data nyata dari database. Bisnis milik akun admin tidak ikut dihitung.</p>
      <div className="grid">
        <Tile label="Bisnis terdaftar" value={angka(o.businesses)} sub={`${angka(o.accounts)} akun · +${o.new_30} dalam 30 hari`} />
        <Tile label="Berlangganan" value={angka(paying)} sub={`${o.plans.trial} masa coba · ${o.plans.gratis} gratis`} />
        {o.mrr != null && <Tile label="MRR" value={rp(o.mrr)} sub="langganan aktif × harga bulanan" />}
        {o.revenue_30 != null && <Tile label="Pembayaran masuk 30 hari" value={rp(o.revenue_30)} sub={change(Number(o.revenue_30), Number(o.revenue_prev_30))} />}
        <Tile label="Konversi" value={o.businesses ? `${pct(paying, o.businesses)}%` : '—'} sub="bisnis berbayar ÷ semua bisnis" />
        <Tile label="Langganan habis" value={angka(o.expired)} tone={o.expired ? 'bad' : ''} sub="pernah bayar, sudah lewat" />
      </div>

      <section className="panel">
        <h3>Peringatan</h3>
        {alerts.length === 0 ? <span className="small muted">Tidak ada yang perlu ditindaklanjuti.</span> : <div className="list">{alerts.map(([p, tone, text, href]) => (
          <div className="li" key={text}><span><span className={'chip ' + tone} style={{ marginRight: 8 }}>{p}</span>{text}</span>{href && <Link href={href} className="small">Buka ›</Link>}</div>
        ))}</div>}
      </section>

      <div className="cols">
        <section className="panel">
          <h3>Pelanggan per paket</h3>
          {[['Masa coba', o.plans.trial], ['Gratis', o.plans.gratis], ['Dasar', o.plans.dasar || 0], ['Bisnis', o.plans.bisnis || 0], ...(o.plans.standar ? [['Standar (lama)', o.plans.standar]] : []), ['Pro', o.plans.pro]].map(([l, n]) => (
            <div key={l} className="stack" style={{ gap: 4 }}>
              <div className="row between small"><span>{l}</span><b>{n} ({o.businesses ? pct(n, o.businesses) : 0}%)</b></div>
              <div className="pbar"><span style={{ width: `${o.businesses ? (n / o.businesses) * 100 : 0}%` }} /></div>
            </div>
          ))}
        </section>
        <section className="panel">
          <h3>Platform</h3>
          <div className="list">
            <div className="li"><span>Bisnis Properti & Sewa</span><b>{o.by_type.properti || 0}</b></div>
            <div className="li"><span>Bisnis Retail & Grosir</span><b>{o.by_type.retail || 0}</b></div>
            <div className="li"><span>Hunian global</span><b>{occ != null ? `${occ}%` : '—'}</b></div>
            <div className="li"><span className="small muted">kamar terisi ÷ kamar yang disewakan</span><span className="small">{o.occupied} / {o.rooms}</span></div>
            <div className="li"><span>Barang aktif di semua toko</span><b>{angka(o.products)}</b></div>
          </div>
        </section>
      </div>

      <section className="panel">
        <h3>Tindakan cepat</h3>
        <div className="row">
          {can(adminMe, 'customers.view') && <Link href="/admin/pelanggan"><button>Cari pelanggan</button></Link>}
          {can(adminMe, 'customers.view') && <Link href="/admin/pelanggan?f=trial"><button>Masa coba hampir habis</button></Link>}
          {can(adminMe, 'customers.view') && <Link href="/admin/pelanggan?f=idle"><button>Pelanggan tidak aktif</button></Link>}
          {can(adminMe, 'payments.view') && <Link href="/admin/langganan"><button>Verifikasi pembayaran</button></Link>}
          {can(adminMe, 'audit.view') && <Link href="/admin/aktivitas"><button>Catatan audit</button></Link>}
        </div>
      </section>
    </div>
  );
}
