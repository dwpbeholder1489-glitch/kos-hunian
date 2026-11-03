'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase, configured } from '@/lib/supabase';

const Ctx = createContext(null);
export const useKos = () => useContext(Ctx);

const KEY = 'koshunian.kos';

export default function KosProvider({ children }) {
  const router = useRouter();
  const path = usePathname();
  const [session, setSession] = useState(undefined); // undefined = sedang dicek
  const [list, setList] = useState(null);
  const [kosId, setKosId] = useState(null);
  const [ver, setVer] = useState(0);

  useEffect(() => {
    if (!configured) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const loadKos = useCallback(async () => {
    const { data, error } = await supabase.from('kos').select('id,name,address,owner_id').order('created_at');
    if (error) { setList([]); return []; }
    setList(data);
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch {}
    const pick = data.find((k) => k.id === saved) || data[0] || null;
    setKosId(pick?.id || null);
    return data;
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (!session) { setList(null); if (path !== '/masuk') router.replace('/masuk'); return; }
    loadKos();
  }, [session, loadKos, path, router]);

  useEffect(() => {
    if (session && list && list.length === 0 && path !== '/mulai') router.replace('/mulai');
  }, [session, list, path, router]);

  const pickKos = (id) => { setKosId(id); try { localStorage.setItem(KEY, id); } catch {} setVer((v) => v + 1); };
  const bump = () => setVer((v) => v + 1);
  const kos = list?.find((k) => k.id === kosId) || null;

  return (
    <Ctx.Provider value={{ session, user: session?.user || null, list, kos, kosId, pickKos, loadKos, ver, bump }}>
      {children}
    </Ctx.Provider>
  );
}
