import { linkBannerMetadata } from '@/lib/linkBannerServer';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const context = 'lacak';
  return linkBannerMetadata('b', slug, context, {
    fallbackTitle: 'Cek status pesanan', fallbackDescription: 'Periksa status pesanan melalui PRASARA.', path: `/b/${encodeURIComponent(slug)}/cek`,
  });
}

export default function Layout({ children }) {
  return children;
}
