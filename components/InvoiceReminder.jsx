'use client';
import { useState } from 'react';
import { Sheet } from '@/components/ui';
import { SheetStats } from '@/components/SmartDetailSheet';
import { rp, invTitle, tgl, waLink } from '@/lib/format';
import { message, caraBayar } from '@/lib/templates';
import css from '@/app/(app)/penghuni/penghuni.module.css';

const total = (rows) => rows.reduce((sum, row) => sum + row.outstanding, 0);
export const hasReminderPhone = (occ) => /^[1-9]\d{7,14}$/.test(String(occ?.phone || '').replace(/\D/g, '').replace(/^0/, '62'));

export default function InvoiceReminder({ kos, d, records, onClose }) {
  const [confirmedSet, setConfirmedSet] = useState(null);
  const [limit, setLimit] = useState(12);
  const [opened, setOpened] = useState([]);
  const drafts = records.map(({ occ, lease, open }) => {
    const text = message('reminder', kos.wa_reminder_tpl, {
      nama: occ.name, kos: kos.name, kamar: lease ? d.roomCode(lease.room_id) : '',
      rincian: open.map((i) => `• ${invTitle(i)} · Kamar ${d.roomCode(i.room_id)} · jatuh tempo ${tgl(i.due_date)}: ${rp(i.outstanding)}`).join('\n'),
      total: rp(total(open)), cara_bayar: caraBayar(kos.payment_info),
    });
    return { id: occ.id, occ, text, open };
  });
  const signature = JSON.stringify(drafts.map(({ id, occ, text }) => [id, occ.phone, text]));
  const confirmed = confirmedSet === signature;
  return <Sheet title="Pengingat tagihan" icon="message" subtitle="Konfirmasi oleh pemilik" onClose={onClose}>
    <p>Periksa penerima dan isi pesan. Setelah konfirmasi, buka draf masing-masing penerima dan tekan Kirim di WhatsApp.</p>
    <SheetStats items={[[ 'Penerima', drafts.length ], ['Total belum dibayar', rp(drafts.reduce((sum, row) => sum + total(row.open), 0))]]} />
    {!drafts.length && <p>Tidak ada penerima yang memiliki nomor WhatsApp dan tagihan terbuka.</p>}
    <ul className={css.entries}>{drafts.slice(0, limit).map(({ id, occ, text }) => <li key={id}><div className={css.entry}>
      <b>{occ.name}</b><small>{occ.phone}</small>
      <details><summary>Pratinjau pesan</summary><p className={css.preview}>{text}</p></details>
      {confirmed && <a href={waLink(occ.phone, text)} target="_blank" rel="noreferrer" onClick={() => setOpened((prev) => prev.includes(id) ? prev : [...prev, id])}>
        {opened.includes(id) ? 'Buka lagi di WhatsApp' : 'Buka draf WhatsApp'}</a>}
    </div></li>)}</ul>
    {drafts.length > limit && <button onClick={() => setLimit(limit + 12)}>Tampilkan lebih banyak</button>}
    {!confirmed && <button className="primary" disabled={!drafts.length} onClick={() => { setConfirmedSet(signature); setOpened([]); }}>Konfirmasi {drafts.length} penerima</button>}
    {confirmed && <small>{opened.filter((id) => drafts.some((row) => row.id === id)).length} dari {drafts.length} draf dibuka.</small>}
  </Sheet>;
}

