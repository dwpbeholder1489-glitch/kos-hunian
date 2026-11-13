// Pengingat jatuh tempo (berjalan di server). Dipakai oleh cron harian dan tombol "kirim sekarang".
import { createClient } from '@supabase/supabase-js';
import { sendMail, mailConfigured } from '@/lib/mailer';
import { message, caraBayar } from '@/lib/templates';

export const adminDb = () => process.env.SUPABASE_SECRET_KEY
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const fmt = new Intl.NumberFormat('id-ID');
const rp = (n) => 'Rp' + fmt.format(Math.round(Number(n) || 0));
const BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const tgl = (k) => { const [y, m, d] = String(k).split('-'); return `${+d} ${BLN[+m - 1]} ${y}`; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const what = (r) => (r.kind === 'sewa' ? `Sewa ${tgl(r.period_start)} – ${tgl(r.period_end)}` : (r.description || 'Tagihan tambahan'));
const wa = (phone, text) => `https://wa.me/${String(phone || '').replace(/\D/g, '').replace(/^0/, '62')}?text=${encodeURIComponent(text)}`;
const paid = (r) => (r.can_remind ?? (r.plan && r.plan !== 'gratis'));  // fitur 'pengingat_email' dari paket
const KIND = { 3: 'h-3', 0: 'h0', '-3': 'h+3' };
const when = (d) => (d > 0 ? `${d} hari lagi` : d === 0 ? 'hari ini' : `lewat ${-d} hari`);

const shell = (title, sub, body) => `<div style="font-family:Arial,sans-serif;max-width:560px;color:#1A1D21">
  <div style="background:#0B2A21;color:#E9F5EF;padding:14px 18px;border-radius:12px 12px 0 0"><b style="font-size:18px">${esc(title)}</b><br><span style="opacity:.8;font-size:13px">${esc(sub)}</span></div>
  <div style="border:1px solid #DEDACB;border-top:0;border-radius:0 0 12px 12px;padding:18px">${body}
  <p style="margin:18px 0 0;font-size:12px;color:#5A675F">Dikirim otomatis oleh PRASARA.</p></div></div>`;
const btn = (href, label) => `<a href="${href}" style="display:inline-block;background:#0F7A4E;color:#FFFFFF;text-decoration:none;font-weight:bold;padding:11px 16px;border-radius:10px">${esc(label)}</a>`;

function tenantMail(r, origin) {
  const d = r.days_left;
  const head = d > 0 ? `Tagihan Anda jatuh tempo ${tgl(r.due_date)} (${d} hari lagi).` : d === 0 ? 'Tagihan Anda jatuh tempo hari ini.' : `Tagihan Anda sudah lewat jatuh tempo ${-d} hari.`;
  const portal = (r.can_portal ?? r.plan === 'pro') && r.portal_token ? `${origin}/p/${r.portal_token}` : null;
  const subject = d < 0 ? `Pengingat: tagihan ${r.kos_name} sudah lewat jatuh tempo` : `Pengingat tagihan ${r.kos_name} · jatuh tempo ${tgl(r.due_date)}`;
  const text = `Halo ${r.occupant_name},\n\n${head}\n\n${what(r)} · Kamar ${r.room_code}\nSisa tagihan: ${rp(r.outstanding)}\n${r.payment_info ? `\nCara bayar:\n${r.payment_info}\n` : ''}${portal ? `\nLihat tagihan & kirim bukti: ${portal}\n` : ''}${r.contact_phone ? `\nPertanyaan: WhatsApp ${r.contact_phone}\n` : ''}\nAbaikan email ini jika sudah membayar. Terima kasih.\n${r.kos_name}`;
  const html = shell(r.kos_name, 'Pengingat tagihan', `
    <p style="margin:0 0 12px">Halo ${esc(r.occupant_name)},<br>${esc(head)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:6px 0;color:#5A675F">Tagihan</td><td style="padding:6px 0;text-align:right;font-weight:bold">${esc(what(r))}</td></tr>
      <tr><td style="padding:6px 0;color:#5A675F">Kamar</td><td style="padding:6px 0;text-align:right;font-weight:bold">${esc(r.room_code)}</td></tr>
      <tr><td style="padding:6px 0;color:#5A675F">Jatuh tempo</td><td style="padding:6px 0;text-align:right;font-weight:bold">${tgl(r.due_date)}</td></tr>
      <tr><td style="padding:6px 0;color:#5A675F">Sisa tagihan</td><td style="padding:6px 0;text-align:right;font-weight:bold;font-size:18px">${rp(r.outstanding)}</td></tr>
    </table>
    ${r.payment_info ? `<div style="background:#F4EAD2;border-radius:8px;padding:10px 12px;margin-top:12px;font-size:14px;white-space:pre-wrap"><b>Cara bayar</b>\n${esc(r.payment_info)}</div>` : ''}
    ${portal ? `<p style="margin:16px 0 0">${btn(portal, 'Lihat tagihan & kirim bukti')}</p>` : ''}
    ${r.contact_phone ? `<p style="margin:14px 0 0;font-size:14px">Pertanyaan? <a href="${wa(r.contact_phone, 'Halo, saya ' + r.occupant_name + ' kamar ' + r.room_code + '.')}">WhatsApp pengelola</a></p>` : ''}
    <p style="margin:14px 0 0;font-size:13px;color:#5A675F">Abaikan email ini jika Anda sudah membayar.</p>`);
  return { subject, text, html };
}

function digestMail(kosName, items, origin) {
  const overdue = items.filter((r) => r.days_left < 0), soon = items.filter((r) => r.days_left >= 0);
  const total = items.reduce((s, r) => s + Number(r.outstanding), 0);
  const msg = (r) => {
    if (r.wa_reminder_tpl && r.wa_reminder_tpl.trim()) return message('reminder', r.wa_reminder_tpl, {
      nama: r.occupant_name, kos: kosName, kamar: r.room_code,
      rincian: `• ${what(r)}: ${rp(r.outstanding)} (jatuh tempo ${tgl(r.due_date)})`,
      total: rp(r.outstanding), cara_bayar: caraBayar(r.payment_info),
    });
    const portal = (r.can_portal ?? r.plan === 'pro') && r.portal_token ? `\nLihat & kirim bukti: ${origin}/p/${r.portal_token}` : '';
    return `Halo ${r.occupant_name}, ini pengingat dari ${kosName}. ${what(r)} kamar ${r.room_code} sebesar ${rp(r.outstanding)} ${r.days_left < 0 ? `sudah lewat jatuh tempo (${tgl(r.due_date)})` : `jatuh tempo ${tgl(r.due_date)}`}.${r.payment_info ? `\n\nCara bayar:\n${r.payment_info}` : ''}${portal}\n\nTerima kasih 🙏`;
  };
  const row = (r) => `<tr><td style="padding:10px 0;border-top:1px solid #DEDACB">
      <b>${esc(r.occupant_name)}</b> · ${esc(r.room_code)}<br><span style="font-size:13px;color:#5A675F">${esc(what(r))} · ${when(r.days_left)}</span></td>
    <td style="padding:10px 0;border-top:1px solid #DEDACB;text-align:right;white-space:nowrap"><b>${rp(r.outstanding)}</b><br>
      ${r.occupant_phone ? `<a href="${wa(r.occupant_phone, msg(r))}" style="font-size:13px;color:#1F7A4D;font-weight:bold">Kirim WA →</a>` : '<span style="font-size:12px;color:#8A5A00">No. WA kosong</span>'}</td></tr>`;
  const sec = (title, list) => (list.length ? `<h3 style="margin:16px 0 4px;font-size:15px">${title}</h3><table style="width:100%;border-collapse:collapse;font-size:14px">${list.map(row).join('')}</table>` : '');
  const subject = `Daftar tagih hari ini · ${kosName}: ${overdue.length} telat, ${soon.length} jatuh tempo`;
  const text = `Daftar tagih ${kosName}\nTotal belum dibayar: ${rp(total)}\n\n` + items.map((r) => `- ${r.occupant_name} (${r.room_code}) ${rp(r.outstanding)}, ${when(r.days_left)}`).join('\n') + `\n\nBuka ${origin}/tagihan`;
  const html = shell(kosName, 'Daftar tagih hari ini', `
    <p style="margin:0">Total belum dibayar: <b style="font-size:18px">${rp(total)}</b></p>
    ${sec(`🔴 Lewat jatuh tempo (${overdue.length})`, overdue)}
    ${sec(`🟡 Jatuh tempo 3 hari ke depan (${soon.length})`, soon)}
    <p style="margin:16px 0 0;font-size:13px;color:#5A675F">Ketuk "Kirim WA" untuk membuka WhatsApp dengan pesan pengingat yang sudah tersusun.</p>
    <p style="margin:14px 0 0">${btn(origin + '/tagihan', 'Buka menu Tagihan')}</p>`);
  return { subject, text, html };
}

// Jalankan pengiriman. onlyKos: batasi ke satu kos; force: abaikan catatan "sudah dikirim hari ini" untuk daftar tagih.
export async function runReminders({ origin, onlyKos = null, force = false, tenants = true }) {
  const sb = adminDb();
  if (!sb) return { ok: false, error: 'SUPABASE_SECRET_KEY belum diisi' };
  if (!mailConfigured()) return { ok: false, error: 'SMTP_USER / SMTP_PASS belum diisi' };
  const { data, error } = await sb.rpc('reminder_batch');
  if (error) return { ok: false, error: error.message };
  const rows = (data || []).filter((r) => paid(r) && (!onlyKos || r.kos_id === onlyKos));
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const out = { ok: true, tenantEmails: 0, digests: 0, errors: [] };

  if (tenants) {
    for (const r of rows) {
      const kind = KIND[r.days_left];
      if (!kind || !r.occupant_email) continue;
      const ins = await sb.from('reminder_log').insert({ invoice_id: r.invoice_id, kind }).select('invoice_id');
      if (ins.error) continue; // sudah pernah dikirim
      try { await sendMail({ to: r.occupant_email, replyTo: r.owner_email, fromName: `${r.kos_name} via PRASARA`, ...tenantMail(r, origin) }); out.tenantEmails++; }
      catch (e) { out.errors.push(`${r.occupant_name}: ${e.message}`); await sb.from('reminder_log').delete().match({ invoice_id: r.invoice_id, kind }); }
    }
  }

  const byKos = new Map();
  for (const r of rows) { if (!r.daily_digest && !force) continue; (byKos.get(r.kos_id) || byKos.set(r.kos_id, []).get(r.kos_id)).push(r); }
  for (const [kosId, items] of byKos) {
    if (!force) { const ins = await sb.from('digest_log').insert({ kos_id: kosId, day: today }).select('kos_id'); if (ins.error) continue; }
    items.sort((a, b) => a.days_left - b.days_left);
    try { await sendMail({ to: items[0].owner_email, ...digestMail(items[0].kos_name, items, origin) }); out.digests++; }
    catch (e) { out.errors.push(`daftar tagih ${items[0].kos_name}: ${e.message}`); if (!force) await sb.from('digest_log').delete().match({ kos_id: kosId, day: today }); }
  }
  if (onlyKos && byKos.size === 0) out.empty = true;
  return out;
}
