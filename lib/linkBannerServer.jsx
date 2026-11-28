import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { adminDb } from '@/lib/reminders';
import { mediaUrl } from '@/lib/media';
import { rp } from '@/lib/format';
import { SITE_URL } from '@/lib/plan';
import { BANNER_HEIGHT as height, BANNER_WIDTH as width, BANNER_UPLOAD_LIMIT, bannerContent } from '@/lib/linkBanner';

const FILE_LIMIT = 6_000_000;
let fonts;
function getFonts() {
  fonts ??= Promise.all([
    readFile(path.join(process.cwd(), 'node_modules/@fontsource/inter/files/inter-latin-400-normal.woff')),
    readFile(path.join(process.cwd(), 'node_modules/@fontsource/inter/files/inter-latin-700-normal.woff')),
  ]).then(([regular, bold]) => [
    { name: 'Inter', weight: 400, style: 'normal', data: regular },
    { name: 'Inter', weight: 700, style: 'normal', data: bold },
  ]);
  return fonts;
}

const FALLBACK = { url: '/og.jpg?v=3', width, height, alt: 'PRASARA' };
const hash = (value) => createHash('sha256').update(value);
const ticketKey = () => hash('prasara-link-banner:' + process.env.SUPABASE_SECRET_KEY).digest();

function portalTicket(source, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', ticketKey(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify([source, key])), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

export function readPortalTicket(ticket) {
  if (!process.env.SUPABASE_SECRET_KEY || !/^[A-Za-z0-9_-]{45,220}$/.test(ticket)) return [];
  try {
    const buf = Buffer.from(ticket, 'base64url');
    const cipher = createDecipheriv('aes-256-gcm', ticketKey(), buf.subarray(0, 12));
    cipher.setAuthTag(buf.subarray(12, 28));
    return JSON.parse(Buffer.concat([cipher.update(buf.subarray(28)), cipher.final()]).toString());
  } catch { return []; }
}

export async function getLinkBanner(source, key, context, item = null) {
  const sb = adminDb();
  if (!sb) return null;
  const isProduct = source === 'b' && context === 'produk' && item;
  const [{ data, error }, product] = await Promise.all([
    sb.rpc('link_banner_public', { p_source: source, p_key: key, p_context: context, p_item: item }),
    isProduct ? sb.rpc('cx_public_product', { p_slug: key, p_product: item }) : null,
  ]);
  if (error) return null;
  if (!isProduct || !data) return data;
  if (!product?.data) return product?.error ? data : null;
  const info = product.data;
  return { ...data, mode: 'auto', photos: data.photos.filter((photo) => photo.kind === 'item'), productPhoto: info.photo,
    itemTitle: info.name, itemDescription: info.price == null ? 'Tanyakan harga kepada toko' : `${rp(info.price)} / ${info.unit}` };
}

export async function linkBannerMetadata(source, key, context, { item, fallbackTitle = 'PRASARA', fallbackDescription, path } = {}) {
  const data = await getLinkBanner(source, key, context, item);
  const content = data && (data.enabled || data.productPhoto || (context === 'produk' && data.itemTitle)) ? bannerContent(data, context) : null;
  const title = content?.shareTitle || fallbackTitle;
  const description = content?.description || fallbackDescription;
  const image = { ...FALLBACK };
  if (content && !data.enabled && data.productPhoto) {
    return {
      title, description,
      openGraph: { title, description, siteName: 'PRASARA', locale: 'id_ID', type: 'website', url: path, images: [{ url: mediaUrl(data.productPhoto), alt: title }] },
      twitter: { title, description, card: 'summary_large_image', images: [mediaUrl(data.productPhoto)] },
    };
  }
  if (content && data.enabled) {
    const query = new URLSearchParams({ context });
    if (source === 'b') {
      query.set('slug', key.toLowerCase());
      if (item) query.set('item', item);
      query.set('v', hash(JSON.stringify(data)).digest('hex').slice(0, 24));
    } else {
      // URL gambar tidak mengungkap token yang bisa membuka portal pelanggan.
      query.set('portal', portalTicket(source, key));
    }
    image.url = `${SITE_URL}/api/link-banner/image?${query}`;
    image.alt = title;
  }
  return {
    title, description,
    ...(source !== 'b' && { robots: { index: false, follow: false }, referrer: 'no-referrer' }),
    openGraph: { title, description, siteName: 'PRASARA', locale: 'id_ID', type: 'website', ...(path && { url: path }), images: [image] },
    twitter: { title, description, card: 'summary_large_image', images: [image.url] },
  };
}

const asDataUrl = (bytes) => `data:image/png;base64,${bytes.toString('base64')}`;

async function storageImage(data, bucket, path, w, h) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || typeof path !== 'string' ||
      !path.startsWith(data.business + '/') || !/^[a-z0-9/_\-.]+$/i.test(path) || path.includes('..')) return null;
  try {
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
    const response = await fetch(url, { redirect: 'error', cache: 'force-cache', signal: AbortSignal.timeout(3500) });
    if (!response.ok || Number(response.headers.get('content-length')) > FILE_LIMIT) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > FILE_LIMIT) return null;
    return asDataUrl(await sharp(bytes, { limitInputPixels: 16_000_000 }).rotate()
      .resize(w, h, { fit: bucket === 'logo' ? 'contain' : 'cover', background: '#ffffff' }).png().toBuffer());
  } catch { return null; }
}

