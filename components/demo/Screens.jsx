// Layar contoh (tiruan tampilan aplikasi) berisi data contoh — dipakai di landing page & panduan.
// Tanpa hooks, aman dirender di server.
import { LogoMark } from '@/components/Logo';
import {
  rp, KOS, ROOMS, ROOM_ST, INVOICES, PAYMENTS_IN, EXPENSES, CASH_IN, CASH_OUT, FILLED, RENTABLE, ARREARS, BILLED, TREND, MONTH, MONTH_SHORT, d, dFull,
} from './sample';

const TABS = ['Dashboard', 'Kamar', 'Penghuni', 'Tagihan', 'Pembayaran'];

export function Phone({ tab, children, bare, tabs = TABS, name = KOS.name }) {
  return (
    <div className="mini" aria-label={`Contoh tampilan ${tab || ''}`}>
      {!bare && (
        <div className="mini-top">
          <div className="mini-brand"><LogoMark size={30} /><b>{name}</b><span className="mini-help">?</span></div>
          <div className="mini-tabs">{tabs.map((t) => <span key={t} className={t === tab ? 'on' : ''}>{t}</span>)}</div>
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
  const C = [['🛒', 'Retail & Perdagangan', true], ['🏠', 'Properti & Hunian', true], ['🧺', 'Laundry & Jasa Rumah Tangga', true], ['🍽️', 'Kuliner & Hospitality', false]];
  return (
    <Phone bare>
      <p className="mini-hello">Kenalkan bisnis Anda</p>
      <span className="small"><b>Apa jenis bisnis yang Anda miliki atau kelola?</b> Boleh lebih dari satu.</span>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>{C.map(([i, n, on]) => (
        <div key={n} className="panel" style={{ padding: 8, gap: 2, ...(on ? { borderColor: 'var(--gold)' } : {}) }}><span>{i}{on ? ' ✓' : ''}</span><b className="small" style={{ fontSize: 11 }}>{n}</b></div>
      ))}</div>
      <span className="mini-btn cta">Lanjut · 3 bisnis</span>
      <span className="small muted">DATA CONTOH</span>
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
      <div className="row"><F label="Tanggal masuk" value={dFull(12)} /><F label="Sewa dihitung mulai" value={dFull(12)} /></div>
      <F label="Batas bayar sewa bulan pertama" value={dFull(15) + ' (+3 hari)'} />
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
      <span className="small" style={{ textAlign: 'center', color: 'var(--gold)', fontWeight: 700 }}>Ubah teks pesan WhatsApp</span>
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
      <span className="small muted">boleh lebih awal atau lebih lambat dari rencana</span>
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
        <div className="brand"><LogoMark size={30} /><div><b>{KOS.name}</b><div className="small muted">{KOS.address}</div></div></div>
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
        <div className="tile"><span className="label">Dasar</span><span className="planwas"><s>Rp 69.000</s></span><span className="v">Rp 49.000</span><span className="s">/bulan</span></div>
        <div className="tile" style={{ borderColor: 'var(--gold)', borderWidth: 2 }}><span className="label">Bisnis</span><span className="planwas"><s>Rp 139.000</s></span><span className="v">Rp 99.000</span><span className="s">/bulan</span></div>
        <div className="tile"><span className="label">Pro</span><span className="planwas"><s>Rp 199.000</s></span><span className="v">Rp 149.000</span><span className="s">/bulan</span></div>
      </div>
      <h3>2. Pilih durasi</h3>
      <div className="seg"><button>1 bulan</button><button className="on">3 bulan</button><button>6 bulan</button><button>12 bulan</button></div>
      <div className="row between"><span className="label">Total bayar</span><b style={{ fontSize: 18 }}>Rp 297.000</b></div>
      <h3>3. Bayar</h3>
      <div className="seg"><button className="on">QRIS</button><button>Transfer bank</button></div>
      <span className="mini-btn cta">Saya sudah bayar</span>
    </Phone>
  );
}

// Penawaran upgrade (Growth Trigger): kartu di atas lembar bawah, dengan harga dari paket (contoh)
export function ScrPenawaran() {
  return (
    <Phone bare>
      <h3>Bisnis Anda mulai berkembang!</h3>
      <p className="small" style={{ margin: 0 }}>Anda sudah menggunakan seluruh kapasitas karyawan Paket Dasar. Upgrade ke Paket Bisnis untuk mengelola hingga 5 akun karyawan.</p>
      <div className="tile"><span className="label">Paket saat ini</span><span className="v">Dasar</span><span className="s">1 dari 1 karyawan</span></div>
      <div className="tile" style={{ borderColor: 'var(--gold)', borderWidth: 2 }}>
        <span className="label">Paket Bisnis</span>
        <span className="planwas"><s>Rp 139.000</s> /bulan · hemat 29%</span>
        <span className="v">Rp 99.000<span className="small muted"> /bulan</span></span>
        <span className="s">Hingga 5 akun karyawan</span>
      </div>
      <span className="mini-btn cta">Upgrade ke Paket Bisnis</span>
      <span className="mini-btn">Tetap menggunakan Paket Dasar</span>
      <span className="small muted">Anda bisa menutup penawaran ini kapan saja. Data dan paket Anda tidak berubah sebelum pembayaran disetujui.</span>
    </Phone>
  );
}

// Setelah pembayaran terverifikasi: paket, masa aktif, kapasitas & fitur baru, lalu kembali ke aktivitas (contoh)
export function ScrUpgradeSukses() {
  return (
    <Phone bare>
      <h3>Upgrade Berhasil!</h3>
      <div className="notice good" style={{ margin: 0 }}><b>Paket Bisnis</b> sudah aktif sampai {dFull(13, -1)}. Pembayaran Anda sudah diverifikasi.</div>
      <div className="tile"><span className="label">Paket baru</span><span className="v">Bisnis</span><span className="s">Sebelumnya: Dasar · 1 bulan · dibayar {rp(99000)}</span></div>
      <div className="tile">
        <span className="label">Kapasitas baru</span>
        <span className="small">Karyawan: <s className="muted">1</s> → <b>5</b></span>
        <span className="small">Cabang: <s className="muted">1</s> → <b>3</b></span>
        <span className="small">Produk/layanan aktif: <s className="muted">100</s> → <b>1.000</b></span>
      </div>
      <span className="mini-btn cta">Lanjut tambah karyawan</span>
      <span className="mini-btn">Tutup</span>
    </Phone>
  );
}

// Rekonsiliasi bank (Paket Bisnis): saldo rekening koran vs baris akun Bank yang dicentang (contoh)
export function ScrRekonBank() {
  const rows = [['Transfer dari pelanggan', '+', 2500000, true], ['Setor tunai ke bank', '+', 1000000, true], ['Bayar supplier via transfer', '−', 750000, false]];
  return (
    <Phone bare>
      <div className="row between"><h3>Rekonsiliasi bank · {MONTH}</h3><span className="chip void">Draf</span></div>
      <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
        <div className="tile" style={{ flex: 1 }}><span className="label">Seharusnya di bank</span><span className="v">{rp(3500000)}</span></div>
        <div className="tile" style={{ flex: 1 }}><span className="label">Selisih</span><span className="v">{rp(0)}</span><span className="s">cocok</span></div>
      </div>
      <F label="Saldo rekening koran akhir bulan" value="3.500.000" />
      {rows.map(([n, t, v, ok]) => (
        <div key={n} className="row between small" style={{ flexWrap: 'nowrap', gap: 8 }}>
          <span>{ok ? '☑' : '☐'} {n}</span><span style={{ whiteSpace: 'nowrap' }}>{t}{rp(v)}</span>
        </div>
      ))}
      <span className="mini-btn cta">Selesaikan rekonsiliasi</span>
    </Phone>
  );
}

// Anggaran & realisasi (Paket Bisnis): bilah hijau/kuning/merah per kategori biaya (contoh)
export function ScrAnggaran() {
  const bar = (p, c) => <div style={{ height: 8, borderRadius: 4, background: 'var(--line)', overflow: 'hidden' }}><div style={{ width: `${Math.min(p, 100)}%`, height: '100%', background: c }} /></div>;
  const rows = [['Listrik dan air', 800000, 610000], ['Gaji karyawan', 3000000, 2700000], ['Perbaikan', 500000, 640000]];
  return (
    <Phone bare>
      <h3>Anggaran</h3>
      <div className="row between"><span className="mini-btn">‹</span><b className="small">{MONTH}</b><span className="mini-btn">›</span></div>
      <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}><div className="tile" style={{ flex: 1 }}><span className="label">Anggaran</span><span className="v">{rp(4300000)}</span></div><div className="tile" style={{ flex: 1 }}><span className="label">Sisa</span><span className="v">{rp(350000)}</span></div></div>
      {rows.map(([n, a, r]) => { const p = Math.round((r * 100) / a); return (
        <div key={n} className="tile" style={{ gap: 4 }}>
          <div className="row between"><b className="small">{n}</b><span className="small">{rp(r)} <span className="muted">/ {rp(a)}</span></span></div>
          {bar(p, p >= 100 ? 'var(--bad)' : p >= 80 ? 'var(--att)' : 'var(--gold)')}
          <span className="small" style={{ color: p >= 100 ? 'var(--bad)' : undefined }}>{p >= 100 ? `Melebihi ${rp(r - a)}` : `Sisa ${rp(a - r)}`} · {p}%</span>
        </div>); })}
      <span className="mini-btn">Salin anggaran bulan lalu</span>
    </Phone>
  );
}

// Keuangan › Analisis bisnis (contoh): bulan ini vs lalu + perbandingan cabang (Paket Pro)
// Pesanan grosir: penawaran → pesanan → surat jalan → faktur (contoh)
export function ScrGrosir() {
  return (
    <Phone bare>
      <div className="row between"><h3>SO-261114-001</h3><span className="small" style={{ color: 'var(--brand-2)', fontWeight: 800 }}>Tutup</span></div>
      <span className="small"><b>Warung Bu Tini</b> · Dikirim sebagian · tempo 14 hari</span>
      <div className="unitbox small" style={{ gap: 2 }}><span>Piutang {rp(786000)} · batas kredit {rp(3000000)}</span><span>Memakai daftar harga <b>Reseller</b></span></div>
      <div className="row between small"><span>Beras 5kg · 10 karung × {rp(56000)} · terkirim 6</span><b>{rp(560000)}</b></div>
      <div className="row between small"><span>Minyak 1L · 5 dus × {rp(190000)} · terkirim 5</span><b>{rp(950000)}</b></div>
      <div className="row between"><b>Total</b><b>{rp(1510000)}</b></div>
      <div className="row between small"><span><b>SJ-261114-001</b> · Ujang</span><span className="chip gold">Dalam pengiriman</span></div>
      <div className="row" style={{ gap: 6 }}><span className="mini-btn">Surat jalan</span><span className="mini-btn">Faktur</span><span className="mini-btn cta">Sudah diterima</span></div>
      <span className="mini-btn cta">Buat surat jalan</span>
    </Phone>
  );
}

export function ScrSatuan() {
  return (
    <Phone bare>
      <h3>Gula pasir</h3>
      <div className="unitbox small" style={{ gap: 4 }}><b>Satuan utama · kg</b><span>Modal {rp(12000)}/kg · eceran {rp(14000)}</span></div>
      <div className="unitbox small" style={{ gap: 4 }}>
        <b>Kemasan 250 gram</b>
        <div className="row" style={{ gap: 6 }}><span className="mini-btn">Isi 250</span><span className="mini-btn">gram</span></div>
        <span>Hasil: <b>1 Kemasan 250 gram = 0,25 kg</b> · modal {rp(3000)} · <span style={{ color: 'var(--good)' }}>untung {rp(700)}</span></span>
      </div>
      <div className="unitbox small" style={{ gap: 4 }}>
        <b>gram</b>
        <div className="row" style={{ gap: 6 }}><span className="mini-btn">Isi 250</span><span className="mini-btn">kg</span></div>
        <span style={{ color: 'var(--bad)' }}>Nama "gram" berarti 0,001 kg, tapi isinya 250 kg.</span>
      </div>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}><span className="mini-btn">+ ½ kg</span><span className="mini-btn">+ Sak 25 kg</span><span className="mini-btn cta">+ Satuan lain</span></div>
    </Phone>
  );
}

export function ScrAset() {
  return (
    <Phone bare>
      <h3>Aset tetap</h3>
      <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
        <div className="tile" style={{ flex: 1 }}><span className="label">Nilai buku</span><span className="v">{rp(19500000)}</span></div>
        <div className="tile" style={{ flex: 1 }}><span className="label">Susut / bulan</span><span className="v">{rp(750000)}</span></div>
      </div>
      <div className="row between small"><span><b>Motor pengantar</b><br />Kendaraan · 4 tahun · susut {rp(375000)}/bulan</span><b>{rp(15750000)}</b></div>
      <div className="row between small"><span><b>Kulkas showcase</b><br />Peralatan · 2 tahun · sisa 21 bulan</span><b>{rp(3750000)}</b></div>
      <div className="unitbox small" style={{ gap: 4 }}><b>Jual / lepas aset</b><span>Nilai buku {rp(3750000)} → dijual {rp(4000000)} · <span style={{ color: 'var(--good)' }}>untung {rp(250000)}</span></span></div>
      <span className="mini-btn cta">+ Tambah aset</span>
    </Phone>
  );
}

export function ScrSDM() {
  return (
    <Phone bare>
      <h3>SDM & gaji</h3>
      <div className="unitbox small" style={{ gap: 6 }}>
        <div className="row between"><b>Absen saya · Rina</b><span className="chip">Pagi 08:00–16:00</span></div>
        <div className="row" style={{ gap: 6 }}><span className="mini-btn" style={{ flex: 1, textAlign: 'center' }}>Masuk 07.56</span><span className="mini-btn cta" style={{ flex: 1, textAlign: 'center' }}>Absen pulang</span></div>
      </div>
      <div className="row" style={{ gap: 6 }}><span className="mini-btn">Absensi</span><span className="mini-btn">Jadwal</span><span className="mini-btn">Karyawan</span><span className="mini-btn cta">Gaji</span></div>
      <div className="row between small"><span><b>Rina</b> · Bulanan · lembur 2 jam</span><b>{rp(2410000)}</b></div>
      <div className="row between small"><span><b>Budi</b> · Harian · hadir 22 hari · kasbon −{rp(50000)}</span><b>{rp(2150000)}</b></div>
      <div className="row between"><b>Total dibayar</b><b>{rp(4560000)}</b></div>
      <span className="mini-btn cta">Bayar gaji</span>
    </Phone>
  );
}

export function ScrAnalisis() {
  const bars = [42, 48, 45, 55, 52, 60, 58, 63, 61, 70, 66, 78];
  return (
    <Phone bare>
      <h3>Analisis bisnis</h3>
      <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
        <div className="tile" style={{ flex: 1 }}><span className="label">Pendapatan</span><span className="v">{rp(18400000)}</span><span className="s" style={{ color: 'var(--gold)' }}>▲ 18%</span></div>
        <div className="tile" style={{ flex: 1 }}><span className="label">Laba</span><span className="v">{rp(3150000)}</span><span className="s" style={{ color: 'var(--gold)' }}>▲ 9%</span></div>
      </div>
      <b className="small">Tren 12 bulan</b>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 60 }}>{bars.map((h, i) => <div key={i} style={{ flex: 1, height: `${h}%`, background: i === 11 ? 'var(--gold)' : 'color-mix(in srgb, var(--gold) 50%, transparent)', borderRadius: '3px 3px 0 0' }} />)}</div>
      <b className="small">Perbandingan cabang</b>
      <div className="row between small"><span>Pusat · 72%</span><span>Laba {rp(2600000)}</span></div>
      <div className="row between small"><span>Cabang Pasar · 28%</span><span>Laba {rp(550000)}</span></div>
    </Phone>
  );
}

