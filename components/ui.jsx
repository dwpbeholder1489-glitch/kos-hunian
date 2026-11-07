'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { PAY_ST } from '@/lib/format';

export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const el = (
    <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between"><h2>{title}</h2><button className="ghost" onClick={onClose}>Tutup</button></div>
        {children}
      </div>
    </div>
  );
  // Dirender di <body> agar tidak terkurung lapisan header/menu (mis. lembar dari tombol di header tertutup menu bawah)
  return typeof document === 'undefined' ? el : createPortal(el, document.body);
}

let toastSet = null;
export function toast(m) { toastSet && toastSet(m); }
export function Toaster() {
  const [m, setM] = useState(null);
  useEffect(() => {
    toastSet = (x) => { setM(x); clearTimeout(toastSet.h); toastSet.h = setTimeout(() => setM(null), 3200); };
    return () => { toastSet = null; };
  }, []);
  return m ? <div className="toast" role="status">{m}</div> : null;
}

export function Field({ label, hint, children }) {
  return <label className="f">{label}{children}{hint && <span className="hint">{hint}</span>}</label>;
}

export function Tile({ label, value, sub, tone }) {
  return <div className={'tile ' + (tone || '')}><span className="label">{label}</span><span className="v">{value}</span>{sub && <span className="s">{sub}</span>}</div>;
}

export function Empty({ title, text, children }) {
  return <div className="empty"><h3>{title}</h3>{text && <p className="muted" style={{ margin: 0 }}>{text}</p>}{children}</div>;
}

export function Loading() {
  return <p className="muted">Memuat…</p>;
}

export function InvChip({ inv }) {
  if (!inv) return null;
  if (inv.pay_state === 'lunas') return <span className="chip good">Lunas</span>;
  if (inv.pay_state === 'batal') return <span className="chip void">Dibatalkan</span>;
  if (inv.overdue) return <span className="chip bad">{inv.pay_state === 'sebagian' ? 'Sebagian · menunggak' : 'Menunggak'}</span>;
  return inv.pay_state === 'sebagian' ? <span className="chip gold">Dibayar sebagian</span> : <span className="chip info">Belum bayar</span>;
}

export function PayChip({ status }) {
  const s = PAY_ST[status] || [status, 'void'];
  return <span className={'chip ' + s[1]}>{s[0]}</span>;
}

// Jalankan aksi tulis; tampilkan toast; kembalikan true kalau berhasil
export async function run(fn, okMsg, errMsg) {
  try {
    const r = await fn();
    if (r && r.error) throw r.error;
    if (okMsg) toast(okMsg);
    return true;
  } catch (e) {
    toast(errMsg ? errMsg(e) : (e?.message || 'Gagal menyimpan'));
    return false;
  }
}
