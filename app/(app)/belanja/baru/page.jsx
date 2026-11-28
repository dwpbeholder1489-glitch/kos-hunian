'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useKos } from '@/components/KosProvider';
import { Empty, Loading, toast } from '@/components/ui';
import { errMsg, rp } from '@/lib/format';
import { clearPurchasePrefill, loadPurchaseCatalog, readPurchasePrefill } from '../purchase-data';
import PurchaseForm from './PurchaseForm';

export default function NewPurchase() {
  const { kosId, ver } = useKos();
  const params = useSearchParams();
  const draft = params.get('draf');
  const previous = params.get('bulan');
  return kosId ? <Workspace key={`${kosId}:${draft || ''}`} kosId={kosId} ver={ver} draft={draft} previous={previous} /> : <Loading />;
}

function Workspace({ kosId, ver, draft, previous }) {
  const router = useRouter();
  const [state, setState] = useState(null);
  const [init, setInit] = useState(undefined);
  useEffect(() => setInit(draft ? readPurchasePrefill(kosId, draft) : null), [kosId, draft]);
  useEffect(() => {
    let active = true;
    loadPurchaseCatalog(kosId).then((data) => { if (active) setState({ data }); }, (error) => { if (active) setState({ error }); });
    return () => { active = false; };
  }, [kosId, ver]);
  const back = new URLSearchParams();
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(previous || '')) back.set('bulan', previous);
  if (init?.request) back.set('tab', 'permintaan');
  const query = back.toString();
  const backHref = '/belanja' + (query ? '?' + query : '');
  if (!state || init === undefined) return <Loading />;
  if (state.error) return <div className="notice bad" role="alert">{errMsg(state.error)} <Link href={backHref}>Kembali ke Belanja</Link></div>;
  if (draft && !init) return <Empty title="Draf belanja tidak ditemukan" text="Buka kembali saran atau permintaan dari halaman Belanja."><Link href={backHref}>Kembali ke Belanja</Link></Empty>;
  if (!state.data.products.length && !init) return <Empty title="Belum ada barang untuk dibeli" text="Tambahkan barang dan satuannya sebelum mencatat belanja."><Link href="/barang">Buka Barang &amp; Stok</Link><Link href={backHref}>Kembali ke Belanja</Link></Empty>;
  return <PurchaseForm kosId={kosId} d={state.data} init={init}
    onClose={() => { clearPurchasePrefill(kosId, draft); router.push(backHref); }}
    onSaved={(result, date, order) => {
      clearPurchasePrefill(kosId, draft);
      toast(order ? `Pesanan ${result.number} tersimpan · stok bertambah saat diterima` : `${result.number} tersimpan · ${rp(result.total)}`);
      router.replace(`/belanja?bulan=${date.slice(0, 7)}`);
    }} />;
}
