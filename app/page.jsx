import Link from 'next/link';
import { PLANS, FEATURES, BUSINESS } from '@/lib/plan';
import LandingNav from '@/components/LandingNav';
import { ScrDashboard, ScrRooms, ScrInvoices, ScrReminder, ScrReport, ScrReceipt } from '@/components/demo/Screens';

export const metadata = {
  title: 'Kos Hunian — Aplikasi Pengelolaan Kos untuk Pemilik Kos Indonesia',
  description: 'Catat kamar, penghuni, tagihan sewa otomatis, pembayaran, dan laporan keuangan kos dari HP. Gratis untuk 5 kamar.',
};

const rp = (n) => 'Rp' + new Intl.NumberFormat('id-ID').format(n);
const WaIcon = () => <svg className="wa-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.4-.2Z"/></svg>;
const wa = `https://wa.me/${BUSINESS.whatsapp}?text=${encodeURIComponent('Halo, saya ingin tanya tentang aplikasi Kos Hunian.')}`;

const SHOWCASE = [
  [ScrDashboard, 'Dashboard', 'Kas bersih, hunian, dan siapa yang menunggak — sekali lihat.'],
  [ScrRooms, 'Peta kamar', 'Status, penghuni, harga, dan tunggakan tiap kamar.'],
  [ScrInvoices, 'Tagihan otomatis', 'Terbit sendiri tiap bulan, lengkap dengan status bayar.'],
  [ScrReminder, 'Pengingat WhatsApp', 'Rincian tagihan tersusun rapi, tinggal kirim.'],
  [ScrReport, 'Laporan laba rugi', 'Pendapatan, biaya, laba, dan tren 6 bulan.'],
  [ScrReceipt, 'Kwitansi', 'Kirim ke penghuni via WhatsApp atau cetak PDF.'],
];

const PAINS = [
  ['📒', 'Catatan tercecer', 'Buku tulis, catatan HP, dan chat WhatsApp — susah dicari saat dibutuhkan.'],
  ['⏰', 'Lupa siapa yang belum bayar', 'Tagihan menumpuk tanpa sadar, menagih pun jadi canggung.'],
  ['📉', 'Untung atau rugi?', 'Uang masuk dan keluar bercampur, laba bersih kos tidak pernah jelas.'],
];

const FEATS = [
  ['🏠', 'Peta kamar sekilas', 'Lihat kamar terisi, kosong, atau dalam perbaikan — beserta penghuni dan tunggakannya.'],
  ['🧾', 'Tagihan sewa otomatis', 'Tagihan bulanan terbit sendiri sesuai tanggal masuk penghuni. Tidak ada yang terlewat.'],
  ['💬', 'Pengingat WhatsApp', 'Satu ketukan untuk mengirim rincian tagihan yang sopan ke penghuni.'],
  ['💰', 'Catat pembayaran', 'Tunai, transfer, atau QRIS — termasuk bayar sebagian. Sisa tagihan dihitung otomatis.'],
  ['📊', 'Laporan laba rugi', 'Pendapatan, biaya, dan laba bersih tiap bulan. Siap untuk pembukuan.'],
  ['🔒', 'Data aman & terpisah', 'Setiap pemilik hanya bisa melihat data kosnya sendiri. Bisa dibuka dari HP mana saja.'],
];

const FAQ = [
  ['Apakah perlu memasang aplikasi?', 'Tidak. Kos Hunian dibuka lewat browser di HP atau laptop. Bisa juga ditambahkan ke layar utama HP agar terasa seperti aplikasi.'],
  ['Bagaimana masa coba gratisnya?', `Setiap kos baru mendapat ${BUSINESS.trialDays} hari akses penuh. Setelah itu otomatis menjadi paket Gratis (maks ${BUSINESS.freeRoomLimit} kamar terisi) kecuali Anda berlangganan. Data tidak pernah dihapus.`],
  ['Bagaimana cara membayar langganan?', 'Lewat QRIS atau transfer bank dari menu Langganan di dalam aplikasi, lalu konfirmasi via WhatsApp. Paket aktif setelah pembayaran diperiksa.'],
  ['Apakah data saya aman?', 'Data disimpan di server database terenkripsi dan dipisahkan per pemilik. Orang lain — termasuk pemilik kos lain — tidak dapat melihat data Anda.'],
  ['Kalau berhenti berlangganan, data saya hilang?', 'Tidak. Data tetap tersimpan dan bisa dilihat. Hanya fitur berbayar dan kamar di atas batas paket Gratis yang terkunci.'],
];

function Check({ v }) {
  if (v === true) return <span className="lp-yes">✓</span>;
  if (v === false) return <span className="lp-no">—</span>;
  return <span className="small">{v}</span>;
}

