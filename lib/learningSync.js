'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

const VERSION = 2;

function applyRemote(current, remote) {
  const local = current.journey || {};
  const touched = local.touched || '';
  const remoteTime = new Date(remote.touched_at).toISOString();
  const remoteIsNewer = !touched || remoteTime > touched;
  const attempts = [...new Map([...(local.attempts || []), ...(remote.attempts || [])]
    .map((attempt) => [`${attempt.at}:${attempt.score}:${attempt.max}`, attempt])).values()]
    .sort((a, b) => a.at.localeCompare(b.at)).slice(-50);
  const next = {
    ...local,
    version: VERSION,
    role: remote.role,
    category: remote.category,
    started: new Date(remote.started_at).toISOString(),
    touched: remoteIsNewer ? remoteTime : touched,
    current: remoteIsNewer && !local.draft && !local.quizDraft ? remote.current_step : local.current ?? remote.current_step,
    done: [...new Set([...(local.done || []), ...remote.done])].sort((a, b) => a - b),
    attempts,
    score: attempts.at(-1)?.score ?? local.score,
    simulations: Math.max(local.simulations || 0, remote.practice_count),
    completed: local.completed || remote.completed_at || undefined,
  };
  return JSON.stringify(local) === JSON.stringify(next) ? null : { journey: next };
}

export function useJourneySync({ kosId, role, track, disabled, ready, userId, journey, update }) {
  const [error, setError] = useState(false);
  const latest = useRef(null);
  latest.current = { journey, update };
  const touched = journey?.touched;

  useEffect(() => {
    if (!ready || disabled || !supabase || !userId) return;
    let stale = false;
    async function sync() {
      const current = latest.current.journey;
      try {
        const result = current?.touched
          ? await supabase.rpc('learning_progress_save', {
            p_kos: kosId, p_track: track, p_version: VERSION, p_done: current.done || [],
            p_step: current.current ?? 0, p_started: current.started, p_touched: current.touched,
            p_practice: current.simulations || 0, p_attempts: current.attempts || [],
          })
          : await supabase.from('learning_progress').select('*')
            .eq('kos_id', kosId).eq('user_id', userId).eq('role', role)
            .eq('track', track).eq('version', VERSION).maybeSingle();
        if (stale) return;
        if (result.error) return setError(true);
        setError(false);
        const remote = Array.isArray(result.data) ? result.data[0] : result.data;
        if (remote?.done && remote.role === role) latest.current.update((value) => applyRemote(value, remote));
      } catch {
        if (!stale) setError(true);
      }
    }
    const timer = setTimeout(sync, 550);
    window.addEventListener('online', sync);
    return () => {
      stale = true;
      clearTimeout(timer);
      window.removeEventListener('online', sync);
    };
  }, [disabled, kosId, ready, role, touched, track, userId]);

  return error;
}
