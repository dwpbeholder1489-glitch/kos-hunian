'use client';
// Perangkat terhubung: setiap HP/laptop punya langganan sendiri; nyalakan/matikan, ganti nama, atau hapus.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/Page';
import { Empty, Loading, toast } from '@/components/ui';
import { errMsg } from '@/lib/format';
import { ago, pushStatus } from '@/lib/notif';

const STATUS = { aktif: ['Aktif', 'good'], kedaluwarsa: ['Kedaluwarsa', 'warn'], dicabut: ['Dicabut', 'void'] };
const PHONE = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" /></svg>;
const LAPTOP = <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="4" y="4" width="16" height="11" rx="1.5" /><path d="M2 19h20" /></svg>;
const BROWSER = { safari: 'Safari', chrome: 'Chrome', edge: 'Edge', firefox: 'Firefox', samsung: 'Samsung Internet', opera: 'Opera' };
const ICON = (p) => (['ios', 'ipados', 'android'].includes(p) ? PHONE : LAPTOP);

export default function Perangkat() {
  const [list, setList] = useState(null);
  const [mine, setMine] = useState(null);
  const load = () => supabase.rpc('push_devices').then(({ data, error }) => (error ? toast(errMsg(error)) : setList(data)));
  useEffect(() => { load(); pushStatus().then((s) => setMine(s.server?.id || null)); }, []);
  const act = async (rpc, args, msg) => { const { error } = await supabase.rpc(rpc, args); if (error) return toast(errMsg(error)); toast(msg); load(); };
  const rename = (d) => { const v = window.prompt('Nama perangkat', d.label); if (v && v.trim()) act('push_device_set', { p_id: d.id, p_enabled: null, p_label: v.trim() }, 'Nama perangkat diubah'); };
  if (!list) return <Loading />;
  return (
    <div className="stack">
      <PageHeader title="Perangkat terhubung" desc="Perangkat yang menerima notifikasi push akun Anda. Hapus perangkat yang tidak Anda kenali." />
      <section className="panel">
        {list.length === 0 ? <Empty title="Belum ada perangkat" text="Aktifkan notifikasi di HP atau komputer Anda; perangkatnya akan muncul di sini."><Link href="/pusat-notifikasi/pengaturan">Aktifkan di perangkat ini →</Link></Empty> : (
          <div className="nt-devs">{list.map((d) => (
            <div key={d.id} className="nt-dev">
              <span className="nt-dev-ic" aria-hidden="true">{ICON(d.platform)}</span>
              <div className="nt-dev-t">
                <b>{d.label}{d.id === mine && <span className="chip info" style={{ marginLeft: 6 }}>Perangkat ini</span>}</b>
                <span className="small muted">{BROWSER[d.browser] || 'Browser'}{d.installed ? ' · dipasang di Layar Utama' : ''} · <span className={'chip ' + (d.enabled ? STATUS[d.status]?.[1] : 'void')}>{d.enabled ? STATUS[d.status]?.[0] : 'Dimatikan'}</span></span>
                <span className="small muted">Terakhir aktif {ago(d.last_seen_at)} · diaktifkan {new Date(d.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}{d.last_success_at ? ` · push terakhir diterima ${ago(d.last_success_at)}` : ''}</span>
                {d.status === 'kedaluwarsa' && <span className="small">Buka PRASARA di perangkat itu lalu ketuk Aktifkan Notifikasi untuk menyambungkan lagi.</span>}
              </div>
              <div className="nt-dev-a">
                {d.status === 'aktif' && <button className="sm" onClick={() => act('push_device_set', { p_id: d.id, p_enabled: !d.enabled, p_label: null }, d.enabled ? 'Push dimatikan untuk perangkat ini' : 'Push dinyalakan lagi')}>{d.enabled ? 'Matikan' : 'Nyalakan'}</button>}
                <button className="sm ghost" onClick={() => rename(d)}>Ganti nama</button>
                <button className="sm ghost danger" onClick={() => window.confirm(`Hapus ${d.label}? Perangkat itu berhenti menerima notifikasi.`) && act('push_device_delete', { p_id: d.id }, 'Perangkat dihapus')}>Hapus</button>
              </div>
            </div>
          ))}</div>
        )}
      </section>
      <p className="small muted">Maksimal 10 perangkat aktif per akun; perangkat tertua dicabut otomatis. Saat Anda keluar akun di sebuah perangkat, perangkat itu otomatis berhenti menerima notifikasi.</p>
    </div>
  );
}
