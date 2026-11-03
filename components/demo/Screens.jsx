// Layar contoh (tiruan tampilan aplikasi) berisi data contoh — dipakai di landing page & panduan.
// Tanpa hooks, aman dirender di server.
import {
  rp, KOS, ROOMS, ROOM_ST, INVOICES, PAYMENTS_IN, EXPENSES, CASH_IN, CASH_OUT, FILLED, RENTABLE, ARREARS, BILLED, TREND, MONTH, MONTH_SHORT, d, dFull,
} from './sample';

const TABS = ['Dashboard', 'Kamar', 'Penghuni', 'Tagihan', 'Pembayaran'];

export function Phone({ tab, children, bare }) {
  return (
    <div className="mini" aria-label={`Contoh tampilan ${tab || ''}`}>
      {!bare && (
        <div className="mini-top">
          <div className="mini-brand"><span className="mark">KH</span><b>{KOS.name}</b><span className="mini-help">?</span></div>
          <div className="mini-tabs">{TABS.map((t) => <span key={t} className={t === tab ? 'on' : ''}>{t}</span>)}</div>
        </div>
      )}
      <div className="mini-body">{children}</div>
    </div>
  );
}

const Title = ({ children, help = true }) => <div className="row between"><div className="row"><h2>{children}</h2>{help && <span className="helpchip">? Panduan</span>}</div></div>;
const F = ({ label, value, hint, money, sel }) => (
  <label className="f">{label}<span className={'mini-input' + (money ? ' r' : '') + (sel ? ' sel' : '')}>{value}</span>{hint && <span className="hint">{hint}</span>}</label>
);
const Chip = ({ s }) => {
  const m = { lunas: ['good', 'Lunas'], menunggak: ['bad', 'Menunggak'], sebagian: ['gold', 'Dibayar sebagian'], belum: ['info', 'Belum bayar'] }[s];
  return <span className={'chip ' + m[0]}>{m[1]}</span>;
};

export function ScrDashboard() {
  const debtors = ROOMS.filter((r) => r.debt > 0);
  return (
    <Phone tab="Dashboard">
      <h2>Ringkasan {MONTH}</h2>
      <div className="mini-grid">
        <div className="tile hero"><span className="label">Kas bersih bulan ini</span><span className="v">{rp(CASH_IN - CASH_OUT)}</span><span className="s">Masuk {rp(CASH_IN)}</span></div>
        <div className="tile"><span className="label">Hunian</span><span className="v">{Math.round((FILLED / RENTABLE) * 100)}%</span><span className="s">{FILLED} dari {RENTABLE} kamar terisi</span></div>
        <div className="tile"><span className="label">Tagihan bulan ini</span><span className="v">{rp(BILLED)}</span><span className="s">Terkumpul {rp(CASH_IN)}</span></div>
        <div className="tile bad"><span className="label">Tunggakan</span><span className="v">{rp(ARREARS)}</span><span className="s">{debtors.length} penghuni</span></div>
      </div>
      <div className="panel"><h3>Penghuni menunggak</h3>
        <div className="list">{debtors.map((r) => <div className="li" key={r.code}><div className="main"><b>{r.who}</b><span className="small muted">Kamar {r.code}</span></div><span className="num" style={{ color: 'var(--bad)' }}>{rp(r.debt)}</span></div>)}</div>
      </div>
    </Phone>
  );
}

export function ScrRooms() {
  return (
    <Phone tab="Kamar">
      <div className="row between"><Title>Kamar</Title><span className="mini-btn primary">+ Kamar</span></div>
      <div className="seg"><button className="on">Semua 10</button><button>Tersedia 2</button><button>Terisi 7</button></div>
      <div className="rooms">
        {ROOMS.map((r) => (
          <div key={r.code} className={'room ' + r.status}>
            <span className="code">{r.code}<span className={'dot ' + r.status} /></span>
            <span className="who">{r.who || ROOM_ST[r.status]}</span>
            <span className="small muted">{rp(r.rent)}</span>
            {r.debt > 0 && <span className="small" style={{ color: 'var(--bad)', fontWeight: 800 }}>Tunggak {rp(r.debt)}</span>}
          </div>
        ))}
      </div>
    </Phone>
  );
}

