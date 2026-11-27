import { isBannerContext, isBannerId } from '@/lib/linkBanner';
import { getLinkBanner, readPortalTicket, renderLinkBanner } from '@/lib/linkBannerServer';

export async function GET(req) {
  const query = new URL(req.url).searchParams;
  const context = query.get('context');
  const item = query.get('item');
  const portal = query.get('portal');
  const [source, key] = portal ? readPortalTicket(portal) : ['b', query.get('slug')];
  const headers = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer' };
  if (!isBannerContext(context) || (source === 'b' ? !/^[a-z0-9-]{1,64}$/.test(key || '') : !['c', 'p'].includes(source)) ||
      (item && !isBannerId(item))) {
    return new Response(null, { status: 404, headers });
  }
  const data = await getLinkBanner(source, key, context, item);
  if (!data?.enabled) return new Response(null, { status: 404, headers });
  return renderLinkBanner(data, context, headers);
}
