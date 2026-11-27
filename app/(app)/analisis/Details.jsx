'use client';
// Drill-down Analisis Bisnis: setiap angka → lembar rincian berisi rumus, pembanding, baris jurnal sumber, dan tautan ke bukti transaksi
// (struk/nota/kwitansi lewat lib/journalSource) atau modul terkait. Data jurnal dibaca langsung (RLS acct_lines = anggota keuangan).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Loading, Sheet } from '@/components/ui';
import { errMsg, rp, tgl } from '@/lib/format';
import { SRC, srcHref } from '@/lib/journalSource';
import styles from './analisis.module.css';

const n = (v) => Number(v || 0);
const MAX = 3000;

// kinds: 'pendapatan' | 'hpp' | 'biaya' | 'kas' — baris jurnal yang membentuk angka itu.
// sys (opsional, dipakai Rekap Bisnis): daftar sys_key akun (piutang, utang, modal, prive, ppn_keluaran, …) — nilai bertanda alami akun
async function journal(kosId, from, to, kinds, sys) {
  const cash = kinds.includes('kas');
  const rows = [];
  for (let off = 0; off < MAX; off += 500) {
    let q = supabase.from('acct_lines')
      .select('id,debit,credit,source_type,source_id,memo,account:acct_accounts!inner(name,type,sys_key),entry:acct_entries!inner(id,number,entry_date,description,kind,source_type,source_id)')
      .eq('kos_id', kosId).gte('entry.entry_date', from).lte('entry.entry_date', to).order('id', { ascending: false }).range(off, off + 499);
    q = sys ? q.in('account.sys_key', sys) : cash ? q.in('account.sys_key', ['kas', 'bank']) : q.in('account.type', ['pendapatan', 'beban']);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) break;
  }
  const kind = (l) => (l.account.type === 'pendapatan' ? 'pendapatan' : l.account.sys_key === 'hpp' ? 'hpp' : 'biaya');
  const lines = cash || sys ? rows : rows.filter((l) => kinds.includes(kind(l)));
  const signed = (l) => (cash ? n(l.debit) - n(l.credit) : (n(l.debit) - n(l.credit)) * (['aset', 'beban'].includes(l.account.type) ? 1 : -1));
  return { lines: lines.map((l) => ({ ...l, value: signed(l) })).sort((a, b) => b.entry.entry_date.localeCompare(a.entry.entry_date) || b.id - a.id), capped: rows.length >= MAX };
}

export function JournalLines({ kosId, from, to, kinds = [], sys, retail, account, accounts, branchNote }) {
  const [st, setSt] = useState(null);
  const [limit, setLimit] = useState(20);
  const [sort, setSort] = useState('tanggal');
  useEffect(() => {
    let on = true; setSt(null);
    journal(kosId, from, to, kinds, sys).then((r) => on && setSt(r), (e) => on && setSt({ error: e }));
    return () => { on = false; };
  }, [kosId, from, to, kinds.join(), (sys || []).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!st) return <Loading rows={4} />;
  if (st.error) return <p className="notice bad" role="alert">{errMsg(st.error)}</p>;
  let lines = account ? st.lines.filter((l) => l.account.name === account) : accounts ? st.lines.filter((l) => accounts.includes(l.account.name)) : st.lines;
  if (sort === 'nilai') lines = [...lines].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  // Campuran pendapatan & beban (laba, EBITDA): jumlah = pendapatan − beban agar sama dengan angka di atas
  const mixed = lines.some((l) => l.account.type === 'pendapatan') && lines.some((l) => l.account.type === 'beban');
  const total = lines.reduce((t, l) => t + (mixed && l.account.type === 'beban' ? -l.value : l.value), 0);
  return <div className={styles.jl}>
    <div className={styles.jlHead}><b>{lines.length.toLocaleString('id-ID')} baris jurnal · {mixed ? 'pendapatan − beban' : 'jumlah'} {rp(total)}</b>
      <label>Urut <select value={sort} onChange={(e) => setSort(e.target.value)}><option value="tanggal">Terbaru</option><option value="nilai">Nilai terbesar</option></select></label></div>
    {branchNote && <p className={styles.note}>{branchNote}</p>}
    {st.capped && <p className={styles.note}>Menampilkan {MAX.toLocaleString('id-ID')} baris terbaru. Persempit periode untuk melihat semuanya.</p>}
    {lines.length === 0 ? <p className="muted small">Belum ada baris jurnal pada periode ini.</p> : <ul className={styles.rows}>
      {lines.slice(0, limit).map((l) => { const t = l.source_type || l.entry.source_type; const id = l.source_id || l.entry.source_id; const href = id && srcHref(t, id, retail);
        return <li key={l.id}><div><b>{l.entry.description || l.account.name}</b>
          <small>{tgl(l.entry.entry_date)} · {l.entry.number} · {l.account.name}{l.entry.kind === 'koreksi' ? ' · koreksi' : ''}</small>
          <small>Debit {rp(l.debit)} · Kredit {rp(l.credit)}{href ? <> · <Link href={href}>Bukti {SRC[t]?.toLowerCase() || 'transaksi'}</Link></> : t ? ` · ${SRC[t] || t}` : ' · jurnal manual'}</small></div>
          <span className={l.value < 0 ? styles.neg : undefined}>{rp(l.value)}</span></li>; })}
    </ul>}
    {lines.length > limit && <button type="button" onClick={() => setLimit(limit + 30)}>Tampilkan lebih banyak</button>}
    <Link className={styles.more} href={`/pembukuan?tab=jurnal&bulan=${to.slice(0, 7)}`}>Buka Jurnal di Pembukuan</Link>
  </div>;
}

// Lembar rincian standar. rows = [[label, nilai, catatan?]]; links = [[href, label]]
export function DetailSheet({ title, value, sub, formula, rows, children, links, onClose }) {
  return <Sheet title={title} onClose={onClose}>
    <div className={styles.sheet}>
      {value != null && <strong className={styles.big}>{value}</strong>}
      {sub && <p className={styles.note}>{sub}</p>}
      {formula && <p className={styles.formula}><b>Cara hitung:</b> {formula}</p>}
      {rows?.length > 0 && <dl className={styles.kvs}>{rows.filter(Boolean).map(([k, v, c]) => <div key={k}><dt>{k}{c && <small>{c}</small>}</dt><dd>{v}</dd></div>)}</dl>}
      {children}
      {links?.length > 0 && <div className={styles.links}>{links.filter(Boolean).map(([h, l]) => <Link key={h + l} href={h}>{l}</Link>)}</div>}
    </div>
  </Sheet>;
}
