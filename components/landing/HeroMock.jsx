import { LogoMark } from '@/components/Logo';
import { SITE_HOST } from '@/lib/plan';
// Mockup hero: tampilan Dashboard aplikasi asli (versi lebar) + HP dengan peta kamar. Data contoh.
import { ScrRooms } from '@/components/demo/Screens';
import { rp, KOS, ROOMS, INVOICES, CASH_IN, CASH_OUT, FILLED, RENTABLE, ARREARS, BILLED, MONTH } from '@/components/demo/sample';

const TABS = ['Dashboard', 'Kamar', 'Penghuni', 'Tagihan', 'Pembayaran', 'Pengeluaran', 'Laporan'];

export default function HeroMock() {
  const debtors = ROOMS.filter((r) => r.debt > 0);
  const upcoming = INVOICES.filter((i) => i.state === 'belum');
  return (
    <div className="ln-mock" aria-label="Contoh tampilan Dashboard PRASARA dengan data contoh">
      <div className="ln-browser">
        <div className="ln-browser-bar"><i /><i /><i /><span>{SITE_HOST}/beranda</span></div>
        <div className="ln-app">
          <div className="ln-app-top">
            <div className="ln-app-brand"><LogoMark size={30} /><b>{KOS.name}</b></div>
            <div className="ln-app-tabs">{TABS.map((t, i) => <span key={t} className={i === 0 ? 'on' : ''}>{t}</span>)}</div>
          </div>
          <div className="ln-app-body">
            <div className="ln-app-h">Ringkasan {MONTH}</div>
            <div className="ln-app-tiles">
              <div className="tile hero"><span className="label">Kas bersih bulan ini</span><span className="v">{rp(CASH_IN - CASH_OUT)}</span><span className="s">Masuk {rp(CASH_IN)}</span></div>
              <div className="tile"><span className="label">Hunian</span><span className="v">{Math.round((FILLED / RENTABLE) * 100)}%</span><span className="s">{FILLED} dari {RENTABLE} kamar terisi</span></div>
              <div className="tile"><span className="label">Tagihan bulan ini</span><span className="v">{rp(BILLED)}</span><span className="s">Terkumpul {rp(CASH_IN)}</span></div>
              <div className="tile bad"><span className="label">Tunggakan</span><span className="v">{rp(ARREARS)}</span><span className="s">{debtors.length} penghuni</span></div>
            </div>
            <div className="ln-app-cols">
              <div className="panel"><h3>Penghuni menunggak</h3>
                <div className="list">{debtors.map((r) => <div className="li" key={r.code}><div className="main"><b>{r.who}</b><span className="small muted">Kamar {r.code}</span></div><span className="num" style={{ color: 'var(--bad)' }}>{rp(r.debt)}</span></div>)}</div>
              </div>
              <div className="panel ln-hide-sm"><h3>Jatuh tempo 7 hari ke depan</h3>
                <div className="list">{upcoming.map((i) => <div className="li" key={i.who + i.title}><div className="main"><b>{i.who} · {i.room}</b><span className="small muted">{i.title}</span></div><span className="num">{rp(i.left)}</span></div>)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="ln-phone"><div className="ln-phone-in"><ScrRooms /></div></div>
    </div>
  );
}
