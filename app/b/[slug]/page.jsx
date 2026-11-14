// Halaman bisnis publik (blueprint 24, Phase 1): profil yang diterbitkan pemilik, katalog/kamar tersedia, formulir permintaan.
// Hanya data yang boleh dipublikasikan yang diambil (lewat fungsi public_page_view); tanpa harga modal, margin, atau stok persis.
import { notFound } from 'next/navigation';
import PublicForm from '@/components/PublicForm';
import PublicPay from '@/components/PublicPay';
import Linkify from '@/components/Linkify';
import { logoUrl } from '@/lib/logo';
import { PublicCover, PublicGallery, ItemThumb } from '@/components/media/PublicPics';
import { getPublicPage as getPage } from '@/lib/publicPage';

export const revalidate = 60;


export async function generateMetadata({ params }) {
  const { slug } = await params;
  const p = await getPage(slug);
  if (!p) return { title: 'Halaman tidak ditemukan', robots: { index: false } };
  const desc = p.tagline || (p.type === 'retail' ? `Katalog & pemesanan ${p.name}` : p.type === 'jasa' ? `Layanan & harga ${p.name}` : `Info kamar & sewa ${p.name}`);
  const img = p.media?.cover?.path || p.media?.gallery?.[0]?.path;
  const og = img && process.env.NEXT_PUBLIC_SUPABASE_URL ? [`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${img}`] : undefined;
  return { title: p.name, description: desc, openGraph: { title: p.name, description: desc, type: 'website', ...(og ? { images: og } : {}) } };
}

const rp = (n) => 'Rp' + new Intl.NumberFormat('id-ID').format(Math.round(Number(n) || 0));
const ICON = (l) => (/maps|goo\.gl\/maps|maps\.app/i.test(l.url) ? '📍' : /instagram|tiktok|facebook|fb\.com/i.test(l.url) ? '📱' : /drive\.google|photos/i.test(l.url) ? '🖼️' : /youtu/i.test(l.url) ? '▶️' : '🔗');
const wa = (phone, text) => `https://wa.me/${String(phone || '').replace(/\D/g, '').replace(/^0/, '62')}?text=${encodeURIComponent(text)}`;

export default async function PublicPage({ params }) {
  const { slug } = await params;
  const p = await getPage(slug);
  if (!p) notFound();
  const retail = p.type === 'retail';
  return (
    <main className="wrap stack" style={{ maxWidth: 640, paddingTop: 20, paddingBottom: 40 }}>
      <PublicCover cover={p.media?.cover} name={p.name} />
      <header className="stack" style={{ gap: 6 }}>
        <div className="row" style={{ flexWrap: 'nowrap', gap: 12 }}>
          {logoUrl(p.logo) && <img src={logoUrl(p.logo)} alt={`Logo ${p.name}`} width={56} height={56} style={{ borderRadius: 12, objectFit: 'cover', flex: 'none', border: '1px solid var(--line)' }} />}
          <h1 style={{ margin: 0, fontSize: 26 }}>{p.name}</h1>
        </div>
        {p.tagline && <p style={{ margin: 0, fontSize: 16 }}>{p.tagline}</p>}
        <span className="small muted">{[p.address, p.hours].filter(Boolean).join(' · ')}</span>
        {p.wa_phone && <a href={wa(p.wa_phone, `Halo ${p.name}, saya lihat halaman Anda.`)} target="_blank" rel="noreferrer" style={{ alignSelf: 'flex-start' }}><button className="primary">Chat WhatsApp</button></a>}
        {p.links?.length > 0 && <div className="row" style={{ flexWrap: 'wrap' }}>{p.links.filter((l) => /^https?:\/\//i.test(l.url)).map((l) => (
          <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer nofollow"><button className="sm">{ICON(l)} {l.label}</button></a>
        ))}</div>}
      </header>
      {p.about && <section className="panel"><h3>Tentang kami</h3><p style={{ margin: 0, whiteSpace: 'pre-line' }}><Linkify text={p.about} /></p></section>}
      <PublicGallery items={p.media?.gallery} title={p.type === 'properti' ? 'Foto kos & fasilitas' : 'Galeri'} />
      {p.items?.length > 0 && (
        <section className="panel">
          <h3>{retail ? 'Barang' : p.type === 'jasa' ? 'Layanan' : 'Kamar tersedia'}</h3>
          <div className="list">{p.items.map((it) => (
            <div className="li" key={it.id} style={{ alignItems: 'flex-start', justifyContent: 'flex-start', gap: 10 }}>
              <ItemThumb pics={p.media?.items?.[it.id]} name={it.name} />
              <div className="main" style={{ flex: 1 }}><b className="small">{it.name}</b>
                {!retail && it.facilities?.length > 0 && <span className="small muted">{it.facilities.join(', ')}</span>}
                {it.note && <span className="small muted">{it.note}</span>}
                {p.show_prices && <span className="small">{it.units.filter((u) => u.price != null).map((u) => `${rp(u.price)}/${u.name}`).join(' · ')}</span>}</div>
              {retail && <span className={'chip ' + (it.available ? 'good' : 'void')}>{it.available ? 'Tersedia' : 'Habis'}</span>}
            </div>
          ))}</div>
          {p.show_prices && <span className="small muted">Harga dapat berubah; harga final dikonfirmasi oleh {p.name}.</span>}
        </section>
      )}
      <PublicForm page={p} />
      {p.type === 'jasa' && p.order && <a href={`/b/${p.slug}/cek`} className="small" style={{ textAlign: 'center' }}>Sudah memesan? Cek status pesanan →</a>}
      {p.type !== 'properti' && <PublicPay slug={p.slug} panel />}
      {p.policy && <section className="panel"><h3>Ketentuan</h3><p className="small" style={{ margin: 0, whiteSpace: 'pre-line' }}><Linkify text={p.policy} /></p></section>}
      <footer className="small muted" style={{ textAlign: 'center' }}>Halaman ini dikelola {p.name} dengan <a href="/">PRASARA</a></footer>
    </main>
  );
}
