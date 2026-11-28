import Link from 'next/link';
import NavIcon from '@/components/NavIcon';
import { Sheet } from '@/components/ui';
import css from './billing-menu.module.css';

const sections = [
  ['Penagihan', '/tagihan', [
    ['/tagihan', 'Tagihan', 'Kelola tagihan sewa dan tagihan tambahan', '/tagihan'],
    ['/tagihan?baru=tambahan', 'Tagihan Tambahan', 'Buat tagihan listrik, air, denda, dan lainnya', 'credit'],
    ['/penghuni?tunggakan=1', 'Pengingat Tagihan', 'Tinjau tunggakan dan siapkan pengingat penghuni', 'bell'],
  ]],
  ['Penerimaan Pembayaran', 'wallet', [
    ['/pembayaran', 'Pembayaran', 'Kelola riwayat pembayaran penghuni', '/pembayaran'],
    ['/pembayaran?tampilan=verifikasi', 'Verifikasi Pembayaran', 'Periksa bukti pembayaran dari penghuni', 'done'],
    ['/pembayaran?tampilan=kwitansi', 'Kuitansi & Bukti Bayar', 'Temukan kuitansi pembayaran terverifikasi', '/catatan'],
  ]],
  ['Laporan & Rekap', '/laporan', [
    ['/rekap', 'Rekap Tagihan & Pembayaran', 'Ringkasan tagihan, pembayaran, dan tunggakan', '/laporan'],
    ['/laporan#penerimaan', 'Laporan Penerimaan', 'Lihat penerimaan per periode dan kamar', 'coins'],
  ]],
];

export default function BillingMenu({ has, onClose }) {
  return <Sheet title="Tagihan & Pembayaran" icon="/layanan" wide onClose={onClose}>
    <nav className={css.menu} aria-label="Menu Tagihan & Pembayaran">
      {sections.map(([title, icon, items]) => {
        const available = items.filter(([href]) => has(href.split(/[?#]/)[0]));
        if (!available.length) return null;
        return <section key={title}>
          <h3><NavIcon name={icon} size={20} />{title}</h3>
          <ul>{available.map(([href, name, description, itemIcon]) => <li key={href}>
            <Link href={href} onClick={onClose}>
              <span className={css.icon}><NavIcon name={itemIcon} size={23} /></span>
              <span className={css.copy}><b>{name}</b><small>{description}</small></span>
              <NavIcon name="next" size={17} />
            </Link>
          </li>)}</ul>
        </section>;
      })}
    </nav>
  </Sheet>;
}
