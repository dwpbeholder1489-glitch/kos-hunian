'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Empty, Loading, Sheet } from '@/components/ui';
import { angka, errMsg, rp, tgl } from '@/lib/format';
import { N, round, shiftDay, STOCK_KINDS, labelRange } from './report';
import styles from './laporan.module.css';

export async function reportRows(query) {
  const rows = [];
  const size = 500;
  for (let offset = 0; ; offset += size) {
    const { data, error } = await query().range(offset, offset + size - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < size) return rows;
  }
}

export function reportQuery(table, fields, date, kosId, range) {
  return supabase.from(table).select(fields).eq('kos_id', kosId)
    .gte(date, range.from).lte(date, range.to).order(date, { ascending: false }).order('id');
}

const money = (value) => rp(N(value));
const JOURNAL_SOURCE = { sales: 'sale', returns: 'return', expenses: 'expense', stock: 'stock_move', other: 'cash_entry', purchase: 'purchase', purchaseReturn: 'purchase_return', invoices: 'supplier_invoice' };
const TYPES = {
  sales: 'Nota penjualan', returns: 'Nota retur', expenses: 'Pengeluaran', stock: 'Pergerakan persediaan',
  other: 'Pemasukan lain', journal: 'Baris jurnal', catalog: 'Data barang', product: 'Nota produk',
  purchase: 'Nota pembelian', purchaseReturn: 'Retur pembelian', invoices: 'Faktur supplier', stockJournal: 'Jurnal persediaan',
};

function filterProduct(query, id) {
  return id == null ? query.is('product_id', null) : query.eq('product_id', id);
}

