// Halaman bisnis publik (blueprint 24, Phase 1): profil yang diterbitkan pemilik, katalog/kamar tersedia, formulir permintaan.
// Hanya data yang boleh dipublikasikan yang diambil (lewat fungsi public_page_view); tanpa harga modal, margin, atau stok persis.
import { notFound } from 'next/navigation';
import PublicForm from '@/components/PublicForm';

export const revalidate = 60;

async function getPage(slug) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const r = await fetch(`${url}/rest/v1/rpc/public_page_view`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_slug: slug }), next: { revalidate: 60 } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const p = await getPage(slug);
  if (!p) return { title: 'Halaman tidak ditemukan', robots: { index: false } };
  const desc = p.tagline || (p.type === 'retail' ? `Katalog & pemesanan ${p.name}` : `Info kamar & sewa ${p.name}`);
  return { title: p.name, description: desc, openGraph: { title: p.name, description: desc, type: 'website' } };
}

const rp = (n) => 'Rp' + new Intl.NumberFormat('id-ID').format(Math.round(Number(n) || 0));
const wa = (phone, text) => `https://wa.me/${String(phone || '').replace(/\D/g, '').replace(/^0/, '62')}?text=${encodeURIComponent(text)}`;

export default async function PublicPage({ params }) {
  const { slug } = await params;
  const p = await getPage(slug);
  if (!p) notFound();
  const retail = p.type === 'retail';
  return (
    <main className="wrap stack" style={{ maxWidth: 640, paddingTop: 20, paddingBottom: 40 }}>
      <header className="stack" style={{ gap: 6 }}>
        <h1 style={{ margin: 0, fontSize: 26 }}>{p.name}</h1>
        {p.tagline && <p style={{ margin: 0, fontSize: 16 }}>{p.tagline}</p>}
        <span className="small muted">{[p.address, p.hours].filter(Boolean).join(' · ')}</span>
        {p.wa_phone && <a href={wa(p.wa_phone, `Halo ${p.name}, saya lihat halaman Anda.`)} target="_blank" rel="noreferrer" style={{ alignSelf: 'flex-start' }}><button className="primary">Chat WhatsApp</button></a>}
      </header>
      {p.about && <section className="panel"><h3>Tentang kami</h3><p style={{ margin: 0, whiteSpace: 'pre-line' }}>{p.about}</p></section>}
      {p.items?.length > 0 && (
        <section className="panel">
          <h3>{retail ? 'Barang' : 'Kamar tersedia'}</h3>
          <div className="list">{p.items.map((it) => (
            <div className="li" key={it.id} style={{ alignItems: 'flex-start' }}>
              <div className="main"><b className="small">{it.name}</b>
                {!retail && it.facilities?.length > 0 && <span className="small muted">{it.facilities.join(', ')}</span>}
                {p.show_prices && <span className="small">{it.units.filter((u) => u.price != null).map((u) => `${rp(u.price)}/${u.name}`).join(' · ')}</span>}</div>
              {retail && <span className={'chip ' + (it.available ? 'good' : 'void')}>{it.available ? 'Tersedia' : 'Habis'}</span>}
            </div>
          ))}</div>
          {p.show_prices && <span className="small muted">Harga dapat berubah; harga final dikonfirmasi oleh {p.name}.</span>}
        </section>
      )}
      <PublicForm page={p} />
      {p.policy && <section className="panel"><h3>Ketentuan</h3><p className="small" style={{ margin: 0, whiteSpace: 'pre-line' }}>{p.policy}</p></section>}
      <footer className="small muted" style={{ textAlign: 'center' }}>Halaman ini dikelola {p.name} dengan <a href="/">PRASARA</a></footer>
    </main>
  );
}
