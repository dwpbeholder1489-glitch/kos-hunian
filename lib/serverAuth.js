// Klien Supabase atas nama pengguna yang memanggil API (token dari header Authorization) — izin tetap dari database
import { createClient } from '@supabase/supabase-js';

export function userDb(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  if (!token) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Kerangka email PRASARA (navy) dengan tombol
export function mailHtml({ title, sub, paragraphs, button, href, footer }) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;color:#142B45">
  <div style="background:#142B45;color:#fff;padding:14px 18px;border-radius:12px 12px 0 0"><b style="font-size:17px">${esc(title)}</b>${sub ? `<br><span style="opacity:.8;font-size:13px">${esc(sub)}</span>` : ''}</div>
  <div style="border:1px solid #DDE3EA;border-top:0;border-radius:0 0 12px 12px;padding:18px;font-size:15px;line-height:1.5">
    ${paragraphs.map((p) => `<p style="margin:0 0 12px;white-space:pre-wrap">${esc(p)}</p>`).join('')}
    ${button ? `<p style="margin:4px 0 0"><a href="${href}" style="display:inline-block;background:#16866A;color:#fff;text-decoration:none;font-weight:bold;padding:11px 18px;border-radius:10px">${esc(button)}</a></p>` : ''}
    ${footer ? `<p style="margin:18px 0 0;font-size:12px;color:#5B6B7C">${footer}</p>` : ''}
  </div></div>`;
}