export function ScrSignup() {
  return (
    <Phone bare>
      <p className="mini-hello">Daftarkan kos Anda</p>
      <F label="Nama kos" value="Kos Hunian" />
      <F label="Alamat (opsional)" value={KOS.address} />
      <div className="row"><F label="Jumlah kamar" value="10" /><F label="Awalan kode" value="A" hint="A → A01, A02, …" /></div>
      <span className="mini-btn cta">Buat kos</span>
    </Phone>
  );
}

export function ScrHelp() {
  return (
    <Phone bare>
      <div className="row between"><h3>Panduan · Tagihan</h3><span className="small" style={{ color: 'var(--brand-2)', fontWeight: 800 }}>Tutup</span></div>
      <span className="label">Cara pakai</span>
      <ol className="mini-ol">
        <li>Tagihan sewa terbit otomatis 7 hari sebelum jatuh tempo.</li>
        <li>Ketuk tagihan → <b>Catat pembayaran</b>.</li>
        <li>Biaya di luar sewa: <b>+ Tagihan tambahan</b>.</li>
      </ol>
      <div className="mini-warn"><b>PERHATIAN</b><br />Catat pembayaran transfer/QRIS hanya setelah uang benar-benar masuk ke rekening Anda.</div>
      <span className="mini-btn primary">Mengerti</span>
    </Phone>
  );
}

export function ScrRoomEdit() {
  return (
    <Phone bare>
      <div className="row between"><h3>Ubah kamar A01</h3><span className="small" style={{ color: 'var(--brand-2)', fontWeight: 800 }}>Tutup</span></div>
      <div className="row"><F label="Kode kamar" value="A01" /><F label="Harga sewa / bulan" value="750.000" money /></div>
      <F label="Status" value="Tersedia" sel hint={'"Terisi" otomatis saat penghuni masuk.'} />
      <F label="Fasilitas" value="Kasur, lemari, KM dalam, WiFi" hint="Pisahkan dengan koma" />
      <span className="mini-btn cta">Simpan</span>
    </Phone>
  );
}

export function ScrStartLease() {
  return (
    <Phone bare>
      <div className="row between"><h3>Isi kamar</h3><span className="small" style={{ color: 'var(--brand-2)', fontWeight: 800 }}>Tutup</span></div>
      <F label="Kamar" value="A04 · Rp 700.000" sel />
      <div className="seg"><button>Penghuni terdaftar</button><button className="on">Penghuni baru</button></div>
      <div className="row"><F label="Nama lengkap" value="Rizky Ramadhan" /><F label="No. WhatsApp" value="0812-3456-7890" /></div>
      <F label="Harga sewa per bulan" value="700.000" money />
      <div className="row"><F label="Tanggal masuk" value={dFull(12)} /><F label="Tagihan pertama jatuh tempo" value={dFull(12)} /></div>
      <span className="mini-btn cta">Mulai sewa</span>
    </Phone>
  );
}

export function ScrInvoices() {
  return (
    <Phone tab="Tagihan">
      <div className="row between"><Title>Tagihan</Title><span className="mini-btn primary">+ Tagihan tambahan</span></div>
      <div className="seg"><button className="on">Belum lunas</button><button>Menunggak</button><button>Lunas</button></div>
      <div className="panel"><div className="list">
        {INVOICES.filter((i) => i.state !== 'lunas').map((i) => (
          <div className="li" key={i.who + i.title}><div className="main"><b>{i.who} · {i.room}</b><span className="small muted">{i.title} · jatuh tempo {i.due}</span></div>
            <div style={{ textAlign: 'right' }}><div className="num">{rp(i.left)}</div><Chip s={i.state} /></div></div>
        ))}
      </div></div>
    </Phone>
  );
}

