// Mockup hero: Ringkasan pemilik dengan dua bisnis (kos & toko). DATA CONTOH, bukan data pengguna.
import NavIcon from '@/components/NavIcon';

const rp = (n) => 'Rp ' + new Intl.NumberFormat('id-ID').format(n);

export default function HeroMulti() {
  return (
    <div className="ph" aria-label="Contoh tampilan Ringkasan bisnis PRASARA dengan data contoh">
      <div className="ph-screen">
        <div className="ph-head">
          <div className="ph-brand"><span className="ph-mark">P</span><b>PRASARA</b></div>
          <span className="ph-sub">Selamat pagi</span>
          <b className="ph-title">2 bisnis · 3 hal perlu ditindaklanjuti</b>
        </div>
        <div className="ph-body">
          <span className="ph-demo">DATA CONTOH</span>
          <div className="ph-card">
            <b className="ph-h">Perlu perhatian hari ini</b>
            <div className="ph-row"><i className="dot bad" />2 tagihan kos jatuh tempo<span>Kos ›</span></div>
            <div className="ph-row"><i className="dot gold" />1 bukti transfer menunggu<span>Kos ›</span></div>
            <div className="ph-row"><i className="dot gold" />3 barang menipis<span>Toko ›</span></div>
          </div>
          <div className="ph-card">
            <div className="ph-biz"><span className="ph-ic">🏠</span><div><b>Kos Melati</b><small>Properti &amp; Sewa</small></div><em className="ok">9/10 terisi</em></div>
            <div className="ph-kpis"><div><small>Uang masuk</small><b>{rp(8250000)}</b></div><div><small>Tunggakan</small><b className="bad">{rp(750000)}</b></div></div>
          </div>
          <div className="ph-card">
            <div className="ph-biz"><span className="ph-ic">🛒</span><div><b>Toko Sumber Rezeki</b><small>Retail &amp; Grosir</small></div><em>42 transaksi</em></div>
            <div className="ph-kpis"><div><small>Penjualan hari ini</small><b>{rp(3415000)}</b></div><div><small>Laba kotor</small><b>{rp(482000)}</b></div></div>
          </div>
        </div>
        <div className="ph-nav" aria-hidden="true">
          <span className="on"><NavIcon name="/beranda" size={18} />Ringkasan</span>
          <span><NavIcon name="/bisnis" size={18} />Bisnis</span>
          <span><NavIcon name="/bantuan" size={18} />Bantuan</span>
          <span><NavIcon name="more" size={18} />Lainnya</span>
        </div>
      </div>
    </div>
  );
}

// Mockup kasir toko (DATA CONTOH)
export function KasirMock() {
  const items = [['Beras 5 kg', 'karung', 72000], ['Minyak goreng 2L', 'pcs', 36500], ['Gula pasir', 'kg', 17500], ['Telur ayam', 'kg', 29000], ['Indomie goreng', 'dus', 118000], ['Teh botol', 'krat', 110000]];
  return (
    <div className="ph" aria-label="Contoh tampilan Kasir toko dengan data contoh">
      <div className="ph-screen">
        <div className="ph-head sm">
          <div className="ph-brand"><span className="ph-mark">P</span><b>Toko Sumber Rezeki</b></div>
          <div className="ph-search">Cari nama, kode, atau scan barcode <span>📷</span></div>
        </div>
        <div className="ph-body">
          <span className="ph-demo">DATA CONTOH</span>
          <div className="ph-seg"><span className="on">Eceran</span><span>Grosir</span></div>
          <div className="ph-quick">{items.map(([n, u, p]) => <div key={n}><b>{n}</b><small>{u} · {rp(p)}</small></div>)}</div>
        </div>
        <div className="ph-cart"><span>3 barang</span><b>{rp(126000)}</b><em>Bayar ›</em></div>
      </div>
    </div>
  );
}
