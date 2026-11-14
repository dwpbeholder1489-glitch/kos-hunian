'use client';
// Slip gaji untuk dicetak / PDF / dikirim WA. Data dari payroll_slip (pengelola, atau karyawan sendiri bila sudah dibayar).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Loading, Empty } from '@/components/ui';
import { rp, angka, tgl, waLink, errMsg } from '@/lib/format';
import { terbilang } from '@/lib/terbilang';
import { logoUrl } from '@/lib/logo';

const PAY = { bulanan: 'Bulanan', harian: 'Harian', per_jam: 'Per jam' };
const bulanNama = (iso) => new Date(iso + 'T12:00:00+07:00').toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', month: 'long', year: 'numeric' });

export default function SlipGaji() {
  const { run } = useParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let staff = null;
    try { staff = new URLSearchParams(window.location.search).get('staff'); } catch {}
    const go = async () => {
      if (!staff) return setD({ missing: true });
      const { data, error } = await supabase.rpc('payroll_slip', { p_run: run, p_staff: staff });
      if (error) return /tidak ditemukan/i.test(error.message) ? setD({ missing: true }) : setErr(errMsg(error));
      setD(data);
    };
    go();
  }, [run]);
  if (err) return <div className="notice bad">{/payroll_slip/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!d) return <Loading />;
  if (d.missing) return <Empty title="Slip tidak ditemukan" text="Slip hanya bisa dibuka pengelola, atau oleh karyawan sendiri setelah gaji dibayar." />;
  const { business: b, staff: s, line: l } = d;
  const n = (x) => Number(x) || 0;
  const plusRows = [['Gaji pokok', l.base], ['Tunjangan', l.allowance], [`Lembur (${angka(l.overtime_hours)} jam)`, l.overtime], ['Bonus / insentif', l.bonus]].filter(([, v]) => n(v) > 0);
  const minRows = [['Potongan', l.deduction], ['Potong kasbon', l.advance_deduction]].filter(([, v]) => n(v) > 0);
  const gross = plusRows.reduce((a, [, v]) => a + n(v), 0);
  const msg = `Slip gaji ${bulanNama(d.period)} — ${b.name}\n${s.name}${s.position ? ' (' + s.position + ')' : ''}\n\n` +
    plusRows.map(([k, v]) => `${k}: ${rp(v)}`).join('\n') + (minRows.length ? '\n' + minRows.map(([k, v]) => `${k}: −${rp(v)}`).join('\n') : '') +
    `\n\nDiterima: ${rp(l.net)}${d.paid_date ? `\nDibayar ${tgl(d.paid_date)}` : ''}${n(d.advance_left) > 0 ? `\nSisa kasbon: ${rp(d.advance_left)}` : ''}\n\nTerima kasih atas kerja kerasnya.`;
  return (
    <div className="stack" style={{ maxWidth: 640, margin: '0 auto' }}>
      <div className="row between noprint" style={{ flexWrap: 'wrap', gap: 8 }}>
        <Link href="/sdm"><button className="ghost">← SDM & gaji</button></Link>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {s.phone && <a href={waLink(s.phone, msg)} target="_blank" rel="noreferrer"><button>Kirim WA</button></a>}
          <button className="primary" onClick={() => window.print()}>Cetak / PDF</button>
        </div>
      </div>
      <section className="panel gdoc" style={{ gap: 14 }}>
        <div className="row between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 12 }}>
          <div className="row" style={{ flexWrap: 'nowrap', gap: 10, minWidth: 0, alignItems: 'flex-start' }}>
            {logoUrl(b.logo) && <img src={logoUrl(b.logo)} alt="" width={44} height={44} style={{ borderRadius: 8, objectFit: 'cover', flex: 'none' }} />}
            <div style={{ minWidth: 0 }}><b style={{ fontSize: 17 }}>{b.name}</b>{b.address && <div className="small muted">{b.address}</div>}</div>
          </div>
          <div style={{ textAlign: 'right', flex: 'none' }}><div style={{ fontWeight: 800, fontSize: 18 }}>SLIP GAJI</div><div className="small">{bulanNama(d.period)}</div></div>
        </div>
        {d.status !== 'dibayar' && <div className="notice">DRAF — belum dibayar. Angka bisa berubah.</div>}
        <dl className="kv small">
          <dt>Nama</dt><dd><b>{s.name}</b></dd>
          {s.position && <><dt>Jabatan</dt><dd>{s.position}</dd></>}
          <dt>Sistem gaji</dt><dd>{PAY[s.pay_type]}</dd>
          <dt>Kehadiran</dt><dd>{angka(l.days_present)} hari hadir{n(l.days_absent) ? ` · ${angka(l.days_absent)} hari alpa` : ''}{n(l.hours) ? ` · ${angka(l.hours)} jam` : ''}</dd>
          {d.paid_date && <><dt>Dibayar</dt><dd>{tgl(d.paid_date)} · {d.account === 'bank' ? 'transfer' : 'tunai'}</dd></>}
          {s.bank_info && <><dt>Rekening</dt><dd>{s.bank_info}</dd></>}
        </dl>
        <table className="gdoc-t">
          <thead><tr><th>Penerimaan</th><th className="r">Jumlah</th></tr></thead>
          <tbody>{plusRows.map(([k, v]) => <tr key={k}><td>{k}</td><td className="r">{angka(v)}</td></tr>)}
            <tr><td><b>Total penerimaan</b></td><td className="r"><b>{angka(gross)}</b></td></tr></tbody>
        </table>
        {minRows.length > 0 && <table className="gdoc-t">
          <thead><tr><th>Potongan</th><th className="r">Jumlah</th></tr></thead>
          <tbody>{minRows.map(([k, v]) => <tr key={k}><td>{k}</td><td className="r">{angka(v)}</td></tr>)}</tbody>
        </table>}
        <div className="row between" style={{ fontSize: 18 }}><b>Diterima</b><b>{rp(l.net)}</b></div>
        <div className="small"><i>Terbilang: {terbilang(n(l.net))} rupiah</i></div>
        {l.note && <div className="small">Catatan: {l.note}</div>}
        {n(d.advance_left) > 0 && <div className="small muted">Sisa kasbon belum dipotong: {rp(d.advance_left)}</div>}
        <div className="gdoc-sign">
          <div><span className="small">Penerima</span><div className="gdoc-line">{s.name}</div></div>
          <div><span className="small">Hormat kami,</span><div className="gdoc-line">{b.name}</div></div>
        </div>
      </section>
    </div>
  );
}