export async function readCustomBanner(file) {
  if (!file || typeof file.arrayBuffer !== 'function' || file.size === 0) return null;
  if (file.size > BANNER_UPLOAD_LIMIT) throw new Error('File banner maksimal 3 MB.');
  let image, info;
  try {
    image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 16_000_000 });
    info = await image.metadata();
  } catch { throw new Error('Gunakan gambar PNG, JPG, atau WebP yang valid.'); }
  if (!['png', 'jpeg', 'webp'].includes(info.format) || (info.pages ?? 1) !== 1) {
    throw new Error('Gunakan gambar PNG, JPG, atau WebP tanpa animasi.');
  }
  try {
    const buf = await image.rotate()
      .resize(width, height, { fit: 'contain', background: '#ffffff' })
      .flatten({ background: '#ffffff' }).png().toBuffer();
    return buf.toString('base64');
  } catch { throw new Error('Gambar gagal dibaca. Coba unggah ulang.'); }
}

const credit = <div style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 19 }}>
  <span>Powered by</span><strong style={{ fontWeight: 700 }}>PRASARA</strong>
</div>;

const photoCorners = { retail: 32, kuliner: 68, properti: '110px 110px 24px 24px', jasa: '22px 58px 22px 58px', lainnya: 46 };
const shapes = {
  retail: { borderRadius: 72, transform: 'rotate(-12deg)' },
  kuliner: { borderRadius: 220, transform: 'rotate(12deg)' },
  properti: { borderRadius: '210px 210px 28px 28px' },
  jasa: { borderRadius: 72, transform: 'rotate(14deg)' },
  lainnya: { borderRadius: 105, transform: 'rotate(-16deg)' },
};

export async function renderLinkBanner(data, context, headers) {
  const content = bannerContent(data, context);
  const options = { width, height, headers, fonts: await getFonts() };
  if (data.mode === 'custom' && data.custom) {
    try {
      const buf = await sharp(Buffer.from(data.custom, 'base64'), { limitInputPixels: width * height }).png().toBuffer();
      return new ImageResponse(
        <div style={{ display: 'flex', width, height, background: '#fff' }}>
          <img src={asDataUrl(buf)} width={width} height={height} alt="" />
          <div style={{ display: 'flex', position: 'absolute', bottom: 19, right: 24, color: '#fff', background: '#14251F', borderRadius: 12, padding: '9px 14px' }}>{credit}</div>
        </div>, options);
    } catch { /* Lanjut ke template jika aset lama rusak. */ }
  }
  const photos = data.mode === 'photo' ? [...data.photos].sort((a, b) => Number(a.kind === 'item') - Number(b.kind === 'item')) : data.photos;
  const widePhoto = data.mode === 'photo';
  const photoWidth = widePhoto ? 610 : 505;
  const photoHeight = widePhoto ? height : 500;
  const pickPhoto = async () => {
    for (const { path } of photos) {
      const image = await storageImage(data, 'media', path, photoWidth, photoHeight);
      if (image) return image;
    }
    return null;
  };
  const [logo, photo] = await Promise.all([storageImage(data, 'logo', data.logo, 72, 72), pickPhoto()]);
  const initials = content.business.split(/\s+/).slice(0, 2).map((word) => Array.from(word)[0]).join('').toUpperCase();
  const color = content.color;
  const background = '#' + color.slice(1).match(/../g).map((channel) =>
    Math.round(parseInt(channel, 16) * 0.43).toString(16).padStart(2, '0')).join('');
  const contextual = context !== 'beranda' && content.title !== content.label;
  return new ImageResponse(
    <div style={{ display: 'flex', position: 'relative', width, height, overflow: 'hidden', color: '#fff', background }}>
      <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width, height, backgroundImage: `linear-gradient(105deg, ${background} 16%, ${color} 100%)` }} />
      {photo ? <div style={{ display: 'flex', position: 'absolute', right: widePhoto ? 0 : 49, top: widePhoto ? 0 : 65,
        width: photoWidth, height: photoHeight, overflow: 'hidden', borderRadius: widePhoto ? 0 : photoCorners[content.category] }}>
        <img src={photo} width={photoWidth} height={photoHeight} alt="" />
        {widePhoto && <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: photoWidth, height: photoHeight, backgroundImage: `linear-gradient(90deg, ${background}, transparent 43%)` }} />}
      </div> : <div style={{ display: 'flex', position: 'absolute', right: 68, top: 100, width: 417, height: 417,
        border: '2px solid rgba(255,255,255,0.29)', background: 'rgba(255,255,255,0.13)', ...shapes[content.category],
        alignItems: 'center', justifyContent: 'center', fontSize: 155, fontWeight: 700, color: 'rgba(255,255,255,0.77)' }}>{initials}</div>}
      <div style={{ display: 'flex', position: 'absolute', left: 66, top: 60, bottom: 52, width: 525, flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 16, overflow: 'hidden', width: 72, height: 72,
            background: logo ? '#fff' : 'rgba(255,255,255,0.20)', fontSize: 29, fontWeight: 700, flexShrink: 0 }}>
            {logo ? <img src={logo} width={72} height={72} alt="" /> : initials}
          </div>
          <div style={{ display: 'block', lineClamp: 2, fontSize: 27, fontWeight: 700, wordBreak: 'break-word' }}>{content.business}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {contextual && <div style={{ fontSize: 24, fontWeight: 700 }}>{content.label}</div>}
          <div style={{ display: 'block', lineClamp: 3, fontSize: content.title.length > 34 ? 49 : 66, fontWeight: 700, lineHeight: 1.06, wordBreak: 'break-word' }}>{content.title}</div>
          <div style={{ display: 'block', lineClamp: 3, fontSize: 28, lineHeight: 1.18, color: '#fff', wordBreak: 'break-word' }}>{content.description}</div>
        </div>
        {credit}
      </div>
    </div>, options);
}
