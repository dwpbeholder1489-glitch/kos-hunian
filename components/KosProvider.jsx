'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase, configured } from '@/lib/supabase';

const Ctx = createContext(null);
export const useKos = () => useContext(Ctx);

const KEY = 'koshunian.kos';
const PUBLIC = ['/', '/masuk'];

export default function KosProvider({ children }) {
  const router = useRouter();
  const path = usePathname();
  const [session, setSession] = useState(undefined); // undefined = sedang dicek
  const [list, setList] = useState(null);
  const [kosId, setKosId] = useState(null);
  const [ver, setVer] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!configured) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const loadKos = useCallback(async () => {
    let { data, error } = await supabase.from('kos').select('id,name,address,owner_id,plan,trial_until,paid_until').order('created_at');
    // database belum diperbarui (kolom paket belum ada) → muat tanpa info paket
    if (error) ({ data, error } = await supabase.from('kos').select('id,name,address,owner_id').order('created_at'));
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
    if (!session) { setList(null); if (!PUBLIC.includes(path)) router.replace('/masuk'); return; }
    loadKos();
  }, [session, loadKos, path, router]);

  useEffect(() => {
    if (!session) { setIsAdmin(false); return; }
    supabase.rpc('is_admin').then(({ data }) => setIsAdmin(Boolean(data)));
  }, [session]);

  useEffect(() => {
    if (session && list && list.length === 0 && !['/mulai', '/'].includes(path)) router.replace('/mulai');
  }, [session, list, path, router]);

  const pickKos = (id) => { setKosId(id); try { localStorage.setItem(KEY, id); } catch {} setVer((v) => v + 1); };
  const bump = () => setVer((v) => v + 1);
  const kos = list?.find((k) => k.id === kosId) || null;

  return (
    <Ctx.Provider value={{ session, user: session?.user || null, list, kos, kosId, pickKos, loadKos, ver, bump, isAdmin }}>
      {children}
    </Ctx.Provider>
  );
}