export default function Landing() {
  return (
    <div className="lp">
      <LandingNav />

      <section className="lp-hero">
        <div className="wrap lp-hero-in">
          <span className="lp-pill">Untuk pemilik kos di seluruh Indonesia</span>
          <h1>Kelola kos dari HP.<br />Tagihan rapi, uang jelas.</h1>
          <p className="lp-lead">Kos Hunian mencatat kamar, penghuni, tagihan sewa otomatis, pembayaran, dan laba rugi kos Anda — semuanya di satu tempat.</p>
          <div className="row">
            <Link href="/masuk?daftar=1"><button className="cta">Coba gratis {BUSINESS.trialDays} hari</button></Link>
            <a href={wa} target="_blank" rel="noreferrer"><button className="lp-ghost"><WaIcon />Tanya via WhatsApp</button></a>
          </div>
          <p className="small lp-note">Tanpa kartu kredit · Gratis selamanya untuk {BUSINESS.freeRoomLimit} kamar</p>
        </div>
      </section>

      <main className="wrap stack lp-main">
        <section className="lp-sec" id="lihat">
          <h2>Lihat isi aplikasinya</h2>
          <p className="muted" style={{ margin: 0 }}>Contoh kos 10 kamar yang sudah berjalan satu bulan. Geser untuk melihat layar lainnya →</p>
          <div className="showcase">
            {SHOWCASE.map(([Scr, t, c]) => <figure key={t}><Scr /><figcaption><b>{t}</b><span className="muted">{c}</span></figcaption></figure>)}
          </div>
          <div className="row between">
            <span className="demo-note">Nama, nomor, dan angka di atas adalah data contoh.</span>
            <Link href="/panduan" className="small">Lihat panduan lengkap →</Link>
          </div>
        </section>

        <section className="lp-sec">
          <h2>Masalah yang sering dialami pemilik kos</h2>
          <div className="lp-grid3">
            {PAINS.map(([i, t, d]) => <div key={t} className="panel"><span className="lp-ico">{i}</span><h3>{t}</h3><p className="muted small">{d}</p></div>)}
          </div>
        </section>

        <section className="lp-sec" id="fitur">
          <h2>Semua yang Anda butuhkan untuk mengelola kos</h2>
          <div className="lp-grid3">
            {FEATS.map(([i, t, d]) => <div key={t} className="panel"><span className="lp-ico">{i}</span><h3>{t}</h3><p className="muted small">{d}</p></div>)}
          </div>
        </section>

        <section className="lp-sec">
          <h2>Mulai dalam 3 langkah</h2>
          <ol className="lp-steps">
            <li><b>Daftar</b> dengan email — kurang dari 1 menit.</li>
            <li><b>Isi nama kos & jumlah kamar.</b> Kamar dibuat otomatis.</li>
            <li><b>Masukkan penghuni.</b> Tagihan bulanan langsung berjalan sendiri.</li>
          </ol>
        </section>

        <section className="lp-sec" id="harga">
          <h2>Harga sederhana, per kos</h2>
          <p className="muted" style={{ margin: 0 }}>Semua kos baru mendapat akses penuh {BUSINESS.trialDays} hari. Bayar bulanan, bisa berhenti kapan saja.</p>
          <div className="lp-grid3">
            {['gratis', 'standar', 'pro'].map((k) => (
              <div key={k} className={'panel lp-price' + (k === 'standar' ? ' lp-best' : '')}>
                {k === 'standar' && <span className="chip gold" style={{ alignSelf: 'flex-start' }}>Paling pas untuk kos aktif</span>}
                <h3>{PLANS[k].name}</h3>
                <div><span className="lp-amount">{PLANS[k].price ? rp(PLANS[k].price) : 'Rp0'}</span><span className="muted small">{PLANS[k].price ? ' /bulan' : ' selamanya'}</span></div>
                <p className="muted small" style={{ margin: 0 }}>{PLANS[k].tagline}</p>
                <ul className="lp-list">
                  {FEATURES.filter((f) => f[k]).map((f) => (
                    <li key={f.label}>✓ {f.label}{typeof f[k] === 'string' ? ` (${f[k]})` : ''}{f.soon && <span className="chip info" style={{ marginLeft: 6 }}>Segera</span>}</li>
                  ))}
                </ul>
                <Link href="/masuk?daftar=1"><button className={k === 'standar' ? 'cta' : 'primary'} style={{ width: '100%' }}>{k === 'gratis' ? 'Mulai gratis' : `Coba ${PLANS[k].name}`}</button></Link>
              </div>
            ))}
          </div>
          <div className="panel" style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Fitur</th><th className="n">Gratis</th><th className="n">Standar</th><th className="n">Pro</th></tr></thead>
              <tbody>{FEATURES.map((f) => (
                <tr key={f.label}><td>{f.label}{f.soon && <span className="chip info" style={{ marginLeft: 6 }}>Segera</span>}</td><td className="n"><Check v={f.gratis} /></td><td className="n"><Check v={f.standar} /></td><td className="n"><Check v={f.pro} /></td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>

        <section className="lp-sec" id="faq">
          <h2>Pertanyaan umum</h2>
          <p className="muted" style={{ margin: 0 }}>Ingin tahu cara pakainya langkah demi langkah? <Link href="/panduan">Baca panduan lengkap →</Link></p>
          <div className="panel">
            {FAQ.map(([q, a]) => <details key={q} className="lp-faq"><summary>{q}</summary><p className="muted">{a}</p></details>)}
          </div>
        </section>

        <section className="lp-final">
          <h2>Siap merapikan kos Anda?</h2>
          <p>Coba semua fitur gratis selama {BUSINESS.trialDays} hari.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Link href="/masuk?daftar=1"><button className="cta">Daftar sekarang</button></Link>
            <a href={wa} target="_blank" rel="noreferrer"><button className="lp-ghost"><WaIcon />{BUSINESS.whatsappDisplay}</button></a>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="wrap row between">
          <span>© {new Date().getFullYear()} Kos Hunian · Manage Smarter. Live Better.</span>
          <span className="row"><Link href="/panduan">Panduan</Link><a href={wa} target="_blank" rel="noreferrer">Hubungi kami</a></span>
        </div>
      </footer>
    </div>
  );
}
