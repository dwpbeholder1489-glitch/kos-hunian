'use client';
import { useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/landing/Icon';

const rp = (n) => 'Rp' + new Intl.NumberFormat('id-ID').format(Math.round(Number(n)));
const hemat = (p, l) => Math.round((1 - Number(p) / Number(l)) * 100);

// Harga & isi paket dikirim dari server (plans_public). Komponen ini hanya menampilkan dan mengganti periode.
export default function Pricing({ plans, best, trialDays, freeName, start }) {
  const year = (pl) => (pl.terms || []).find((t) => Number(t.months) === 12);
  const hasYear = plans.some(year);
  const [per, setPer] = useState('bulan');
  return (
    <>
      {hasYear && (
        <div className="cx-seg" role="group" aria-label="Periode pembayaran" data-rv="">
          <button type="button" aria-pressed={per === 'bulan'} className={per === 'bulan' ? 'on' : ''} onClick={() => setPer('bulan')}>Bulanan</button>
          <button type="button" aria-pressed={per === 'tahun'} className={per === 'tahun' ? 'on' : ''} onClick={() => setPer('tahun')}>Tahunan</button>
        </div>
      )}
      <div className="cx-plans" style={{ '--n': Math.min(4, plans.length) }}>
        {plans.map((pl, i) => {
          const t = per === 'tahun' ? year(pl) : null;
          const price = t ? t.price : pl.price, list = t ? t.list_price : pl.list_price;
          const paid = Number(pl.price) > 0;
          return (
            <div key={pl.key} className={'cx-plan' + (pl.key === best ? ' best' : '')} data-rv="" style={{ '--i': i }}>
              {pl.key === best && <span className="cx-plan-flag">Paling sesuai untuk bisnis aktif</span>}
              <h3>{pl.name}{t ? ' Tahunan' : ''}</h3>
              <p className="cx-plan-tag">{pl.tagline}</p>
              <p className="cx-was">{Number(list) > Number(price) ? <><s>{rp(list)}</s><b>Hemat {hemat(price, list)}%</b></> : ' '}</p>
              <span className="cx-amt" key={per}>{rp(price)}</span>
              <span className="cx-per">
                {!paid ? 'selamanya · tanpa batas waktu' : t ? <>per tahun · dibayar sekali untuk 12 bulan<br />setara {rp(Number(t.price) / 12)} per bulan</> : per === 'tahun' ? <>per bulan · per bisnis<br />paket ini hanya tersedia bulanan</> : <>per bulan · per bisnis{Number(list) > Number(price) ? <><br />harga peluncuran</> : null}</>}
              </span>
              {!pl.is_free && freeName && <p className="cx-note">Semua fitur {freeName}, ditambah:</p>}
              <ul>{pl.rows.map((r) => <li key={r}><Icon name="check" size={17} /><span>{r}</span></li>)}</ul>
              <Link href={start} className={'cx-btn ' + (pl.key === best ? 'pri' : 'out')}>{pl.is_free ? 'Mulai gratis' : pl.trial ? `Coba ${pl.name} ${trialDays} hari` : `Mulai dengan ${pl.name}`}</Link>
            </div>
          );
        })}
      </div>
    </>
  );
}