async function loadRows(kosId, range, kind, source, owner) {
  const q = (table, columns, date) => reportQuery(table, columns, date, kosId, range);
  if (kind === 'sales') {
    const data = await reportRows(() => q('sales', 'id,number,sale_date,total,tax_amount,tax_base,discount,cost_total,amt_tunai,amt_transfer,amt_kasbon,branch:branches(name)', 'sale_date').eq('status', source.status || 'selesai'));
    const noCost = source.measure === 'missingCost' ? new Set((await reportRows(() => supabase.from('sale_lines')
      .select('id,sale_id,sale:sales!inner(sale_date,status)').eq('kos_id', kosId).eq('cost', 0)
      .eq('sale.status', 'selesai').gte('sale.sale_date', range.from).lte('sale.sale_date', range.to).order('id'))).map((row) => row.sale_id)) : null;
    const paymentField = { tunai: 'amt_tunai', transfer: 'amt_transfer', kasbon: 'amt_kasbon' }[source.payment];
    return data.filter((row) => (!noCost || noCost.has(row.id))
      && (!paymentField || N(row[paymentField]) !== 0)
      && (!source.branch || (row.branch?.name || 'Lokasi utama') === source.branch))
      .map((row) => {
        const net = N(row.total) - N(row.tax_amount);
        const amounts = {
          discount: N(row.discount), branchGross: N(row.total), hpp: N(row.cost_total), gross: net - N(row.cost_total),
          tax: N(row.tax_amount), dpp: N(row.tax_base) - N(row.tax_amount), nonTaxable: N(row.total) - N(row.tax_base),
        };
        return {
          id: row.id, title: row.number, date: row.sale_date, href: `/struk/${row.id}`,
          amount: paymentField ? N(row[paymentField]) : amounts[source.measure] ?? net,
          note: `Diskon ${money(row.discount)} · PPN ${money(row.tax_amount)} · HPP ${money(row.cost_total)}`,
        };
      });

  }
  if (kind === 'returns') {
    const data = await reportRows(() => q('sale_returns', 'id,sale_id,number,return_date,total,tax_amount,cost_total,reason', 'return_date'));
    return data.map((row) => {
      const net = N(row.total) - N(row.tax_amount);
      const amounts = { hpp: N(row.cost_total), grossReturn: N(row.total), gross: net - N(row.cost_total), tax: N(row.tax_amount) };
      return { id: row.id, title: row.number, date: row.return_date, href: row.sale_id ? `/struk/${row.sale_id}` : null,
        amount: -(amounts[source.measure] ?? net), note: row.reason };
    });
  }
  if (kind === 'expenses') {
    const data = await reportRows(() => { const query = q('expenses', 'id,date,amount,description,category:expense_categories(name)', 'date'); return source.measure === 'capital' ? query.neq('kind', 'operasional') : query.eq('kind', 'operasional'); });
    return data.filter((row) => !source.category || (row.category?.name || 'Lainnya') === source.category)
      .map((row) => ({ id: row.id, title: row.description || row.category?.name || 'Pengeluaran', date: row.date, amount: N(row.amount), note: row.category?.name || 'Lainnya' }));
  }
  if (kind === 'purchase' || kind === 'purchaseReturn') {
    const returns = kind === 'purchaseReturn';
    const date = returns ? 'return_date' : 'purchase_date';
    const data = await reportRows(() => {
      const query = q(returns ? 'purchase_returns' : 'purchases', `id,number,${date},total`, date);
      return returns ? query : query.in('status', ['selesai', 'sebagian']);
    });
    return data.map((row) => ({ id: row.id, date: row[date], title: row.number, amount: N(row.total) * (returns ? -1 : 1) }));
  }
  if (kind === 'invoices') {
    const data = await reportRows(() => q('supplier_invoices', 'id,number,invoice_date,tax_amount,subtotal,tax_no', 'invoice_date')
      .eq('status', 'diposting').gt('tax_amount', 0));
    return data.map((row) => ({ id: row.id, title: row.number, date: row.invoice_date, amount: N(row.tax_amount),
      note: `DPP ${money(row.subtotal)}${row.tax_no ? ' · ' + row.tax_no : ''}` }));
  }
  if (kind === 'other') {
    const data = await reportRows(() => q('cash_entries', 'id,date,amount,description', 'date').eq('kind', source.cashKind || 'pendapatan_lain'));
    return data.map((row) => ({ ...row, title: row.description || source.title }));
  }
  if (kind === 'stock') {
    const [moves, corrections] = await Promise.all([
      reportRows(() => supabase.from('stock_moves').select('id,created_at,value,delta,kind,note,product:products(name)').eq('kos_id', kosId)
        .gte('created_at', range.from + 'T00:00:00+07:00').lt('created_at', shiftDay(range.to, 1) + 'T00:00:00+07:00').in('kind', source.stockKinds || STOCK_KINDS).order('created_at', { ascending: false }).order('id')),
      owner ? reportRows(() => q('stock_opening_corrections', 'id,opname_id,reason', 'entry_date')) : [],
    ]);
    const excluded = new Map(corrections.map((row) => [row.opname_id, row.reason]));
    return moves.map((row) => ({
      id: row.id, date: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jakarta', dateStyle: 'short' }).format(new Date(row.created_at)),
      title: row.product?.name || 'Barang', amount: N(row.value), note: `${row.kind} · ${angka(row.delta)} unit${row.note ? ' · ' + row.note : ''}`,
      excluded: excluded.has(row.id) ? excluded.get(row.id) || 'Koreksi saldo awal' : null,
    }));
  }
  if (kind === 'catalog') {
    const { data, error } = await supabase.from('products').select('id,name,stock,cost,base_unit').eq('kos_id', kosId).eq('id', source.productId).maybeSingle();
    if (error) throw error;
    return data ? [{ id: data.id, title: data.name, amount: round(N(data.stock) * N(data.cost)), note: `Stok saat ini ${angka(data.stock)} ${data.base_unit} · HPP unit ${money(data.cost)}` }] : [];
  }
  if (kind === 'product') {
    const [sales, returns] = await Promise.all([
      reportRows(() => filterProduct(supabase.from('sale_lines').select('id,name,qty,unit,unit_qty,cost,line_total,tax_amount,sale:sales!inner(id,number,sale_date,status,subtotal,total)')
        .eq('kos_id', kosId).eq('sale.status', 'selesai').gte('sale.sale_date', range.from).lte('sale.sale_date', range.to).order('id'), source.productId)),
      reportRows(() => filterProduct(supabase.from('sale_return_lines').select('id,name,qty,unit,unit_qty,cost,amount,ret:sale_returns!inner(id,sale_id,number,return_date,kos_id)')
        .eq('ret.kos_id', kosId).gte('ret.return_date', range.from).lte('ret.return_date', range.to).order('id'), source.productId)),
    ]);
    return [
      ...sales.map((row) => ({ id: row.id, date: row.sale.sale_date, title: row.sale.number, href: `/struk/${row.sale.id}`, amount: round(N(row.line_total) * (N(row.sale.subtotal) > 0 ? N(row.sale.total) / N(row.sale.subtotal) : 1) - N(row.tax_amount) - (source.measure === 'laba' ? N(row.cost) * N(row.qty) * N(row.unit_qty) : 0)),
        note: `${angka(row.qty)} ${row.unit} · HPP ${money(N(row.cost) * N(row.qty) * N(row.unit_qty))}` })),
      ...returns.map((row) => ({ id: row.id, date: row.ret.return_date, title: row.ret.number, href: row.ret.sale_id ? `/struk/${row.ret.sale_id}` : null, amount: round(-N(row.amount) + (source.measure === 'laba' ? N(row.cost) * N(row.qty) * N(row.unit_qty) : 0)), note: `Retur · ${angka(row.qty)} ${row.unit}` })),
    ].sort((a, b) => b.date.localeCompare(a.date));
  }
  const { error } = await supabase.rpc('acct_sync', { p_kos: kosId });
  if (error) throw error;
  const data = await reportRows(() => {
    const query = supabase.from('acct_lines')
      .select('id,debit,credit,source_type,source_id,account:acct_accounts!inner(name,type,sys_key),entry:acct_entries!inner(number,description,kind,entry_date)')
      .eq('kos_id', kosId).order('id', { ascending: false });
    if (source.origin) return query.eq('source_type', source.origin.type).eq('source_id', source.origin.id);
    return query.in('account.type', ['pendapatan', 'beban']).gte('entry.entry_date', range.from).lte('entry.entry_date', range.to);
  });
  return data.filter((row) => kind === 'stockJournal' ? row.account.sys_key === 'selisih_persediaan' :
    source.measure === 'hpp' ? row.account.sys_key === 'hpp' :
    source.measure === 'expense' ? row.account.type === 'beban' && row.account.sys_key !== 'hpp' : true)
    .map((row) => ({ id: row.id, title: `${row.entry.number} · ${row.account.name}`, date: row.entry.entry_date,
      note: `${row.entry.description} · Debit ${money(row.debit)} · Kredit ${money(row.credit)}`,
      amount: N(row.credit) - N(row.debit), href: row.source_type === 'sale' && row.source_id ? `/struk/${row.source_id}` : null }));
}

