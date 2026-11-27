import Portal from './Portal';
import { linkBannerMetadata } from '@/lib/linkBannerServer';

export async function generateMetadata({ params, searchParams }) {
  const { token } = await params;
  const context = (await searchParams)?.tampilan === 'faktur' ? 'faktur' : 'portal';
  return linkBannerMetadata('p', token, context, {
    fallbackTitle: 'Portal penghuni', fallbackDescription: 'Buka portal penghuni PRASARA.',
  });
}

export default function Page() {
  return <Portal />;
}
