'use client';

import { useCallback, useEffect, useState } from 'react';
import { LEARNING_REVISION } from '@/lib/learning';

export function useLearningStorage(scope, name) {
  const key = `prasara-learning:${LEARNING_REVISION}:${scope}:${name}`;
  const [failed, setFailed] = useState(false);
  const [snapshot, setSnapshot] = useState({ key: null, value: {} });

  useEffect(() => {
    function load() {
      try {
        const value = JSON.parse(localStorage.getItem(key));
        setSnapshot({ key, value: value && typeof value === 'object' ? value : {} });
      } catch {
        setSnapshot({ key, value: {} });
      }
    }
    function onStorage(event) {
      if (!event || event.key === key || event.key === null) load();
    }
    load();
    window.addEventListener('storage', onStorage);
    window.addEventListener('prasara-learning-change', load);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('prasara-learning-change', load);
    };
  }, [key]);

  const update = useCallback((patch) => {
    let value = snapshot.key === key ? snapshot.value : {};
    try {
      value = { ...value, ...JSON.parse(localStorage.getItem(key)) };
    } catch {}
    const changes = typeof patch === 'function' ? patch(value) : patch;
    if (!changes) return;
    value = { ...value, ...changes };
    try {
      localStorage.setItem(key, JSON.stringify(value));
      window.dispatchEvent(new Event('prasara-learning-change'));
      setFailed(false);
    } catch { setFailed(true); }
    setSnapshot({ key, value });
  }, [key, snapshot]);

  return [snapshot.key === key ? snapshot.value : {}, update, snapshot.key === key, failed];
}
