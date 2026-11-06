'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Sheet } from '@/components/ui';
import { PAGE_HELP } from '@/lib/guide';

// Tombol kecil "? Panduan" di samping judul menu
export default function PageHelp({ page }) {
  const [open, setOpen] = useState(false);
  const h = PAGE_HELP[page];
  if (!h) return null;
  return (
    <>
      <button className="helpchip noprint" style={{ minHeight: 30, cursor: 'pointer' }} onClick={() => setOpen(true)}>? Panduan</button>
      {open && (
        <Sheet title={`Panduan · ${h.title}`} onClose={() => setOpen(false)}>
          <span className="label">Cara pakai</span>
          <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>{h.steps.map((s) => <li key={s}>{s}</li>)}</ol>
          {h.warn.length > 0 && (
            <div className="notice"><div className="label" style={{ color: 'inherit', marginBottom: 4 }}>Perhatian</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontWeight: 500 }}>{h.warn.map((w) => <li key={w}>{w}</li>)}</ul></div>
          )}
          {h.step && <Link href={`/panduan#langkah-${h.step}`} className="small">Lihat panduan lengkap dengan gambar →</Link>}
          {!h.admin && <Link href="/bantuan" className="small">Masih bingung? Cari di Pusat bantuan atau tanya via WhatsApp →</Link>}
          <button className="primary" onClick={() => setOpen(false)}>Mengerti</button>
        </Sheet>
      )}
    </>
  );
}
