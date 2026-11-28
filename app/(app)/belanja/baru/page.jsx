'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useKos } from '@/components/KosProvider';
import { Empty, Loading, toast } from '@/components/ui';
import { pathAllowed } from '@/lib/business';
import { errMsg, rp } from '@/lib/format';
import { clearPurchasePrefill, loadPurchaseCatalog, readPurchasePrefill, storePurchasePrefill } from '../purchase-data';
import PurchaseForm from './PurchaseForm';

export default function NewPurchase() {
  const { kosId, ver, kos } = useKos();
  const params = useSearchParams();
  const draft = params.get('draf');
  const previous = params.get('bulan');
  const newlyAdded = params.get('barang');
  return kosId ? <Workspace key={`${kosId}:${draft || ''}`} kosId={kosId} ver={ver} kos={kos} newlyAdded={newlyAdded} draft={draft} previous={previous} /> : <Loading />;
}

function Workspace({ kosId, ver, kos, newlyAdded, draft, previous }) {
  const router = useRouter();
  const [state, setState] = useState(null);
  const [init, setInit] = useState(undefined);
  useEffect(() => setInit(draft ? readPurchasePrefill(kosId, draft) : null), [kosId, draft]);
  useEffect(() => {
    let active = true;
    loadPurchaseCatalog(kosId, { picker:true }).then((data) => { if (active) setState({ data }); }, (error) => { if (active) setState({ error }); });
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

  return <PurchaseForm kosId={kosId} kos={kos} version={ver} d={state.data} init={init}
    initialSearch={state.data.products.find((p) => p.id === newlyAdded)?.name}
    onNewProduct={pathAllowed(kos,'/barang') ? (snapshot) => {
      try {
        const key = storePurchasePrefill(kosId,snapshot);
        router.push('/barang?' + new URLSearchParams({ baru:'1', belanja:key, ...(back.has('bulan') ? { bulan:back.get('bulan') } : {}) }));
      } catch { toast('Tidak bisa menyimpan draf pembelian di sesi ini.'); }
    } : null}
    onClose={() => { clearPurchasePrefill(kosId, draft); router.push(backHref); }}
    onSaved={(result, date, order) => {
      clearPurchasePrefill(kosId, draft);
      toast(order ? `Pesanan ${result.number} tersimpan · stok bertambah saat diterima` : `${result.number} tersimpan · ${rp(result.total)}`);
      router.replace(`/belanja?bulan=${date.slice(0, 7)}`);
    }} />;
}