// Karyawan › Atur akses: modul (Paket Bisnis), izin per tindakan & penyetuju (Paket Pro) — contoh
export function ScrAksesKaryawan() {
  const cek = (on, t, d) => <div className="row" style={{ gap: 8, flexWrap: 'nowrap', alignItems: 'flex-start' }}><span className="mini-btn" style={{ minWidth: 22, padding: '0 4px' }}>{on ? '✓' : ' '}</span><span style={{ display: 'flex', flexDirection: 'column' }}><b className="small">{t}</b><span className="small muted">{d}</span></span></div>;
  return (
    <Phone bare>
      <h3>Atur akses</h3>
      <b className="small">rina.kasir@gmail.com</b>
      <span className="small muted">Peran: Kasir</span>
      <b className="small">Modul yang boleh dibuka · Pilih sendiri</b>
      {cek(true, 'Kasir & penjualan', 'Kasir, pesanan, nota')}
      {cek(true, 'Barang, stok & belanja', 'Barang, stok, supplier')}
      {cek(false, 'Uang & laporan', 'Kas, laba, pembukuan')}
      <b className="small">Izin per tindakan (Pro)</b>
      <div className="row between small"><span>Membatalkan penjualan</span><span className="mini-btn">Tidak boleh</span></div>
      <div className="row between small"><span>Menyesuaikan stok</span><span className="mini-btn">Perlu persetujuan</span></div>
      <span className="mini-btn cta">Simpan</span>
    </Phone>
  );
}

