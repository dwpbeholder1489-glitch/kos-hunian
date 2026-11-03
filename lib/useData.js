'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';

const generated = new Set();

// Memuat seluruh data kos yang sedang dipilih. Dipanggil ulang setiap ada perubahan (bump()).
export function useData() {
  const { kosId, ver } = useKos();
  const [raw, setRaw] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!kosId) return;
    let alive = true;
    (async () => {
      try {
        // buat tagihan sewa yang sudah waktunya terbit (sekali per sesi per kos)
        if (!generated.has(kosId)) { generated.add(kosId); await supabase.rpc('generate_invoices', { p_kos: kosId, p_days_ahead: 7 }); }
        const q = (t, cols = '*') => supabase.from(t).select(cols).eq('kos_id', kosId);
        const res = await Promise.all([
          q('rooms').order('code'),
          q('occupants').order('name'),
          q('leases').order('start_date', { ascending: false }),
          q('invoice_summary').order('due_date', { ascending: false }),
          q('payments').order('paid_at', { ascending: false }),
          q('expense_categories').order('name'),
          q('expenses').order('date', { ascending: false }),
        ]);
        const bad = res.find((r) => r.error);
        if (bad) throw bad.error;
        if (alive) {
          const [rooms, occupants, leases, invoices, payments, categories, expenses] = res.map((r) => r.data);
          setRaw({ rooms, occupants, leases, invoices, payments, categories, expenses });
          setErr(null);
        }
      } catch (e) { if (alive) setErr(e.message || 'Gagal memuat data'); }
    })();
    return () => { alive = false; };
  }, [kosId, ver]);

  return useMemo(() => {
    if (!raw) return { ready: false, err };
    const num = (x) => Number(x) || 0;
    const fix = (a, keys) => a.map((r) => { const o = { ...r }; for (const k of keys) if (o[k] != null) o[k] = num(o[k]); return o; });
    const rooms = fix(raw.rooms, ['rent']);
    const leases = fix(raw.leases, ['rent']);
    const invoices = fix(raw.invoices, ['amount', 'paid', 'pending', 'outstanding']);
    const payments = fix(raw.payments, ['amount']);
    const expenses = fix(raw.expenses, ['amount']);
    const by = (a) => new Map(a.map((x) => [x.id, x]));
    const roomById = by(rooms), occById = by(raw.occupants), invById = by(invoices), catById = by(raw.categories);
    const activeByRoom = new Map(), activeByOcc = new Map();
    for (const l of leases) if (l.status === 'aktif') { activeByRoom.set(l.room_id, l); activeByOcc.set(l.occupant_id, l); }
    const outByOcc = new Map();
    for (const i of invoices) if (i.outstanding > 0 && i.status !== 'batal') outByOcc.set(i.occupant_id, (outByOcc.get(i.occupant_id) || 0) + i.outstanding);
    return {
      ready: true, err,
      rooms, occupants: raw.occupants, leases, invoices, payments, categories: raw.categories, expenses,
      roomById, occById, invById, catById, activeByRoom, activeByOcc, outByOcc,
      roomCode: (id) => roomById.get(id)?.code || '—',
      occName: (id) => occById.get(id)?.name || '—',
    };
  }, [raw, err]);
}
