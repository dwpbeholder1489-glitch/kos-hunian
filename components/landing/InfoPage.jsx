import Link from 'next/link';
import LandingNav from '@/components/LandingNav';
import { BUSINESS } from '@/lib/plan';

// Kerangka halaman informasi publik (Tentang, Privasi, Syarat): gaya landing, tanpa data bisnis privat
export default function InfoPage({ kicker, title, updated, children }) {
  return (
    <div className="ln">
      <LandingNav theme />
      <main className="ln-sec">
        <article className="ln-wrap ln-doc">
          <span className="ln-kicker">{kicker}</span>
          <h1>{title}</h1>
          {updated && <p className="ln-small">Terakhir diperbarui: {updated}</p>}
          {children}
        </article>
      </main>
      <footer className="ln-foot">
        <div className="ln-wrap ln-doc-foot">
          <Link href="/">Beranda</Link><Link href="/tentang">Tentang Kami</Link><Link href="/privasi">Kebijakan Privasi</Link><Link href="/syarat">Syarat & Ketentuan</Link><Link href="/panduan">Panduan</Link>
          <a href={`https://wa.me/${BUSINESS.whatsapp}`} target="_blank" rel="noreferrer">WhatsApp {BUSINESS.whatsappDisplay}</a>
        </div>
        <div className="ln-wrap ln-copy">© {new Date().getFullYear()} PRASARA. Hak cipta dilindungi.</div>
      </footer>
    </div>
  );
}
