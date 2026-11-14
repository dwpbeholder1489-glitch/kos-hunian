// Halaman setelah pengunjung mengirim formulir di halaman bisnis: pendaftaran penghuni, booking, pesanan, pesanan meja,
// permintaan, atau reservasi. Menjelaskan status ("menunggu konfirmasi"), langkah berikutnya, kontak pemilik, cara bayar
// (bila diizinkan pemilik), dan info lokasi. Isi ringkasan diambil dari alamat (hanya tampilan di perangkat pengunjung);
// data resmi tetap di database bisnis.
import { notFound } from 'next/navigation';
import Linkify from '@/components/Linkify';
import PublicPay from '@/components/PublicPay';
import SalinNomor from '@/components/SalinNomor';
import { logoUrl } from '@/lib/logo';
import { getPublicPage } from '@/lib/publicPage';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Terkirim', robots: { index: false } };

const rp = (n) => 'Rp' + new Intl.NumberFormat('id-ID').format(Math.round(Number(n) || 0));
const tglP = (d) => { try { return new Date(d + 'T12:00:00+07:00').toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); } catch { return d; } };
const wa = (phone, text) => `https://wa.me/${String(phone || '').replace(/\D/g, '').replace(/^0/, '62')}?text=${encodeURIComponent(text)}`;
const clip = (v, n = 80) => String(v || '').slice(0, n);
const ICON = (u) => (/maps|goo\.gl\/maps|maps\.app/i.test(u) ? '📍' : /instagram|tiktok|facebook|fb\.com/i.test(u) ? '📱' : '🔗');

// Langkah per jenis kiriman: [judul, keterangan]
function steps(k, q, p) {
  const owner = p.name;
  if (k === 'daftar' || k === 'booking') return [
    ['Pendaftaran diterima', `Nomor ${q.no || ''} sudah masuk ke ${owner}.`],
    [q.method === 'tunai' ? 'Pembayaran saat datang' : 'Pemilik mengecek pembayaran', q.method === 'tunai' ? 'Anda memilih bayar tunai saat datang. Kamar belum dikunci sampai dikonfirmasi pemilik.' : 'Pemilik mencocokkan transfer Anda dengan mutasi rekening. Belum transfer? Lakukan sekarang lalu kirim bukti lewat WhatsApp.'],
    ['Konfirmasi lewat WhatsApp', `${owner} mengabari Anda bila kamar sudah dipastikan. Kamar belum pasti sebelum dikonfirmasi.`],
    [k === 'daftar' ? 'Datang & mulai tinggal' : 'Datang pada tanggal booking', `${q.date ? tglP(q.date) + '. ' : ''}Bawa KTP/identitas asli. Tagihan sewa dan link portal penghuni diberikan setelah Anda resmi menjadi penghuni.`],
  ];
  if (k === 'pesanan') return [
    ['Pesanan diterima', `Nomor ${q.no || ''}. Status: menunggu konfirmasi ${owner}.`],
    ['Dikonfirmasi pemilik', 'Pemilik memeriksa pesanan Anda. Total final bisa menyesuaikan (mis. berat sebenarnya).'],
    ['Diproses', 'Pantau tahapnya kapan saja lewat Cek status pesanan (pakai nomor pesanan + No. WhatsApp Anda).'],
    ['Selesai', q.deliver === '1' ? 'Pesanan diantar ke alamat Anda.' : 'Ambil pesanan bila status sudah Siap.'],
  ];
  if (k === 'meja') return [
    ['Pesanan diterima', `Meja ${q.meja || ''} · nomor ${q.no || ''}.`],
    ['Dikonfirmasi kasir', 'Kasir memeriksa pesanan Anda.'],
    ['Disiapkan & diantar ke meja', 'Silakan menunggu di meja Anda.'],
    ['Bayar', 'Bayar di kasir sebelum pulang (atau sesuai aturan tempat ini).'],
  ];
  if (k === 'reservasi') return [
    ['Permintaan reservasi diterima', `Nomor ${q.no || ''}${q.party ? ` · ${q.party} orang` : ''}${q.date ? ` · ${tglP(q.date)}` : ''}${q.time ? ` jam ${q.time.replace(':', '.')}` : ''}.`],
    ['Konfirmasi lewat WhatsApp', `Reservasi belum pasti sampai ${owner} mengonfirmasi.`],
    ['Datang tepat waktu', 'Kabari lewat WhatsApp bila terlambat atau batal.'],
  ];
  return [
    ['Permintaan diterima', `${q.no ? `Nomor ${q.no}. ` : ''}${owner} sudah menerima pesan Anda.`],
    ['Dihubungi lewat WhatsApp', 'Pemilik akan membalas ke No. WhatsApp yang Anda isi. Harga, ketersediaan, dan pengiriman dikonfirmasi saat itu.'],
  ];
}

