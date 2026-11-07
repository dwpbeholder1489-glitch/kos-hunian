// Mockup hero: dashboard PRASARA (tablet/desktop) dengan DATA CONTOH — bukan data pengguna mana pun.
import Icon from '@/components/landing/Icon';
import { LogoMark } from '@/components/Logo';

const NAV = [['chart', 'Dashboard'], ['receipt', 'Transaksi'], ['users', 'Pelanggan'], ['box', 'Inventaris'], ['wallet', 'Keuangan'], ['file', 'Laporan']];
// 30 titik penjualan contoh (naik-turun wajar)
const PTS = [42, 48, 45, 52, 50, 58, 55, 61, 57, 63, 60, 66, 62, 59, 64, 70, 67, 72, 69, 75, 71, 74, 78, 73, 79, 82, 77, 84, 81, 88];

function Spark() {
  const w = 300, h = 92, max = 95, min = 35;
  const xy = PTS.map((v, i) => [(i / (PTS.length - 1)) * w, h - ((v - min) / (max - min)) * h]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="dm-spark" preserveAspectRatio="none" aria-hidden="true">
      {[0.25, 0.5, 0.75].map((t) => <line key={t} x1="0" x2={w} y1={h * t} y2={h * t} stroke="var(--dm-line)" strokeWidth="1" />)}
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill="var(--dm-area)" />
      <path d={line} fill="none" stroke="var(--dm-acc)" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

export default function DashMock() {
  return (
    <div className="dm" role="img" aria-label="Contoh tampilan dashboard PRASARA untuk toko grosir, memakai data contoh">
      <span className="dm-badge">Demo Sistem · DATA CONTOH</span>
      <div className="dm-screen">
        <aside className="dm-side" aria-hidden="true">
          <div className="dm-brand"><LogoMark size={18} /><b>PRASARA</b></div>
          {NAV.map(([ic, t], i) => <span key={t} className={i === 0 ? 'on' : ''}><Icon name={ic} size={13} />{t}</span>)}
        </aside>
        <div className="dm-main">
          <div className="dm-top"><b>Dashboard Bisnis</b><span className="dm-pick">Toko Sumber Rezeki ▾</span></div>
          <div className="dm-kpis">
            <div><small>Penjualan bulan ini</small><b>Rp 126.350.000</b><em>↑ 12,4% dari bulan lalu</em></div>
            <div><small>Transaksi</small><b>1.248</b><em>↑ 8,1%</em></div>
            <div className="dm-hide-s"><small>Pelanggan aktif</small><b>342</b><em>↑ 5,6%</em></div>
          </div>
          <div className="dm-row">
            <div className="dm-card dm-chart"><small>Tren penjualan · 30 hari</small><Spark /></div>
            <div className="dm-card dm-act dm-hide-s"><small>Aktivitas terbaru</small>
              <span><i />Penjualan TRX-1248<em>2 mnt lalu</em></span>
              <span><i />Stok masuk: Beras 50 kg<em>15 mnt lalu</em></span>
              <span><i className="att" />Kasbon jatuh tempo<em>1 jam lalu</em></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
