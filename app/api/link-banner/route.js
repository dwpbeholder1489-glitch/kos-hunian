import { userDb } from '@/lib/serverAuth';
import { bannerContent, isBannerContext, isBannerId, sanitizeBanner } from '@/lib/linkBanner';
import { readCustomBanner, renderLinkBanner } from '@/lib/linkBannerServer';

const privateHeaders = { 'Cache-Control': 'private, no-store' };
const json = (data, status = 200) => Response.json(data, { status, headers: privateHeaders });

export async function GET(req) {
  const user = userDb(req);
  if (!user) return json({ error: 'Silakan masuk lagi.' }, 401);
  const kos = new URL(req.url).searchParams.get('kos');
  if (!isBannerId(kos)) return json({ error: 'Bisnis tidak valid.' }, 400);
  const { data, error } = await user.rpc('link_banner_config', { p_kos: kos });
  if (error) return json({ error: 'Pengaturan banner gagal dimuat.' }, 502);
  if (!data) return json({ error: 'Akses pengaturan bisnis ditolak.' }, 403);
  return json(data);
}

export async function POST(req) {
  const user = userDb(req);
  if (!user) return json({ error: 'Silakan masuk lagi.' }, 401);
  if (Number(req.headers.get('content-length')) > 3_100_000) return json({ error: 'File banner maksimal 3 MB.' }, 413);
  let form, settings;
  try {
    form = await req.formData();
    settings = sanitizeBanner(JSON.parse(form.get('settings')));
  } catch { return json({ error: 'Pengaturan banner tidak valid.' }, 400); }
  const kos = form.get('kos');
  const action = form.get('action');
  const context = form.get('context');
  if (!isBannerId(kos) || !['preview', 'save'].includes(action) || !isBannerContext(context)) {
    return json({ error: 'Permintaan banner tidak valid.' }, 400);
  }
  const { data, error } = await user.rpc('link_banner_preview', { p_kos: kos, p_context: context });
  if (error) return json({ error: 'Data banner gagal dimuat.' }, 502);
  if (!data) return json({ error: 'Akses pengaturan bisnis ditolak.' }, 403);
  let upload = null;
  try {
    if (settings.mode === 'custom') upload = await readCustomBanner(form.get('file'));
  } catch (err) { return json({ error: err.message }, 400); }
  if (settings.mode === 'custom' && !upload && !data.custom) {
    return json({ error: 'Unggah banner custom terlebih dahulu.' }, 400);
  }
  if (action === 'preview') {
    const draft = { ...data, ...settings, custom: upload || data.custom };
    return renderLinkBanner(draft, context, {
      ...privateHeaders, 'X-Banner-Preview': encodeURIComponent(JSON.stringify(bannerContent(draft, context))),
    });
  }
  const { error: saveError } = await user.rpc('link_banner_save', { p_kos: kos, p_settings: settings, p_png: upload });
  if (saveError) return json({ error: saveError.message }, 400);
  return json({ ok: true, hasCustom: Boolean(upload || data.custom) });
}
