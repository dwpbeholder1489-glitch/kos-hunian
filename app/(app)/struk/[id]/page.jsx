'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Loading, Empty, Sheet, toast } from '@/components/ui';
import NavIcon from '@/components/NavIcon';
import { waLink, errMsg } from '@/lib/format';
import { PrintReceiptButton, PrinterSettingsForm } from '@/components/PrinterManager';
import { printerSettings } from '@/lib/printer';
import { printLines } from '@/lib/printer-format.mjs';
import { downloadReceiptPdf } from '@/lib/receipt-pdf';
import { receiptImage, downloadReceiptFile, PORTAL_TITLE, PORTAL_HINT } from '@/lib/receipt-image';
import { qrSvg } from '@/lib/qr';
import { strukText } from '@/lib/struk';

export default function Struk() {
  const { id } = useParams();
  const { kos } = useKos();
  const [d, setD] = useState(null);
  useEffect(() => {
    let active = true;
    supabase.rpc('sale_detail', { p_sale: id }).then(({ data, error }) => {
      if (active) setD({ id, data, error });
    });
    return () => { active = false; };
  }, [id]);
  if (!kos || d?.id !== id) return <Loading />;
  if (d.error && !/tidak ditemukan/i.test(d.error.message)) return <div className="notice bad">{errMsg(d.error)}</div>;
  if (!d.data?.sale || d.data.sale.kos_id !== kos.id) return <Empty title="Struk tidak ditemukan" />;
  return <Receipt key={id} kos={kos} sale={d.data.sale} lines={d.data.lines || []} contact={d.data.contact} />;
}

function Receipt({ kos, sale, lines, contact }) {
  const [paper, setPaper] = useState(() => printerSettings(kos.id).paper === '80' ? '80' : '58');
  const [portal, setPortal] = useState('');
  const [image, setImage] = useState(null);
  const [imageError, setImageError] = useState('');
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const renderText = (size) => strukText(kos, sale, lines, contact, size);
  const text = printLines(renderText(paper), paper === '80' ? 48 : 32).join('\n');
  const cancelled = sale.status === 'batal';
  const shareText = portal ? text + '\n\n' + PORTAL_TITLE + '\n' + PORTAL_HINT + '\n' + portal : text;
  const whatsapp = '```\n' + text + '\n```' + (portal ? '\n\n' + PORTAL_TITLE + '\n' + PORTAL_HINT + '\n' + portal : '');

  useEffect(() => {
    let active = true;
    supabase.rpc('share_info', { p_kos: kos.id }).then(({ data }) => {
      if (active && data?.live && data.slug) {
        setPortal(new URL('/b/' + encodeURIComponent(data.slug), window.location.origin).href);
      }
    });
    return () => { active = false; };
  }, [kos.id]);

  const imageKey = JSON.stringify([text, sale.number, paper, portal]);
  useEffect(() => {
    if (!sharing) return;
    let active = true;
    setImageError('');
    receiptImage(text, sale.number, paper, portal).then((file) => {
      if (active) setImage({ key: imageKey, file });
    }).catch((error) => {
      if (active) setImageError(errMsg(error));
    });
    return () => { active = false; };
  }, [sharing, imageKey, text, sale.number, paper, portal]);

  async function shareImage() {
    if (image?.key !== imageKey) return;
    const files = [image.file];
    try {
      if (navigator.canShare?.({ files })) {
        await navigator.share({ files });
        setSharing(false);
        return;
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
    downloadReceiptFile(image.file);
    toast('Gambar diunduh. Anda bisa mengirimnya dari aplikasi pilihan.');
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setSharing(false);
      toast('Struk disalin. Tempel di mode Plain aplikasi printer.');
    } catch {
      setSharing(false);
      toast('Tekan lama pada teks struk untuk menyalinnya.');
    }
  }

  async function download() {
    setDownloading(true);
    try { await downloadReceiptPdf(text, sale.number, paper, portal); }
    catch (error) { toast('PDF gagal dibuat: ' + errMsg(error)); }
    finally { setDownloading(false); }
  }

  async function share() {
    try {
      await navigator.share({ title: 'Struk ' + sale.number, text: shareText });
      setSharing(false);
    }
    catch (error) { if (error.name !== 'AbortError') toast('Struk gagal dibagikan.'); }
  }

  return <div className="receipt-page stack">
    <div className="receipt-heading noprint">
      <h2>Struk</h2>
      <span className={'chip ' + (cancelled ? 'bad' : 'good')}>
        <NavIcon name={cancelled ? 'info' : 'done'} size={15} />
        {cancelled ? 'Transaksi dibatalkan' : 'Transaksi selesai'}
      </span>
      <Link href="/penjualan" className="small">← Penjualan</Link>
    </div>
    <div className="receipt-preview" data-paper={paper}>
      <pre>{text.split('\n').map((line, index) => <span key={index} className={index === 0 || /^TOTAL\s/.test(line) ? 'receipt-emphasis' : undefined}>{line || ' '}{'\n'}</span>)}</pre>
      {portal && <div className="receipt-portal">
        <strong>{PORTAL_TITLE}</strong>
        <div className="receipt-qr" role="img" aria-label="Kode QR portal bisnis" dangerouslySetInnerHTML={{ __html: qrSvg(portal) }} />
        <a href={portal} target="_blank" rel="noreferrer">{PORTAL_HINT}</a>
      </div>}
    </div>
    <div className="receipt-actions noprint">
      <PrintReceiptButton kosId={kos.id} renderText={renderText} portal={portal}><NavIcon name="print" size={20} />Cetak ulang</PrintReceiptButton>
      <a href={contact?.phone ? waLink(contact.phone, whatsapp) : `https://wa.me/?text=${encodeURIComponent(whatsapp)}`} target="_blank" rel="noreferrer">
        <NavIcon name="message" size={20} />Kirim via WhatsApp
      </a>
      <button type="button" onClick={() => setSharing(true)}><NavIcon name="upload" size={20} />Bagikan</button>
    </div>
    <details className="receipt-settings noprint" open>
      <summary><NavIcon name="print" size={20} />Pengaturan cetak<NavIcon name="down" size={18} /></summary>
      <div className="receipt-settings-body">
        <PrinterSettingsForm kosId={kos.id} receipt onSaved={(settings) => setPaper(settings.paper === '80' ? '80' : '58')} />
      </div>
    </details>
    <Link href="/kasir" className="receipt-new noprint"><NavIcon name="cart" size={22} />Transaksi baru</Link>
    {sharing && <Sheet title="Bagikan struk" onClose={() => setSharing(false)}>
      {typeof navigator.share === 'function' && <button type="button" onClick={share}>Bagikan teks</button>}
      <button type="button" onClick={shareImage} disabled={image?.key !== imageKey}>
        {image?.key === imageKey || imageError ? 'Bagikan sebagai gambar' : 'Menyiapkan gambar…'}
      </button>
      {imageError && <p role="status" className="small muted">{imageError}</p>}
      <button type="button" onClick={copy}>Salin struk {paper} mm</button>
      <button type="button" onClick={download} disabled={downloading}>{downloading ? 'Menyiapkan PDF…' : 'Unduh PDF'}</button>
    </Sheet>}
  </div>;
}