// Persetujuan bertingkat: penyetuju tingkat 1 lalu pemilik (Paket Pro) — contoh
export function ScrPersetujuanTingkat() {
  return (
    <Phone bare>
      <h3>REQ-{'261114'}-003</h3>
      <b className="small">Sesuaikan stok Beras 5kg (rusak 10 karung)</b>
      <div className="row between small"><span>Estimasi nilai</span><b>{rp(200000)}</b></div>
      <span className="small muted">Perlu 2 tingkat persetujuan · sekarang di tingkat 2.</span>
      <div className="row between small"><span>Tingkat 1 · Andi (penyetuju) · “cek fisik ok”</span><span className="chip good">Setuju</span></div>
      <div className="row" style={{ gap: 6 }}><span className="mini-btn cta">Setujui & jalankan</span><span className="mini-btn">Tolak</span></div>
    </Phone>
  );
}

// Sesudah Berhenti memperpanjang: alasan opsional, bisa dilewati (contoh)
export function ScrAlasanBerhenti() {
  return (
    <Phone bare>
      <h3>Boleh tahu alasannya?</h3>
      <div className="notice good" style={{ margin: 0 }}>Langganan sudah dihentikan. Paket tetap aktif sampai {dFull(13, -1)}; data tidak dihapus.</div>
      <p className="small muted" style={{ margin: 0 }}>Jawaban ini <b>opsional</b> dan tidak mengubah apa pun.</p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        <span className="mini-btn">Harga terlalu mahal</span><span className="mini-btn cta">Jarang dipakai</span><span className="mini-btn">Berhenti sementara</span>
      </div>
      <F label="Catatan (opsional)" value="Usaha sedang sepi, nanti lanjut lagi" />
      <span className="mini-btn cta">Kirim</span>
      <span className="mini-btn">Lewati</span>
    </Phone>
  );
}

