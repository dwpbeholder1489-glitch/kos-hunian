// Data halaman bisnis publik (server): public_page_view + foto. Dipakai /b/[slug] dan /b/[slug]/terkirim.
export async function getPublicPage(slug) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const r = await fetch(`${url}/rest/v1/rpc/public_page_view`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_slug: slug }), next: { revalidate: 60 } });
    if (!r.ok) return null;
    const page = await r.json();
    if (!page) return null;
    // foto (cover, galeri, foto item) — halaman tetap tampil walau bagian ini gagal
    try {
      const m = await fetch(`${url}/rest/v1/rpc/public_media`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_slug: slug }), next: { revalidate: 60 } });
      if (m.ok) page.media = await m.json();
    } catch {}
    return page;
  } catch { return null; }
}

export async function getPublicShop(slug) {
  if (!process.env.SUPABASE_SECRET_KEY) return null;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const response = await fetch(`${url}/rest/v1/rpc/portal_shop_catalog`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_slug: slug }),
      next: { revalidate: 60 },
    });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

export async function getPublicQuoteCatalog(slug) {
  if (!process.env.SUPABASE_SECRET_KEY) return null;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const response = await fetch(`${url}/rest/v1/rpc/portal_quote_catalog`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_slug: slug }),
      next: { revalidate: 60 },
    });
    return response.ok ? await response.json() : null;
  } catch { return null; }
}

// Kampanye/promo aktif yang dipublikasikan pemilik (public_campaigns, anon). Halaman tetap tampil walau gagal.
export async function getPublicCampaigns(slug) {
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/public_campaigns`, { method: 'POST', headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_slug: slug }), next: { revalidate: 60 } });
    return r.ok ? (await r.json()) || [] : [];
  } catch { return []; }
}
