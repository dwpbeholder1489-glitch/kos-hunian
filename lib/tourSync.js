'use client';
// Sinkron progres tur panduan (onboarding & "? Panduan" per modul) dengan server — learning_tour_* saja.
// Lokal (localStorage) tetap sumber cepat & cadangan saat offline; server menyimpan untuk perangkat lain.
// Fungsi ini TIDAK pernah memanggil RPC/tabel bisnis.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { mergeTours, validTourKey } from '@/lib/tour';

export function useTourSync({ kosId, enabled, ready, record, update }) {
  const [error, setError] = useState(false);
  const latest = useRef(record);
  latest.current = record;

  // Muat sekali per bisnis/peran, gabung dengan lokal (yang lebih baru menang).
  useEffect(() => {
    if (!enabled || !ready || !kosId || !supabase) return;
    let stale = false;
    supabase.rpc('learning_tour_list', { p_kos: kosId }).then(({ data, error: e }) => {
      if (stale) return;
      if (e) return setError(true);
      setError(false);
      const patch = mergeTours(latest.current, data || []);
      if (Object.keys(patch).length) update(patch);
      // Catatan lokal yang belum pernah terkirim (mis. dibuat saat offline) dikirim sekarang.
      for (const [key, v] of Object.entries(latest.current)) {
        if (validTourKey(key) && v?.at && v.synced !== v.at && !patch[key]) push(key, v);
      }
    }, () => !stale && setError(true));
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ready, kosId]);

  const push = useCallback(async (key, v) => {
    if (!enabled || !kosId || !supabase || !validTourKey(key) || !v?.status) return;
    try {
      const { error: e } = await supabase.rpc('learning_tour_save', {
        p_kos: kosId, p_tour: key, p_status: v.status, p_step: Math.max(0, Math.min(60, v.index || 0)),
        p_steps: Math.max(0, Math.min(60, v.steps || 0)), p_runs: Math.max(0, v.runs || 0), p_at: v.at,
      });
      if (e) return setError(true);
      setError(false);
      update((cur) => (cur[key]?.at === v.at ? { [key]: { ...cur[key], synced: v.at } } : null));
    } catch { setError(true); }
  }, [enabled, kosId, update]);

  const reset = useCallback(async (key = null) => {
    if (!enabled || !kosId || !supabase) return true;
    const { error: e } = await supabase.rpc('learning_tour_reset', { p_kos: kosId, p_tour: key });
    if (e) { setError(true); return false; }
    return true;
  }, [enabled, kosId]);

  return { push, reset, error };
}
