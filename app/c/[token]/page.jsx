import CustomerPortal from './CustomerPortal';
import { linkBannerMetadata } from '@/lib/linkBannerServer';

export async function generateMetadata({ params, searchParams }) {
  const { token } = await params;
  const context = (await searchParams)?.tampilan === 'faktur' ? 'faktur' : 'portal';
  return linkBannerMetadata('c', token, context, {
    fallbackTitle: 'Portal pelanggan', fallbackDescription: 'Buka portal pelanggan PRASARA.',
  });
}

export default async function Page({ searchParams }) {
  return <CustomerPortal initialTab={(await searchParams)?.tampilan === 'faktur' ? 'tagihan' : undefined} />;
}
