// Ringkasan mingguan (setiap Senin) dan bulanan (setiap tanggal 1) ke email pemilik kos.
// Angka dihitung dari data yang tercatat, sama dengan menu Laporan.
import { sendMail, mailConfigured } from '@/lib/mailer';
import { adminDb } from '@/lib/reminders';

const fmt = new Intl.NumberFormat('id-ID');
const rp = (n) => 'Rp' + fmt.format(Math.round(Number(n) || 0));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const iso = (d) => d.toISOString().slice(0, 10);
const tgl = (k) => { const [y, m, d] = k.split('-'); return `${+d} ${BLN[+m - 1]}${y ? ' ' + y : ''}`; };
const shortTgl = (k) => { const [, m, d] = k.split('-'); return `${+d} ${BLN[+m - 1]}`; };

// Tanggal hari ini di Jakarta sebagai Date UTC tengah malam
const todayWib = () => { const d = new Date(Date.now() + 7 * 3600e3); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); };
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);

export function periodOf(kind, now = todayWib()) {
  if (kind === 'mingguan') {
    const to = addDays(now, -1), from = addDays(now, -7);
    return { from: iso(from), to: iso(to), prevFrom: iso(addDays(now, -14)), prevTo: iso(addDays(now, -8)), key: iso(from), label: `${shortTgl(iso(from))} – ${tgl(iso(to))}` };
  }
  const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const pFirst = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  const pLast = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 0));
  return { from: iso(first), to: iso(last), prevFrom: iso(pFirst), prevTo: iso(pLast), key: iso(first).slice(0, 7), label: `${BLN[first.getUTCMonth()]} ${first.getUTCFullYear()}`, prevLabel: BLN[pFirst.getUTCMonth()] };
}

function change(now, prev) {
  if (!prev) return '';
  const pct = Math.round(((now - prev) / prev) * 100);
  return pct === 0 ? ' (sama)' : pct > 0 ? ` (naik ${pct}%)` : ` (turun ${-pct}%)`;
}

