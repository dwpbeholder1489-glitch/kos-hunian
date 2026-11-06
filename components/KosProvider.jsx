'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase, configured } from '@/lib/supabase';

const Ctx = createContext(null);
export const useKos = () => useContext(Ctx);

const KEY = 'koshunian.kos';
const PUBLIC = ['/', '/masuk', '/panduan'];

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
    // coba kolom terlengkap dulu; kalau database belum diperbarui, turun ke kolom yang lebih sedikit
    const COLS = ['id,name,address,owner_id,plan,trial_until,paid_until,effective_plan,owner_is_admin,contact_phone,payment_info,house_rules,notify_email,daily_digest,wa_reminder_tpl,wa_portal_tpl,onboarding_emails,weekly_summary,monthly_summary,business_type,suspended_at,suspend_reason', 'id,name,address,owner_id,plan,trial_until,paid_until,effective_plan,owner_is_admin,contact_phone,payment_info,house_rules,notify_email,daily_digest,wa_reminder_tpl,wa_portal_tpl,onboarding_emails,weekly_summary,monthly_summary,business_type', 'id,name,address,owner_id,plan,trial_until,paid_until,effective_plan,owner_is_admin,contact_phone,payment_info,house_rules,notify_email,daily_digest,wa_reminder_tpl,wa_portal_tpl,onboarding_emails,weekly_summary,monthly_summary', 'id,name,address,owner_id,plan,trial_until,paid_until,effective_plan,owner_is_admin,contact_phone,payment_info,house_rules,notify_email,daily_digest,wa_reminder_tpl,wa_portal_tpl,onboarding_emails', 'id,name,address,owner_id,plan,trial_until,paid_until,effective_plan,owner_is_admin,contact_phone,payment_info,house_rules,notify_email,daily_digest,wa_reminder_tpl,wa_portal_tpl', 'id,name,address,owner_id,plan,trial_until,paid_until,effective_plan,owner_is_admin,contact_phone,payment_info,house_rules,notify_email,daily_digest', 'id,name,address,owner_id,plan,trial_until,paid_until,effective_plan,owner_is_admin,contact_phone,payment_info,house_rules,notify_email', 'id,name,address,owner_id,plan,trial_until,paid_until,effective_plan,owner_is_admin,contact_phone,payment_info,house_rules', 'id,name,address,owner_id,plan,trial_until,paid_until,effective_plan,owner_is_admin', 'id,name,address,owner_id,plan,trial_until,paid_until', 'id,name,address,owner_id'];
    let data = null, error = null;
    for (const c of COLS) { ({ data, error } = await supabase.from('kos').select(c).order('created_at')); if (!error) break; }
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
    if (path.startsWith('/p/') || path.startsWith('/berhenti/')) return; // portal penghuni & tautan berhenti email tidak memakai akun
    if (!session) { setList(null); if (!PUBLIC.includes(path)) router.replace('/masuk'); return; }
    loadKos();
  }, [session, loadKos, path, router]);

  // Staf PRASARA (Super Admin, Support, dll.): peran & izin dari database
  const [adminMe, setAdminMe] = useState(undefined); // undefined = sedang dicek
  useEffect(() => {
    if (!session) { setIsAdmin(false); setAdminMe(null); return; }
    supabase.rpc('admin_me').then(({ data, error }) => {
      if (error) return supabase.rpc('is_admin').then((r) => { setIsAdmin(Boolean(r.data)); setAdminMe(r.data ? { role: 'super_admin', perms: [] } : null); });
      setAdminMe(data || null); setIsAdmin(Boolean(data));
    });
  }, [session]);

  useEffect(() => {
    if (session && list && list.length === 0 && !['/mulai', '/', '/panduan'].includes(path) && !path.startsWith('/p/') && !path.startsWith('/berhenti/') && !path.startsWith('/admin')) router.replace('/mulai');
  }, [session, list, path, router]);

  const pickKos = (id) => { setKosId(id); try { localStorage.setItem(KEY, id); } catch {} setVer((v) => v + 1); };
  const bump = () => setVer((v) => v + 1);
  const kos = list?.find((k) => k.id === kosId) || null;

  return (
    <Ctx.Provider value={{ session, user: session?.user || null, list, kos, kosId, pickKos, loadKos, ver, bump, isAdmin, adminMe }}>
      {children}
    </Ctx.Provider>
  );
}