const TITLE = { daftar: 'Pendaftaran terkirim', booking: 'Booking terkirim', pesanan: 'Pesanan terkirim', meja: 'Pesanan terkirim', reservasi: 'Reservasi terkirim', permintaan: 'Permintaan terkirim' };

export default async function Terkirim({ params, searchParams }) {
  const { slug } = await params;
  const sp = await searchParams;
  const p = await getPublicPage(slug);
  if (!p) notFound();
  const q = Object.fromEntries(['k', 'no', 'n', 'room', 'date', 'plan', 'amt', 'method', 'total', 'meja', 'party', 'time', 'deliver', 'cek'].map((x) => [x, clip(sp?.[x])]));
  const k = TITLE[q.k] ? q.k : 'permintaan';
  const daftar = k === 'daftar' || k === 'booking';
  const waText = daftar ? `Halo ${p.name}, saya ${q.n || ''} sudah mengisi pendaftaran${q.no ? ` nomor ${q.no}` : ''}${q.room ? ` untuk kamar ${q.room}` : ''}. Mohon dicek ya.${q.method && q.method !== 'tunai' ? ' Bukti transfer saya kirim di sini.' : ''}`
    : k === 'pesanan' || k === 'meja' ? `Halo ${p.name}, saya baru memesan${q.no ? ` dengan nomor ${q.no}` : ''}. Mohon dikonfirmasi ya.`
    : k === 'reservasi' ? `Halo ${p.name}, saya baru mengirim reservasi${q.no ? ` nomor ${q.no}` : ''}. Mohon dikonfirmasi ya.`
    : `Halo ${p.name}, saya baru mengirim permintaan${q.no ? ` nomor ${q.no}` : ''} lewat halaman Anda.`;
  const payNote = daftar ? 'Setelah transfer, kirim bukti lewat tombol WhatsApp di atas. Pastikan nama penerima sesuai.'
    : k === 'meja' ? 'Tunjukkan bukti bayar ke kasir agar pesanan ditandai lunas.'
    : 'Sebaiknya bayar setelah pemilik mengonfirmasi pesanan & totalnya. Kirim bukti transfer lewat WhatsApp.';
  const links = (p.links || []).filter((l) => /^https?:\/\//i.test(l.url));
  return (
    <main className="wrap stack" style={{ maxWidth: 640, paddingTop: 20, paddingBottom: 40 }}>
      <header className="row" style={{ flexWrap: 'nowrap', gap: 12 }}>
        {logoUrl(p.logo) && <img src={logoUrl(p.logo)} alt={`Logo ${p.name}`} width={44} height={44} style={{ borderRadius: 10, objectFit: 'cover', flex: 'none', border: '1px solid var(--line)' }} />}
        <div className="stack" style={{ gap: 0, minWidth: 0 }}><b style={{ fontSize: 18 }}>{p.name}</b>{p.address && <span className="small muted">{p.address}</span>}</div>
      </header>

      <section className="panel" style={{ gap: 10, textAlign: 'center', alignItems: 'center' }}>
        <div aria-hidden style={{ width: 56, height: 56, borderRadius: 999, background: 'var(--good-bg)', color: 'var(--good)', display: 'grid', placeItems: 'center', fontSize: 30, fontWeight: 800 }}>✓</div>
        <h1 style={{ margin: 0, fontSize: 24 }}>{TITLE[k]}{q.n ? `, ${q.n}` : ''}!</h1>
        <span className="chip gold">Menunggu konfirmasi {p.name}</span>
        {q.no && <div className="stack" style={{ gap: 4, alignItems: 'center' }}>
          <span className="small muted">Nomor {daftar ? 'pendaftaran' : k === 'reservasi' ? 'reservasi' : k === 'permintaan' ? 'permintaan' : 'pesanan'} Anda</span>
          <b style={{ fontSize: 26, letterSpacing: 0.5 }}>{q.no}</b>
          <SalinNomor text={q.no} />
        </div>}
        <span className="small muted">Simpan nomor ini (screenshot halaman ini juga boleh).</span>
      </section>

      {(daftar || q.total || q.meja) && <section className="panel" style={{ gap: 6 }}>
        <span className="label">Ringkasan</span>
        <dl className="kv">
          {q.room && <><dt>Kamar</dt><dd>{q.room}</dd></>}
          {daftar && <><dt>Rencana</dt><dd>{k === 'daftar' ? 'Langsung huni' : 'Booking dulu'}</dd></>}
          {q.date && <><dt>{daftar ? 'Mulai tinggal' : 'Tanggal'}</dt><dd>{tglP(q.date)}</dd></>}
          {daftar && q.amt && <><dt>{q.plan === 'lunas' ? 'Bayar lunas 1 bulan' : 'Uang muka (DP)'}</dt><dd>{rp(q.amt)}</dd></>}
          {daftar && q.method && <><dt>Cara bayar</dt><dd>{{ transfer: 'Transfer bank', ewallet: 'QRIS / e-wallet', tunai: 'Tunai saat datang' }[q.method] || q.method}</dd></>}
          {q.meja && <><dt>Meja</dt><dd>{q.meja}</dd></>}
          {q.total && <><dt>{k === 'meja' ? 'Total' : 'Perkiraan total'}</dt><dd>{rp(q.total)}</dd></>}
        </dl>
      </section>}

      <section className="panel" style={{ gap: 8 }}>
        <span className="label">Langkah berikutnya</span>
        <ol className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 10 }}>{steps(k, q, p).map(([t, d], i) => (
          <li key={i} className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start', gap: 10 }}>
            <span aria-hidden style={{ flex: 'none', width: 26, height: 26, borderRadius: 999, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800,
              background: i === 0 ? 'var(--good-bg)' : 'var(--sunk)', color: i === 0 ? 'var(--good)' : 'var(--muted)' }}>{i === 0 ? '✓' : i + 1}</span>
            <span className="stack" style={{ gap: 2, minWidth: 0 }}><b className="small">{t}</b><span className="small muted">{d}</span></span>
          </li>
        ))}</ol>
      </section>

      <section className="panel" style={{ gap: 8 }}>
        <span className="label">Hubungi {p.name}</span>
        {p.wa_phone ? <a href={wa(p.wa_phone, waText)} target="_blank" rel="noreferrer"><button className="cta" style={{ width: '100%' }}>Chat WhatsApp pemilik</button></a>
          : <span className="small muted">Pemilik akan menghubungi Anda lewat WhatsApp yang Anda isi.</span>}
        {(k === 'pesanan' || (k === 'meja' && q.cek === '1')) && q.no && <a href={`/b/${slug}/cek?no=${encodeURIComponent(q.no)}`}><button style={{ width: '100%' }}>Cek status pesanan</button></a>}
        {p.hours && <span className="small">🕘 Jam buka: {p.hours}</span>}
        {p.address && <span className="small">🏠 {p.address}</span>}
        {links.length > 0 && <div className="row" style={{ flexWrap: 'wrap' }}>{links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer nofollow"><button className="sm">{ICON(l.url)} {l.label}</button></a>)}</div>}
      </section>

      {<PublicPay slug={slug} panel title="Cara bayar" note={payNote} />}

      {p.policy && <section className="panel"><span className="label">{daftar ? 'Ketentuan kos' : 'Ketentuan'}</span><p className="small" style={{ margin: 0, whiteSpace: 'pre-line' }}><Linkify text={p.policy} /></p></section>}

      <a href={`/b/${slug}`} className="small" style={{ textAlign: 'center' }}>← Kembali ke halaman {p.name}</a>
      <footer className="small muted" style={{ textAlign: 'center' }}>Halaman ini dikelola {p.name} dengan <a href="/">PRASARA</a></footer>
    </main>
  );
}