export function ReportSource({ kosId, range, source, owner, onChange, onClose }) {
  const [kind, setKind] = useState(source.kinds[0]);
  const [result, setResult] = useState(null);
  const [limit, setLimit] = useState(20);
  useEffect(() => {
    let active = true;
    setResult(null);
    loadRows(kosId, range, kind, source, owner).then((data) => { if (active) setResult({ data }); }, (error) => { if (active) setResult({ error }); });
    return () => { active = false; };
  }, [kosId, range.from, range.to, kind, source, owner]);
  const journalNet = round((result?.data || []).reduce((sum, row) => sum + row.amount, 0));
  return <Sheet title={source.title} onClose={onClose}>
    <p className={styles.muted}>{labelRange(range)}</p>
    {source.amount != null && <strong className={styles.sourceValue}>{rp(source.amount)}</strong>}
    {source.back && <button onClick={() => onChange(source.back)}>Kembali ke sumber laporan</button>}
    {source.compare && <button onClick={() => onChange(source.compare)}>Telusuri periode pembanding</button>}
    {source.explanation && <p>{source.explanation}</p>}
    {source.bridge && <div className={styles.sourceList}>{source.bridge.map(([label, amount, key]) => <button key={key} onClick={() => { setLimit(20); setKind(key); }}><span>{label}</span><b>{rp(amount)}</b></button>)}</div>}
    <div className={styles.controls} role="group" aria-label="Sumber laporan">{source.kinds.map((key) => <button key={key} aria-pressed={key === kind} onClick={() => { setLimit(20); setKind(key); }}>{TYPES[key]}</button>)}</div>
    {kind === 'stock' && !owner && <p className="small muted">Daftar memuat mutasi fisik. Buka jurnal persediaan untuk melihat nilai yang masuk laba rugi.</p>}
    {kind === 'product' && <p className="small muted">Rincian mengikuti alokasi diskon dan PPN pada laporan produk. Pembulatan per baris dapat menimbulkan selisih kecil.</p>}
    {!result ? <Loading /> : result.error ? <p role="alert" className="notice bad">{errMsg(result.error)}</p> :
      result.data.length === 0 ? <Empty title="Belum ada catatan untuk periode ini" /> :
        <div className={styles.sourceList}>{result.data.slice(0, limit).map((row) => <article key={row.id}>
          <div><b>{row.title}</b><strong>{rp(row.amount)}</strong></div>
          <small>{row.date ? tgl(row.date) + ' · ' : ''}{row.note || ''}</small>
          {row.excluded && <small>Koreksi saldo awal, dikecualikan dari laba rugi · {row.excluded}</small>}
          <div className={styles.sourceActions}>
            {row.href && <Link href={row.href}>Buka nota penjualan</Link>}
            {JOURNAL_SOURCE[kind] && <button onClick={() => onChange({ title: `Jurnal · ${row.title}`, kinds: ['journal'], range,
              origin: { type: JOURNAL_SOURCE[kind], id: row.id }, back: source,
              explanation: 'Termasuk posting dan koreksi untuk catatan ini, sesuai tanggal jurnal masing-masing.' })}>Lihat jurnal terkait</button>}
          </div>
        </article>)}</div>}
    {result?.data && kind === 'journal' && source.reconcile && <p className="notice">Laba dari jurnal {rp(journalNet)} · Selisih terhadap laba Laporan Toko {rp(round(journalNet - source.reconcile.net))}. Pembukuan mencakup jurnal manual, koreksi, serta akun pendapatan dan beban lain.</p>}
    {result?.data?.length > limit && <button onClick={() => setLimit(limit + 20)}>Tampilkan lebih banyak</button>}
    {['journal', 'stockJournal'].includes(kind) && <Link href="/pembukuan">Buka Pembukuan</Link>}
  </Sheet>;
}
