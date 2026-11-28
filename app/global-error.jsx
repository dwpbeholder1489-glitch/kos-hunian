'use client';

export default function GlobalError() {
  return <html lang="id">
    <body style={{ margin: 0, color: '#14251f', background: '#f7faf8', fontFamily: 'system-ui, sans-serif' }}>
      <main style={{ maxWidth: 440, margin: '18vh auto 0', padding: 24 }}>
        <h1>PRASARA belum dapat dibuka</h1>
        <p>Muat ulang halaman untuk mencoba kembali.</p>
        <button type="button" onClick={() => window.location.reload()} style={{
          background: '#116c45', color: '#fff', border: 0, borderRadius: 8, minHeight: 44, padding: '0 16px', fontSize: 16,
        }}>Muat ulang</button>
      </main>
    </body>
  </html>;
}
