'use client';

import Link from 'next/link';

export default function ChatError() {
  return <section className="panel stack" role="alert">
    <h1>Chat pelanggan belum dapat dibuka</h1>
    <p>Coba muat ulang untuk membuka percakapan kembali.</p>
    <div className="row">
      <button className="primary" type="button" onClick={() => window.location.reload()}>Muat ulang</button>
      <Link href="/buka">Kembali ke beranda</Link>
    </div>
  </section>;
}