export function ScrPay() {
  return (
    <Phone bare>
      <div className="row between"><h3>Bayar · Dimas Pratama</h3><span className="small" style={{ color: 'var(--brand-2)', fontWeight: 800 }}>Tutup</span></div>
      <p className="small muted" style={{ margin: 0 }}>Sewa {d(3)} – {d(2, -1)} · sisa {rp(350000)}</p>
      <div className="row"><F label="Jumlah" value="350.000" money /><F label="Tanggal bayar" value={dFull(12)} /></div>
      <div className="row"><F label="Metode" value="Transfer bank" sel /><F label="No. referensi" value="BCA 0912" /></div>
      <label className="row small" style={{ fontWeight: 700 }}><span className="mini-check">✓</span> Uang sudah saya terima (langsung terverifikasi)</label>
      <span className="mini-btn cta">Simpan pembayaran</span>
    </Phone>
  );
}

export function ScrVerify() {
  return (
    <Phone tab="Pembayaran">
      <Title>Pembayaran</Title>
      <div className="panel"><h3>Menunggu verifikasi</h3>
        <div className="li" style={{ alignItems: 'flex-start' }}><div className="main"><b>Siti Aminah · A03</b><span className="small muted">Sewa {d(10)} · {d(9)} · Transfer bank</span>
          <div className="row" style={{ marginTop: 6 }}><span className="mini-btn primary sm">Uang sudah masuk</span><span className="mini-btn danger sm">Tolak</span></div></div>
          <div style={{ textAlign: 'right' }}><div className="num">{rp(700000)}</div><span className="chip gold">Menunggu</span></div></div>
      </div>
      <div className="panel"><div className="row between"><span className="label">Diterima {MONTH_SHORT}</span><b>{rp(CASH_IN)}</b></div>
        <div className="list">{PAYMENTS_IN.slice(0, 3).map(([w, r, a, t, m]) => <div className="li" key={w}><div className="main"><b>{w} · {r}</b><span className="small muted">{t} · {m}</span></div><div className="num">{rp(a)}</div></div>)}</div>
      </div>
    </Phone>
  );
}

export function ScrReminder() {
  return (
    <Phone tab="Penghuni">
      <h3>Budi Santoso</h3>
      <dl className="kv"><dt>Kamar</dt><dd>A02</dd><dt>WhatsApp</dt><dd>0813-xxxx-2211</dd><dt>Belum dibayar</dt><dd style={{ color: 'var(--bad)' }}>{rp(750000)}</dd></dl>
      <span className="mini-btn primary">Kirim pengingat via WhatsApp</span>
      <div className="mini-wa">Halo Budi Santoso, ini pengingat dari {KOS.name}. Tagihan yang belum dibayar:<br />• Sewa {d(1)} – {d(30)}: {rp(750000)}<br />Total {rp(750000)}. Terima kasih 🙏</div>
    </Phone>
  );
}

export function ScrExtra() {
  return (
    <Phone bare>
      <div className="row between"><h3>Tagihan tambahan</h3><span className="small" style={{ color: 'var(--brand-2)', fontWeight: 800 }}>Tutup</span></div>
      <F label="Penghuni" value="Rina Lestari · A01" sel />
      <F label="Keterangan" value="Listrik token" />
      <div className="row"><F label="Jumlah" value="100.000" money /><F label="Jatuh tempo" value={dFull(8)} /></div>
      <span className="mini-btn cta">Buat tagihan</span>
    </Phone>
  );
}

