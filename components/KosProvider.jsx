'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase, configured } from '@/lib/supabase';
import { offlineSession, cacheKosList, cachedKosList, isNetErr } from '@/lib/offline';

const Ctx = createContext(null);
export const useKos = () => useContext(Ctx);

const KEY = 'prasara.kos';
const OLD_KEY = 'koshunian.kos'; // nama lama, dibaca sekali agar bisnis terakhir yang dipilih tetap diingat
const PUBLIC = ['/', '/masuk', '/panduan', '/tentang', '/privasi', '/syarat'];

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
    // Tanpa internet & token perlu diperbarui → supabase memberi sesi kosong, tetapi token masih tersimpan: pakai sesi itu
    // (offline) supaya Kasir tetap terbuka. Keluar/ditolak server menghapus token → benar-benar keluar.
    supabase.auth.getSession().then(({ data }) => setSession(data.session || offlineSession()), () => setSession(offlineSession()));
    const { data } = supabase.auth.onAuthStateChange((e, s) => setSession(s || (e === 'SIGNED_OUT' ? null : offlineSession())));
    return () => data.subscription.unsubscribe();
  }, []);

  const accepted = useRef(false);
  const uidRef = useRef(null);
  uidRef.current = session?.user?.id || null;
  const pickFrom = (data) => {
    let saved = null;
    try { saved = localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY); } catch {}
    const pick = data.find((k) => k.id === saved) || data[0] || null;
    setKosId(pick?.id || null);
  };
  const loadKos = useCallback(async () => {
    // undangan karyawan untuk email ini otomatis diterima saat masuk
    if (!accepted.current) { accepted.current = true; await supabase.rpc('accept_invites').then(() => {}, () => {}); }
    // coba kolom terlengkap dulu; kalau database belum diperbarui, turun ke kolom yang lebih sedikit
    const COLS = ['id,name,address,owner_id,plan,trial_until,paid_until,effective_plan,owner_is_admin,contact_phone,payment_info,house_rules,notify_email,daily_digest,wa_reminder_tpl,wa_portal_tpl,onboarding_emails,weekly_summary,monthly_summary,business_type,suspended_at,suspend_reason,receipt_footer,business_groups,profile,legal_entity_id,closed_at,close_reason,last_export_at,setup_status,category_code,activated_at,template_code', 'id,name,address,owner_id,plan,trial_until,paid_until,effective_plan,owner_is_admin,contact_phone,payment_info,house_rules,notify_email,daily_digest,wa_reminder_tpl,wa_portal_tpl,onboarding_emails,weekly_summary,monthly_summary,business_type,suspended_at,suspend_reason,receipt_footer,business_groups,profile,legal_entity_id,closed_at,close_reason,last_export_at', 'id,name,address,owner_id,plan,trial_until,paid_until,effective_plan,owner_is_admin,contact_phone,payment_info,house_rules,notify_email,daily_digest,wa_reminder_tpl,wa_portal_tpl,onboarding_emails,weekly_summary,monthly_summary,business_type,suspended_at,suspend_reason,receipt_footer,business_groups,profile,legal_entity_id', 'id,name,address,owner_id,plan,trial_until,paid_until,effective_plan,owner_is_admin,contact_phone,payment_info,house_rules,notify_email,daily_digest,wa_reminder_tpl,wa_portal_tpl,onboarding_emails,weekly_summary,monthly_summary,business_type,suspended_at,suspend_reason,receipt_footer', 'id,name,address,owner_id,plan,trial_until,paid_until,effective_plan,owner_is_admin,contact_phone,payment_info,house_rules,notify_email,daily_digest,wa_reminder_tpl,wa_portal_tpl,onboarding_emails,weekly_summary,monthly_summary,business_type', 'id,name,address,owner_id,plan,trial_until,paid_until,effective_plan,owner_is_admin,contact_phone,payment_info,house_rules,notify_email,daily_digest,wa_reminder_tpl,wa_portal_tpl,onboarding_emails,weekly_summary,monthly_summary', 'id,name,address,owner_id,plan,trial_until,paid_until,effective_plan,owner_is_admin,contact_phone,payment_info,house_rules,notify_email,daily_digest,wa_reminder_tpl,wa_portal_tpl,onboarding_emails', 'id,name,address,owner_id,plan,trial_until,paid_until,effective_plan,owner_is_admin,contact_phone,payment_info,house_rules,notify_email,daily_digest,wa_reminder_tpl,wa_portal_tpl', 'id,name,address,owner_id,plan,trial_until,paid_until,effective_plan,owner_is_admin,contact_phone,payment_info,house_rules,notify_email,daily_digest', 'id,name,address,owner_id,plan,trial_until,paid_until,effective_plan,owner_is_admin,contact_phone,payment_info,house_rules,notify_email', 'id,name,address,owner_id,plan,trial_until,paid_until,effective_plan,owner_is_admin,contact_phone,payment_info,house_rules', 'id,name,address,owner_id,plan,trial_until,paid_until,effective_plan,owner_is_admin', 'id,name,address,owner_id,plan,trial_until,paid_until', 'id,name,address,owner_id'];
    let data = null, error = null;
    for (const c of COLS) { ({ data, error } = await supabase.from('kos').select(c).order('created_at')); if (!error || isNetErr(error)) break; }
    if (error) {
      // Offline: daftar bisnis terakhir yang tersimpan di HP ini (Kasir offline)
      const cached = isNetErr(error) && uidRef.current ? cachedKosList(uidRef.current) : null;
      if (cached?.length) { setList(cached.map((k) => ({ ...k, offline: true }))); pickFrom(cached); return cached; }
      setList([]); return [];
    }
    let mods = null, locs = {}, acc = {}, exp = {};
    const [roles, ents] = await Promise.all([
      supabase.rpc('my_roles').then((r) => r.data || {}, () => ({})),
      supabase.rpc('my_entitlements').then((r) => r.data || {}, () => ({})), // paket, fitur & batas dari database
      supabase.rpc('my_modules').then((r) => (r.error ? null : r.data || {}), () => null), // modul aktif per bisnis
      supabase.rpc('my_locations').then((r) => r.data || {}, () => ({})), // lokasi (cabang/gudang) & lokasi kerja saya
      supabase.rpc('my_access').then((r) => r.data || {}, () => ({})), // akses per modul (Bisnis/Pro) & penyetuju tingkat 1 (Pro)
      supabase.rpc('my_experience').then((r) => r.data || {}, () => ({})), // Business DNA + pengaturan menu/aksi cepat/dashboard pemilik
    ]).then(([a, b, c, d, e, f]) => { mods = c; locs = d; acc = e; exp = f; return [a, b]; });
    // Bisnis kustom: jenis data aktif jadi menu sendiri (mis. Acara, Klien) + tombol "buat" dari tata letak template
    const kustom = data.filter((k) => k.business_type === 'kustom').map((k) => k.id);
    const bb = {};
    if (kustom.length) {
      const [ob, ws] = await Promise.all([
        supabase.from('bb_objects').select('kos_id,key,name,icon,workflow,sort').in('kos_id', kustom).eq('active', true).order('sort').then((r) => r.data || [], () => []),
        supabase.from('bb_workspace').select('kos_id,status,layout').in('kos_id', kustom).then((r) => r.data || [], () => []),
      ]);
      for (const id of kustom) {
        const w = ws.find((x) => x.kos_id === id);
        bb[id] = { menu: ob.filter((o) => o.kos_id === id).sort((a, b) => Number(b.workflow) - Number(a.workflow) || a.sort - b.sort).map((o) => [o.key, o.name, o.icon]), create: w?.layout?.create || [], active: w?.status === 'aktif' };
      }
    }
    data = data.map((k) => ({ ...k, my_role: roles[k.id] || 'pemilik', ent: ents[k.id] || null, modules: mods && mods[k.id] ? mods[k.id] : null, locs: locs[k.id] || null,
      my_areas: acc[k.id]?.areas || null, my_approver: Boolean(acc[k.id]?.approver), my_risks: acc[k.id]?.risks || 0, bb: bb[k.id] || null,
      dna: exp[k.id]?.dna || null, dna_stored: Boolean(exp[k.id]?.dna_stored), exp: exp[k.id]?.cfg || { nav: {}, quick: {}, dash: {}, version: 0 } }));
    setList(data);
    if (uidRef.current) cacheKosList(uidRef.current, data);
    pickFrom(data);
    return data;
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (path.startsWith('/p/') || path.startsWith('/c/') || path.startsWith('/berhenti/') || path.startsWith('/b/')) return; // portal penghuni & pelanggan (/c), tautan berhenti email, dan halaman bisnis publik tidak memakai akun
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
    if (!session || !list || list.length > 0 || adminMe === undefined) return;
    if (['/', '/panduan', '/tentang', '/privasi', '/syarat', '/masuk'].includes(path) || path.startsWith('/p/') || path.startsWith('/c/') || path.startsWith('/b/') || path.startsWith('/berhenti/') || path.startsWith('/admin')) return;
    // Staf PRASARA tanpa bisnis sendiri langsung ke Management Center, bukan ke "buat bisnis"
    if (adminMe) router.replace('/admin'); else if (path !== '/mulai') router.replace('/mulai');
  }, [session, list, path, router, adminMe]);

  const pickKos = (id) => { setKosId(id); try { localStorage.setItem(KEY, id); } catch {} setVer((v) => v + 1); };
  const bump = () => setVer((v) => v + 1);
  const kos = list?.find((k) => k.id === kosId) || null;

  return (
    <Ctx.Provider value={{ session, user: session?.user || null, list, kos, kosId, pickKos, loadKos, ver, bump, isAdmin, adminMe }}>
      {children}
    </Ctx.Provider>
  );
}