function render(kind, r, p, origin) {
  const income = Number(r.income), ops = Number(r.ops), laba = income - ops, other = Number(r.other_exp);
  const weekly = kind === 'mingguan';
  const title = weekly ? `Ringkasan minggu ${p.label}` : `Ringkasan keuangan ${p.label}`;
  const allClear = r.pending === 0 && r.overdue_count === 0;
  const lead = allClear
    ? 'Tidak ada pembayaran yang menunggu diperiksa dan tidak ada tagihan yang lewat jatuh tempo. Administrasi kos Anda sudah diperbarui.'
    : [r.pending ? `${r.pending} pembayaran menunggu diperiksa` : null, r.overdue_count ? `${r.overdue_count} tagihan lewat jatuh tempo` : null].filter(Boolean).join(' dan ') + '. Silakan periksa dan perbarui statusnya jika uang sudah diterima.';
  const rows = [
    ['Pemasukan tercatat', rp(income), `${r.pay_count} pembayaran`],
    ['Biaya operasional', rp(ops), ''],
    [weekly ? 'Selisih' : 'Laba operasional', rp(laba), ''],
    ...(other > 0 ? [['Belanja modal & lainnya', rp(other), 'tidak mengurangi laba']] : []),
    ['Kamar terisi', `${r.occupied} dari ${r.rooms}`, ''],
    ['Belum dibayar (sampai hari ini)', rp(r.outstanding), r.overdue_count ? `${r.overdue_count} lewat jatuh tempo` : ''],
  ];
  const compare = !weekly && r.has_prev
    ? `Dibanding ${p.prevLabel}: pemasukan ${rp(r.prev_income)} → ${rp(income)}${change(income, Number(r.prev_income))}; biaya operasional ${rp(r.prev_ops)} → ${rp(ops)}${change(ops, Number(r.prev_ops))}.`
    : null;
  const unpaid = (r.unpaid || []);
  const link = weekly ? `${origin}/tagihan` : `${origin}/laporan`;
  const subject = `${title} · ${r.kos_name}`;
  const text = `${title}\n${r.kos_name}\n\n${lead}\n\n${rows.map(([a, b, c]) => `${a}: ${b}${c ? ` (${c})` : ''}`).join('\n')}\n${compare ? `\n${compare}\n` : ''}${unpaid.length ? `\nBelum dibayar:\n${unpaid.map((u) => `- ${u.name} (${u.room}) ${rp(u.amount)}`).join('\n')}\n` : ''}\nBuka: ${link}\n\nAngka dihitung dari data yang Anda catat di Kos Hunian.\nAtur atau hentikan ringkasan: ${origin}/notifikasi`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#142B45">
  <div style="background:#142B45;color:#fff;padding:14px 18px;border-radius:12px 12px 0 0"><b style="font-size:17px">${esc(title)}</b><br><span style="opacity:.8;font-size:13px">${esc(r.kos_name)}</span></div>
  <div style="border:1px solid #DDE3EA;border-top:0;border-radius:0 0 12px 12px;padding:18px;font-size:15px;line-height:1.5">
    <p style="margin:0 0 14px;background:${allClear ? '#EAF5F1' : '#FFF4DA'};border-radius:8px;padding:10px 12px;font-size:14px">${esc(lead)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">${rows.map(([a, b, c]) => `<tr><td style="padding:8px 0;border-top:1px solid #DDE3EA;color:#5B6B7C">${esc(a)}${c ? `<br><span style="font-size:12px">${esc(c)}</span>` : ''}</td><td style="padding:8px 0;border-top:1px solid #DDE3EA;text-align:right;font-weight:bold;white-space:nowrap">${esc(b)}</td></tr>`).join('')}</table>
    ${compare ? `<p style="margin:12px 0 0;font-size:14px">${esc(compare)}</p>` : ''}
    ${unpaid.length ? `<h3 style="margin:16px 0 4px;font-size:15px">Belum dibayar</h3><table style="width:100%;border-collapse:collapse;font-size:14px">${unpaid.map((u) => `<tr><td style="padding:6px 0;border-top:1px solid #DDE3EA">${esc(u.name)} · ${esc(u.room)}<br><span style="font-size:12px;color:#5B6B7C">sejak ${tgl(u.since)}</span></td><td style="padding:6px 0;border-top:1px solid #DDE3EA;text-align:right;font-weight:bold">${rp(u.amount)}</td></tr>`).join('')}</table>` : ''}
    <p style="margin:16px 0 0"><a href="${link}" style="display:inline-block;background:#16866A;color:#fff;text-decoration:none;font-weight:bold;padding:11px 18px;border-radius:10px">${weekly ? 'Buka Tagihan' : 'Buka Laporan'}</a></p>
    <p style="margin:18px 0 0;font-size:12px;color:#5B6B7C">Angka dihitung dari data yang Anda catat di Kos Hunian. <a href="${origin}/notifikasi" style="color:#5B6B7C">Atur atau hentikan ringkasan</a></p>
  </div></div>`;
  return { subject, text, html };
}

// kinds: jenis yang dijalankan hari ini. onlyKos + force: kirim contoh untuk satu kos tanpa mencatat periode.
export { render as renderSummary };
export async function runSummaries({ origin, kinds, onlyKos = null, force = false }) {
  const sb = adminDb();
  if (!sb) return { ok: false, error: 'SUPABASE_SECRET_KEY belum diisi' };
  if (!mailConfigured()) return { ok: false, error: 'SMTP_USER / SMTP_PASS belum diisi' };
  const now = todayWib();
  const todo = kinds || [...(now.getUTCDay() === 1 ? ['mingguan'] : []), ...(now.getUTCDate() === 1 ? ['bulanan'] : [])];
  const out = { ok: true, sent: 0, kinds: todo, errors: [] };
  for (const kind of todo) {
    const p = periodOf(kind, now);
    const { data, error } = await sb.rpc('summary_batch', { p_kind: kind, p_from: p.from, p_to: p.to, p_prev_from: p.prevFrom, p_prev_to: p.prevTo });
    if (error) { out.ok = false; out.errors.push(error.message); continue; }
    for (const r of data || []) {
      if (onlyKos && r.kos_id !== onlyKos) continue;
      if (!r.owner_email || (!force && Number(r.rooms) === 0 && Number(r.occupied) === 0)) continue; // kos kosong: tidak ada yang diringkas
      if (!force) { const ins = await sb.from('summary_log').insert({ kos_id: r.kos_id, kind, period: p.key }).select('kos_id'); if (ins.error) continue; }
      try { await sendMail({ to: r.owner_email, ...render(kind, r, p, origin) }); out.sent++; }
      catch (e) { out.errors.push(`${r.kos_name}: ${e.message}`); if (!force) await sb.from('summary_log').delete().match({ kos_id: r.kos_id, kind, period: p.key }); }
    }
  }
  if (onlyKos && out.sent === 0 && !out.errors.length) out.empty = true;
  return out;
}