export function ScrExpense() {
  return (
    <Phone bare>
      <div className="seg"><button className="on">Biaya kos</button><button>Diambil pemilik & lainnya</button></div>
      <div className="row between"><h3>Catat pengeluaran</h3><span className="small" style={{ color: 'var(--brand-2)', fontWeight: 800 }}>Tutup</span></div>
      <div className="row"><F label="Jumlah" value="275rb" money /><F label="Tanggal" value={dFull(6)} /></div>
      <F label="Kategori" value="Perbaikan" sel hint="Jenis: Operasional" />
      <F label="Keterangan" value="Ganti kran kamar mandi A08" />
      <span className="mini-btn cta">Simpan</span>
      <div className="panel"><div className="row between"><span className="label">Total {MONTH_SHORT}</span><b>{rp(CASH_OUT)}</b></div>
        <dl className="kv">{EXPENSES.map(([c, , a]) => [<dt key={c + 't'}>{c}</dt>, <dd key={c + 'd'}>{rp(a)}</dd>])}</dl></div>
    </Phone>
  );
}

export function ScrOwner() {
  return (
    <Phone bare>
      <div className="seg"><button>Biaya kos</button><button className="on">Diambil pemilik & lainnya</button></div>
      <div className="row between"><h3>Catat transaksi lain</h3><span className="small" style={{ color: 'var(--brand-2)', fontWeight: 800 }}>Tutup</span></div>
      <F label="Jenis" value="Diambil pemilik (prive)" sel hint="Uang kos dipakai untuk keperluan pribadi" />
      <div className="row"><F label="Jumlah" value="500rb" money /><F label="Tanggal" value={dFull(9)} /></div>
      <F label="Keterangan" value="Belanja rumah tangga" />
      <span className="mini-btn cta">Simpan</span>
      <dl className="kv"><dt>Diambil pemilik (prive)</dt><dd style={{ color: 'var(--bad)' }}>−{rp(500000)}</dd><dt>Pendapatan lain</dt><dd style={{ color: 'var(--good)' }}>+{rp(150000)}</dd></dl>
    </Phone>
  );
}

export function ScrEndLease() {
  return (
    <Phone bare>
      <div className="row between"><h3>Akhiri sewa · Nanda Putri</h3><span className="small" style={{ color: 'var(--brand-2)', fontWeight: 800 }}>Tutup</span></div>
      <F label="Tanggal keluar" value={dFull(24)} />
      <F label="Alasan (opsional)" value="Lulus kuliah, pulang kampung" />
      <p className="small muted" style={{ margin: 0 }}>Tagihan sewa untuk periode setelah tanggal keluar yang belum dibayar akan dibatalkan otomatis.</p>
      <span className="mini-btn cta">Akhiri sewa</span>
    </Phone>
  );
}

export function ScrReport() {
  const ops = CASH_OUT - 0;
  return (
    <Phone bare>
      <h3>Laba rugi · {MONTH_SHORT}</h3>
      <table><tbody>
        <tr><td>Pendapatan sewa</td><td className="n">{rp(CASH_IN)}</td></tr>
        <tr><td>Pendapatan tagihan tambahan</td><td className="n">{rp(0)}</td></tr>
        <tr><td>Biaya operasional</td><td className="n">−{rp(ops)}</td></tr>
        <tr className="total"><td>Laba operasional</td><td className="n">{rp(CASH_IN - ops)}</td></tr>
        <tr><td className="muted">Belanja modal / renovasi</td><td className="n muted">{rp(0)}</td></tr>
        <tr className="total"><td>Arus kas bersih</td><td className="n">{rp(CASH_IN - ops)}</td></tr>
      </tbody></table>
      <h3 style={{ marginTop: 6 }}>6 bulan terakhir</h3>
      <div className="mini-bars">{TREND.map((t) => (
        <div key={t.label} className="mini-bar"><i style={{ height: `${Math.round((t.laba / 3500000) * 100)}%` }} /><span>{t.label.split(' ')[0]}</span></div>
      ))}</div>
    </Phone>
  );
}