export function ScrPortal() {
  return (
    <div className="mini" aria-label="Contoh portal penghuni">
      <div className="mini-top">
        <div className="mini-brand"><LogoMark size={30} /><b>{KOS.name}</b><span className="mini-help" style={{ width: 'auto', padding: '0 8px', borderRadius: 99 }}>Hubungi</span></div>
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

// Bisnis jasa (laundry) — DATA CONTOH
const JASA_TABS = ['Dashboard', 'Pesanan', 'Kas', 'Laporan'];
const ORDERS = [
  ['PSN-261107-004', 'Rina', 'Cuci kering setrika 3,5 kg', 'Setrika', 'gold', 'janji Sab 8 Nov', 24500, 0],
  ['PSN-261107-003', 'Pak Darto', 'Bed cover 2 pcs', 'Cuci', 'gold', 'janji Sen 10 Nov', 50000, 20000],
  ['PSN-261106-009', 'Sari', 'Kilat 3 kg · diantar', 'Siap diantar', 'good', 'Jl. Melati 12', 36000, 36000],
  ['PSN-261105-002', 'Bu Wati', 'Selimut 1 pcs', 'Cek kualitas (QC)', 'bad', 'terlambat 1 hari', 20000, 0],
];
export function ScrPesanan() {
  return (
    <Phone tab="Pesanan" tabs={JASA_TABS} name="Laundry Bersih">
      <div className="row between"><Title>Pesanan</Title><span className="mini-btn primary">+ Pesanan baru</span></div>
      <div className="seg"><button className="on">Aktif 4</button><button>Diterima</button><button>Cuci</button><button>Setrika</button><button>Siap</button></div>
      <div className="panel"><div className="list">
        {ORDERS.map(([no, who, what, st, tone, when, tot, paid]) => (
          <div className="li" key={no}><div className="main"><b>{who} · {no.slice(-3)}</b><span className="small muted">{what} · {when}</span></div>
            <div style={{ textAlign: 'right' }}><span className={'chip ' + tone}>{st}</span><div className="small muted">{paid >= tot ? 'Lunas' : `sisa ${rp(tot - paid)}`}</div></div></div>
        ))}
      </div></div>
      <span className="small muted">DATA CONTOH</span>
    </Phone>
  );
}
export function ScrNota() {
  return (
    <Phone bare>
      <pre className="struk" style={{ fontSize: 10.5 }}>{`         LAUNDRY BERSIH
--------------------------------
No            PSN-261107-004
Terima           7 Nov 09.12
Janji           Sab, 8 Nov
Pelanggan               Rina
--------------------------------
Cuci kering setrika
  3,5 kg x Rp7.000    Rp24.500
--------------------------------
TOTAL                 Rp24.500
Dibayar               Rp10.000
SISA                  Rp14.500
--------------------------------
Status: Setrika
       (DATA CONTOH)`}</pre>
      <div className="row"><span className="mini-btn primary">Cetak</span><span className="mini-btn">Kirim via WhatsApp</span></div>
    </Phone>
  );
}

// Kos lanjutan — DATA CONTOH
export function ScrDeposit() {
  return (
    <Phone tab="Penghuni">
      <h2>Rina Wulandari</h2>
      <div className="panel">
        <div className="row between"><span className="label">Deposit / uang jaminan</span><b>{rp(300000)}</b></div>
        <div className="list">
          <div className="li"><div className="main"><b className="small">Diterima</b><span className="small muted">2 Jan · Kas (tunai)</span></div><span className="num">+{rp(500000)}</span></div>
          <div className="li"><div className="main"><b className="small">Dipotong</b><span className="small muted">5 Nov · kunci lemari hilang</span></div><span className="num">−{rp(50000)}</span></div>
          <div className="li"><div className="main"><b className="small">Dipotong</b><span className="small muted">5 Nov · untuk tagihan</span></div><span className="num">−{rp(150000)}</span></div>
        </div>
        <div className="row"><span className="mini-btn sm">+ Terima deposit</span><span className="mini-btn sm">Kembalikan</span><span className="mini-btn sm">Potong</span></div>
      </div>
      <span className="small muted">DATA CONTOH</span>
    </Phone>
  );
}
export function ScrPerbaikan() {
  const T = [['Kran kamar mandi bocor', 'KLH-001 · Kamar A03 · Air · dari penghuni', 'Baru', 'info', true], ['Lampu lorong mati', 'KLH-002 · Area umum · Listrik · Pak Ujang', 'Dikerjakan', 'gold', false], ['Engsel pintu lepas', 'KLH-003 · Kamar B01 · Bangunan', 'Menunggu', 'gold', false]];
  return (
    <Phone tab="Penghuni">
      <div className="row between"><Title>Keluhan & perbaikan</Title><span className="mini-btn primary">+ Catat</span></div>
      <div className="seg"><button className="on">Belum selesai 3</button><button>Baru</button><button>Selesai</button></div>
      <div className="panel"><div className="list">{T.map(([t, s, st, tone, hi]) => (
        <div className="li" key={t}><div className="main"><b className="small">{t}</b><span className="small muted">{s}</span></div>
          <div style={{ textAlign: 'right' }}><span className={'chip ' + tone}>{st}</span>{hi && <div><span className="chip bad">Penting</span></div>}</div></div>
      ))}</div></div>
      <span className="small muted">DATA CONTOH</span>
    </Phone>
  );
}
export function ScrMeteran() {
  const R = [['A01', 'Rina', 1200, '1266', '66 kWh = Rp99.000'], ['A02', 'Dimas', 845, '903', '58 kWh = Rp87.000'], ['A03', 'Kosong', 50, '55', 'kamar kosong, tidak ditagih']];
  return (
    <Phone tab="Tagihan">
      <Title>Meteran listrik & air</Title>
      <div className="seg"><button className="on">Listrik</button><button>Air</button></div>
      <span className="small muted">Tarif Rp1.500/kWh · minimal Rp20.000</span>
      <div className="panel"><div className="list">{R.map(([c, w, prev, now, res]) => (
        <div className="li" key={c}><div className="main"><b className="small">{c}</b><span className="small muted">{w} · lalu {prev}</span></div>
          <div style={{ textAlign: 'right' }}><span className="mini-input r" style={{ minWidth: 80 }}>{now}</span><div className="small muted">{res}</div></div></div>
      ))}</div></div>
      <span className="mini-btn cta">Simpan & buat tagihan · Rp186.000</span>
      <span className="small muted">DATA CONTOH</span>
    </Phone>
  );
}

export function ScrBooking() {
  const B = [['Sinta · Kamar A03', 'BKG-001 · masuk 10 Nov (3 hari lagi) · DP Rp300.000', 'Segera masuk', 'gold'], ['Andi · Kamar B02', 'BKG-002 · masuk 1 Des · tanpa DP', 'Menunggu', 'info']];
  return (
    <Phone tab="Kamar">
      <div className="row between"><Title>Booking kamar</Title><span className="mini-btn primary">+ Booking</span></div>
      <div className="seg"><button className="on">Aktif 2</button><button>Sudah masuk</button><button>Batal</button></div>
      <span className="small muted">Uang tanda jadi yang dipegang: <b>Rp300.000</b></span>
      <div className="panel"><div className="list">{B.map(([t, s, st, tone]) => (
        <div className="li" key={t}><div className="main"><b className="small">{t}</b><span className="small muted">{s}</span></div><span className={'chip ' + tone}>{st}</span></div>
      ))}</div></div>
      <span className="mini-btn cta">Check-in (mulai sewa)</span>
      <span className="small muted">DATA CONTOH</span>
    </Phone>
  );
}

// Business Builder — DATA CONTOH
const KUSTOM_TABS = ['Dashboard', 'Catatan', 'Laporan', 'Builder'];
export function ScrBuilder() {
  return (
    <Phone tab="Builder" tabs={KUSTOM_TABS} name="Bengkel Jaya">
      <div className="row between"><Title>Business Builder</Title><span className="chip gold">Draf</span></div>
      <div className="seg"><button>1. Profil</button><button className="on">2. Data</button><button>3. Alur</button></div>
      <div className="panel">
        <b>🔧 Servis</b><span className="small muted">Nomor SRV-… · judul: Kendaraan · pakai alur status</span>
        <div className="list">{[['Kendaraan *', 'Rujukan → Kendaraan'], ['Keluhan / pekerjaan *', 'Teks panjang'], ['Mekanik', 'Teks singkat'], ['Biaya jasa', 'Uang (Rp)'], ['Sudah dibayar', 'Ya / tidak']].map(([a, b]) => (
          <div className="li" key={a}><div className="main"><b className="small">{a}</b><span className="small muted">{b}</span></div><span className="small muted">↑ ↓</span></div>))}</div>
        <div className="row"><span className="mini-btn sm">+ Field</span><span className="mini-btn sm">Pratinjau formulir</span></div>
      </div>
      <span className="small muted">DATA CONTOH</span>
    </Phone>
  );
}
export function ScrCatatan() {
  const R = [['E 1234 AB', 'SRV-001 · Ganti oli · Asep', 'Dikerjakan', 'gold'], ['E 5678 CD', 'SRV-002 · Rem blong · Ujang', 'Menunggu spare part', 'gold'], ['E 9012 EF', 'SRV-003 · Servis rutin', 'Antre', 'info']];
  return (
    <Phone tab="Catatan" tabs={KUSTOM_TABS} name="Bengkel Jaya">
      <div className="row between"><Title>🔧 Servis</Title><span className="mini-btn primary">+ Servis</span></div>
      <div className="seg"><button className="on">Belum selesai 3</button><button>Antre 1</button><button>Dikerjakan 1</button></div>
      <div className="panel"><div className="list">{R.map(([t, s, st, tone]) => (
        <div className="li" key={t}><div className="main"><b className="small">{t}</b><span className="small muted">{s}</span></div><span className={'chip ' + tone}>{st}</span></div>))}</div></div>
      <span className="small muted">DATA CONTOH</span>
    </Phone>
  );
}

export function ScrLampiran() {
  const T = [['🧾', 'nota-cat.jpg'], ['📷', 'sebelum.jpg'], ['📷', 'sesudah.jpg'], ['📄', 'garansi.pdf']];
  return (
    <Phone tab="Tagihan">
      <Title>KLH-003 · Keran bocor</Title>
      <div className="row"><span className="chip good">Selesai</span><span className="small muted">Kamar A02</span></div>
      <div className="panel">
        <div className="row between"><span className="label">📎 Foto kerusakan / nota (4)</span><span className="mini-btn">+ Foto / file</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>{T.map(([i, n]) => (
          <div key={n} style={{ minWidth: 0 }}><div style={{ aspectRatio: '1', borderRadius: 8, background: 'var(--sunk)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{i}</div>
            <div className="small muted" style={{ fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n}</div></div>
        ))}</div>
        <span className="small muted" style={{ fontSize: 10 }}>Foto (dikecilkan otomatis) atau PDF maks 4 MB, 10 per data. Terpakai 3,2 MB dari 500 MB.</span>
      </div>
      <span className="small muted">DATA CONTOH</span>
    </Phone>
  );
}

export function ScrKonfirmasi() {
  const I = [['Alamat lengkap', 'Jl. Contoh No. 5', 'Disetujui', 'good'], ['Laundry kiloan', 'Rp7.000/kg · estimasi 48 jam', 'Disetujui', 'good'], ['Setrika saja', 'Harga belum diisi', 'Perlu informasi', 'warn'], ['Antar jemput', 'Wilayah, biaya & jadwal belum diisi', 'Perlu informasi', 'warn']];
  return (
    <Phone tab="Konfirmasi" tabs={['Konfirmasi', 'Ringkasan']} name="Laundry Contoh">
      <div className="row between"><Title>Pusat Konfirmasi</Title><span className="chip warn">Perlu informasi</span></div>
      <div className="panel" style={{ gap: 4 }}><span className="small">Kelengkapan data 61%</span><div className="progress"><i style={{ width: '61%' }} /></div><span className="small muted">4 informasi belum diisi</span></div>
      <div className="panel"><div className="list">{I.map(([l, v, st, t]) => (
        <div className="li" key={l}><span className="small"><b>{l}</b><br /><span className="muted">{v}</span></span><span className={'chip ' + t}>{st}</span></div>
      ))}</div></div>
      <span className="mini-btn cta">Tinjau seluruh konfigurasi & aktifkan</span>
      <span className="small muted">DATA CONTOH</span>
    </Phone>
  );
}

export function ScrAntar() {
  const R = [['Ibu Contoh', 'PSN-001 · Laundry kiloan 4 kg', 'Kec. Contoh · Jl. Mawar 3', '08.00–10.00', 'Dijadwalkan'], ['Bapak Contoh', 'PSN-002 · Cuci & setrika 3 kg', 'Perum Contoh · Blok B2', '08.00–10.00', 'Belum dijadwalkan']];
  return (
    <Phone tab="Antar jemput" tabs={['Dashboard', 'Pesanan', 'Antar jemput', 'Laporan']} name="Laundry Contoh">
      <Title>Antar jemput</Title>
      <div className="seg"><button className="on">Jemput (2)</button><button>Antar (1)</button></div>
      <div className="panel"><b className="small">Hari ini (2)</b><div className="list">{R.map(([n, o, a, j, st]) => (
        <div className="li" key={n} style={{ display: 'block' }}><div className="row between"><span className="small"><b>{n}</b> · {o}</span><span className="chip info">{st}</span></div>
          <span className="small">📍 {a} · <u>Peta</u></span><br /><span className="small muted">{j}</span>
          <div className="row" style={{ gap: 4, marginTop: 4 }}><span className="mini-btn">Sudah dijemput</span><span className="mini-btn ghost">Jadwal</span><span className="mini-btn ghost">WA</span></div></div>
      ))}</div></div>
      <span className="small muted">DATA CONTOH</span>
    </Phone>
  );
}

export function ScrDapur() {
  const R = [['Meja 3', 'PSN-014 · 12 mnt', [['2×', 'Nasi goreng', 'pedas sedang'], ['2×', 'Es teh manis', '']], 'Siap saji'], ['🥡 Bungkus', 'PSN-015 · 5 mnt', [['1×', 'Mie ayam', 'tanpa sawi']], 'Siap saji']];
  return (
    <Phone tab="Dapur" tabs={['Dashboard', 'Pesanan', 'Dapur', 'Kas']} name="Warung Contoh">
      <Title>Dapur</Title>
      <span className="small muted">Pesanan terlama di atas.</span>
      <span className="label">Dimasak (2)</span>
      {R.map(([m, n, lines, nx]) => (
        <div className="panel" key={n} style={{ gap: 4 }}>
          <div className="row between"><b>{m}</b><span className="small muted">{n.split(' · ')[1]}</span></div>
          <span className="small muted">{n.split(' · ')[0]}</span>
          {lines.map(([q, x, c]) => <span className="small" key={x}><b>{q}</b> {x}{c ? <span style={{ color: 'var(--gold)' }}> ↳ {c}</span> : null}</span>)}
          <span className="mini-btn">→ {nx}</span>
        </div>
      ))}
      <span className="small muted">DATA CONTOH</span>
    </Phone>
  );
}

export function ScrMeja() {
  const T = [['Meja 1', 'Kosong', ''], ['Meja 2', 'Siap saji', 'good'], ['Meja 3', 'Terisi', 'gold'], ['Meja 4', 'Belum lunas', 'bad'], ['Meja 5', 'Dipesan 19.00', 'info'], ['Meja 6', 'Kosong', '']];
  return (
    <Phone tab="Meja & reservasi" tabs={['Dashboard', 'Pesanan', 'Dapur', 'Kas']} name="Warung Contoh">
      <Title>Meja & reservasi</Title>
      <div className="seg"><button className="on">Meja</button><button>Reservasi (1 baru)</button></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>{T.map(([m, s, c]) => (
        <div key={m} className="panel" style={{ padding: 8, gap: 4, borderColor: c ? `var(--${c})` : undefined }}><b className="small">{m}</b><span className={'chip ' + c} style={{ fontSize: 10 }}>{s}</span></div>
      ))}</div>
      <div className="panel" style={{ gap: 4 }}><b className="small">Meja 3 · sisa Rp 75.000</b>
        <div className="row" style={{ gap: 4 }}><span className="mini-btn ghost">Bayar semua</span><span className="mini-btn">Bagi rata</span><span className="mini-btn ghost">Per item</span></div>
        <span className="small">3 orang · <b>Rp 25.000</b> per orang</span></div>
      <span className="small muted">DATA CONTOH</span>
    </Phone>
  );
}

export function ScrMedia() {
  const C = ['#d9c6a5', '#c8d6df', '#e6dcc9', '#efe7da', '#dfe8e1', '#f1e3d3'];
  const F = ['#7a5c3a', '#3a5a7a', '#556b2f', '#8b4513', '#2f4f4f', '#a0522d'];
  return (
    <Phone tab="Foto & media" tabs={['Beranda', 'Kamar', 'Tagihan', 'Pembayaran']} name="Kos Contoh">
      <Title>Pustaka media</Title>
      <div className="panel" style={{ gap: 4 }}><span className="small">Penyimpanan <b>12 MB</b> dari 50 MB</span><div style={{ height: 5, borderRadius: 9, background: 'var(--line)' }}><div style={{ width: '24%', height: '100%', borderRadius: 9, background: 'var(--gold)' }} /></div></div>
      <div className="seg"><button className="on">Semua (6)</button><button>Kamar (3)</button></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5 }}>{C.map((c, i) => (
        <div key={c} style={{ aspectRatio: '1/1', borderRadius: 8, background: c, position: 'relative', overflow: 'hidden', border: '1px solid var(--line)' }}>
          <div style={{ position: 'absolute', left: '10%', right: '10%', bottom: '10%', height: '35%', background: F[i] }} />
          <span style={{ position: 'absolute', left: 4, top: 4, fontSize: 9, background: 'rgba(15,26,42,.78)', color: '#fff', borderRadius: 9, padding: '1px 5px' }}>{i === 4 ? 'Belum dipakai' : 'Dipakai'}</span>
        </div>
      ))}</div>
      <span className="small muted">DATA CONTOH</span>
    </Phone>
  );
}
