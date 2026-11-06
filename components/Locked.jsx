'use client';
import Link from 'next/link';

// Kotak ajakan upgrade untuk fitur yang terkunci
export default function Locked({ need = 'standar', title, text }) {
  return (
    <div className="lock noprint">
      <b>🔒 {title || 'Fitur paket berbayar'}</b>
      {text && <span className="small">{text}</span>}
      <Link href="/langganan"><button className="primary sm">Lihat paket</button></Link>
    </div>
  );
}