export function ScrExport() {
  return (
    <Phone bare>
      <h3>Ekspor</h3>
      <p className="small muted" style={{ margin: 0 }}>File CSV bisa dibuka langsung di Excel atau Google Sheets.</p>
      <span className="mini-btn">⬇ Laporan 12 bulan (Excel)</span>
      <span className="mini-btn">⬇ Transaksi {MONTH_SHORT} (Excel)</span>
      <span className="mini-btn">🖨 Cetak / simpan PDF</span>
    </Phone>
  );
}

export function ScrReceipt() {
  return (
    <Phone bare>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="brand"><span className="mark">KH</span><div><b>{KOS.name}</b><div className="small muted">{KOS.address}</div></div></div>
        <div style={{ textAlign: 'right' }}><div style={{ fontFamily: 'var(--display)', fontSize: 22, lineHeight: 1 }}>Kwitansi</div><div className="small muted">No. KW-A01-7F3C</div></div>
      </div>
      <dl className="kv"><dt>Telah terima dari</dt><dd>Rina Lestari</dd><dt>Kamar</dt><dd>A01</dd><dt>Untuk</dt><dd>Sewa {d(5)} – {d(4, -1)}</dd><dt>Metode</dt><dd>Transfer bank</dd></dl>
      <div style={{ background: 'var(--sunk)', borderRadius: 10, padding: '10px 12px' }}>
        <div className="label">Jumlah</div><div style={{ fontSize: 20, fontWeight: 800 }}>{rp(750000)}</div>
        <div className="small muted" style={{ fontStyle: 'italic' }}>Tujuh ratus lima puluh ribu rupiah</div>
      </div>
      <dl className="kv"><dt>Sisa tagihan</dt><dd>Lunas</dd></dl>
    </Phone>
  );
}

export function ScrPlan() {
  return (
    <Phone tab="Langganan" bare>
      <h3>1. Pilih paket</h3>
      <div className="mini-grid">
        <div className="tile" style={{ borderColor: 'var(--gold)', borderWidth: 2 }}><span className="label">Standar</span><span className="v">Rp 100.000</span><span className="s">/bulan</span></div>
        <div className="tile"><span className="label">Pro</span><span className="v">Rp 150.000</span><span className="s">/bulan</span></div>
      </div>
      <h3>2. Pilih durasi</h3>
      <div className="seg"><button>1 bulan</button><button className="on">3 bulan</button><button>6 bulan</button><button>12 bulan</button></div>
      <div className="row between"><span className="label">Total bayar</span><b style={{ fontSize: 18 }}>Rp 300.000</b></div>
      <h3>3. Bayar</h3>
      <div className="seg"><button className="on">QRIS</button><button>Transfer bank</button></div>
      <span className="mini-btn cta">Saya sudah bayar</span>
    </Phone>
  );
}

export function ScrPortal() {
  return (
    <div className="mini" aria-label="Contoh portal penghuni">
      <div className="mini-top">
        <div className="mini-brand"><span className="mark">KH</span><b>{KOS.name}</b><span className="mini-help" style={{ width: 'auto', padding: '0 8px', borderRadius: 99 }}>Hubungi</span></div>
        <div className="mini-tabs"><span>Tagihan</span><span>Riwayat</span><span>Info kos</span><span className="on">Tanya asisten</span></div>
      </div>
      <div className="mini-body">
        <h2>Halo, Budi Santoso</h2>
        <div className="chatmsg user"><div>Berapa tagihan saya bulan ini?</div></div>
        <div className="chatmsg assistant"><div>Tagihan sewa kamar A02 periode {d(1)} – {d(30)} sebesar Rp750.000 belum dibayar dan sudah lewat jatuh tempo {d(1)}. Silakan transfer lalu tekan "Kirim bukti" di tab Tagihan ya.</div></div>
        <div className="chatmsg user"><div>Ajarin PR matematika dong</div></div>
        <div className="chatmsg assistant"><div>Maaf, saya hanya bisa membantu urusan kos. Ada yang ingin ditanyakan soal tagihan atau peraturan kos?</div></div>
      </div>
    </div>
  );
}
