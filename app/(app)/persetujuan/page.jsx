'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import PageHelp from '@/components/PageHelp';
import { Sheet, Field, Loading, Empty, toast, run } from '@/components/ui';
import { rp, tgl, errMsg, angka } from '@/lib/format';
import { canArea } from '@/lib/business';
import { hasFeature } from '@/lib/plan';
import FiturUpgrade from '@/components/FiturUpgrade';

const ST = { menunggu: ['Menunggu', 'gold'], dijalankan: ['Disetujui & dijalankan', 'good'], ditolak: ['Ditolak', 'bad'], dibatalkan: ['Dibatalkan', 'void'], gagal: ['Gagal dijalankan', 'bad'] };
const RISK = { rendah: 'good', menengah: 'gold', tinggi: 'bad' };
const when = (ts) => { const s = String(ts); return `${tgl(s.slice(0, 10))} ${new Date(s).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })}`; };
const KEY = { penjualan: 'Penjualan', tanggal: 'Tanggal', total: 'Total', cara_bayar: 'Cara bayar', stok: 'Stok', belanja: 'Belanja', status: 'Status', kontak: 'Kontak', jumlah: 'Jumlah',
  barang: 'Barang', stok_sekarang: 'Stok sekarang', alasan: 'Alasan', nilai_modal: 'Nilai modal', jenis: 'Jenis', modul: 'Modul', aktif: 'Aktif', data_lama: 'Data lama', pengembalian: 'Pengembalian', supplier: 'Supplier' };
const val = (k, v) => {
  if (v == null) return '—';
  if (Array.isArray(v)) return v.map((x) => (x.nama ? `${x.nama} ${angka(x.jumlah)} ${x.satuan || ''}` : x.product_id ? `${angka(x.qty)} ${x.unit} @ ${rp(x.price)}` : JSON.stringify(x))).join(', ');
  if (typeof v === 'boolean') return v ? 'ya' : 'tidak';
  if (['total', 'jumlah', 'nilai_modal'].includes(k) && !isNaN(Number(v))) return rp(v);
  return String(v);
};

// Pusat Persetujuan (blueprint Bagian 11): permintaan tindakan berisiko, keputusan pemilik, dan hasil eksekusinya
export default function Persetujuan() {
  const { kos, kosId, ver, loadKos } = useKos();
  const fitur = hasFeature(kos, 'persetujuan');   // mengatur aturan sendiri: mulai Paket Bisnis (bisnis lama tetap)
  const owner = canArea(kos, 'team');
  const approver = !owner && Boolean(kos?.my_approver);   // penyetuju tingkat 1 (Paket Pro)
  const multi = hasFeature(kos, 'persetujuan_bertingkat');
  const [rows, setRows] = useState(null);
  const [rules, setRules] = useState([]);
  const [tab, setTab] = useState('menunggu');
  const [open, setOpen] = useState(null);
  const [err, setErr] = useState(null);
  const load = async () => {
    const [a, r] = await Promise.all([
      supabase.from('approvals').select('*').eq('kos_id', kosId).order('created_at', { ascending: false }).limit(100),
      supabase.rpc('approval_rules_list', { p_kos: kosId }),
    ]);
    if (a.error) return setErr(errMsg(a.error));
    setRows(a.data); setRules(r.data || []);
  };
  useEffect(() => { load(); }, [kosId, ver]);
  if (err) return <div className="notice bad">{/approvals/.test(err) ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : err}</div>;
  if (!rows) return <Loading />;
  const pending = rows.filter((r) => r.status === 'menunggu');
  const shown = tab === 'menunggu' ? pending : rows.filter((r) => r.status !== 'menunggu');

  return (
    <div className="stack">
      <div className="row"><h2>Persetujuan</h2><PageHelp page="persetujuan" /></div>
      <p className="small muted" style={{ margin: 0 }}>{owner ? 'Tindakan berisiko dari karyawan dan otomatisasi menunggu keputusan Anda di sini. Setelah disetujui, sistem langsung menjalankannya dan mencatat hasilnya.' : approver ? 'Anda ditunjuk sebagai penyetuju tingkat 1: putuskan permintaan karyawan lain di modul Anda. Permintaan bernilai besar diteruskan ke pemilik.' : 'Permintaan Anda ke pemilik dan statusnya.'}</p>
      <div className="seg">
        <button className={tab === 'menunggu' ? 'on' : ''} onClick={() => setTab('menunggu')}>Menunggu ({pending.length})</button>
        <button className={tab === 'riwayat' ? 'on' : ''} onClick={() => setTab('riwayat')}>Riwayat</button>
        {owner && <button className={tab === 'aturan' ? 'on' : ''} onClick={() => setTab('aturan')}>Aturan</button>}
      </div>

      {tab !== 'aturan' && (shown.length === 0 ? <Empty title={tab === 'menunggu' ? 'Tidak ada yang menunggu' : 'Belum ada riwayat'} /> : (
        <section className="panel"><div className="list">{shown.map((r) => (
          <button key={r.id} className="li click" onClick={() => setOpen(r)} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', alignItems: 'flex-start' }}>
            <div className="main"><b className="small">{r.summary}</b>
              <span className="small muted">{r.number} · {r.requested_via === 'otomatisasi' ? '⚙ otomatisasi' : r.requested_email} · {when(r.created_at)}</span></div>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}><span className={'chip ' + ST[r.status][1]}>{ST[r.status][0]}</span>
              {r.status === 'menunggu' && r.levels_needed > 1 && <span className="chip">Tingkat {r.level} dari {r.levels_needed}</span>}</span>
          </button>
        ))}</div></section>
      ))}

      {tab === 'aturan' && owner && (
        <section className="panel">
          <h3>Wajib persetujuan pemilik</h3>
          <span className="small muted">Berlaku untuk karyawan (pengelola, kasir, gudang). Pemilik selalu bisa langsung menjalankan.</span>
          {!fitur && <FiturUpgrade kosId={kosId} event="TRANSACTION.APPROVAL_REQUESTED" title="Mengatur aturan persetujuan tersedia mulai Paket Bisnis" text="Pengaman bawaan di bawah tetap berlaku di paket ini. Di Paket Bisnis Anda bisa menyalakan atau mematikan setiap aturan sendiri." />}
          {rules.map((x) => (
            <div key={x.code} className="stack" style={{ gap: 6, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
              <label className="row small" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                <span>{x.label} <span className={'chip ' + RISK[x.risk]}>{x.risk}</span></span>
                <input type="checkbox" style={{ width: 22, minHeight: 22, flex: 'none' }} checked={x.required} disabled={!fitur}
                  onChange={async (e) => { if (await run(() => supabase.rpc('approval_rule_set', { p_kos: kosId, p_action: x.code, p_required: e.target.checked }), 'Aturan disimpan', errMsg)) load(); }} />
              </label>
              {multi && x.code !== 'ubah_modul' && <Tingkat x={x} kosId={kosId} onDone={load} />}
            </div>
          ))}
        </section>
      )}
      {tab === 'aturan' && owner && (
        <section className="panel">
          <h3>Persetujuan bertingkat</h3>
          {multi ? <span className="small muted">Tunjuk penyetuju tingkat 1 di menu Karyawan › Atur akses. Untuk tindakan bertingkat 2, permintaan yang disetujui penyetuju diteruskan ke Anda (bisa hanya di atas nominal tertentu). Anda selalu bisa langsung memutuskan di tingkat mana pun.</span>
            : <FiturUpgrade kosId={kosId} plan="pro" event="APPROVAL.MULTILEVEL.REQUESTED" title="Persetujuan bertingkat tersedia di Paket Pro" text="Pengelola menyetujui tingkat pertama; transaksi bernilai besar tetap menunggu keputusan Anda." />}
        </section>
      )}

      {open && <Detail r={open} owner={owner} approver={approver} onClose={() => setOpen(null)} onDone={() => { setOpen(null); load(); loadKos(); }} />}
    </div>
  );
}

// Atur jumlah tingkat satu tindakan (Paket Pro)
function Tingkat({ x, kosId, onDone }) {
  const [lv, setLv] = useState(x.levels || 1);
  const [min, setMin] = useState(x.level2_min != null ? String(Math.round(x.level2_min)) : '');
  const save = async (l, m) => {
    const n = m === '' ? null : Number(String(m).replace(/\D/g, ''));
    if (await run(() => supabase.rpc('approval_levels_set', { p_kos: kosId, p_action: x.code, p_levels: l, p_min: n }), 'Tingkat disimpan', errMsg)) onDone();
  };
  return (
    <div className="row small" style={{ gap: 8 }}>
      <select value={lv} onChange={(e) => { const l = Number(e.target.value); setLv(l); save(l, min); }} aria-label={`Tingkat ${x.label}`} style={{ flex: 1 }}>
        <option value={1}>1 tingkat (penyetuju atau pemilik)</option>
        <option value={2}>2 tingkat (penyetuju lalu pemilik)</option>
      </select>
      {lv === 2 && <Field label="Tingkat 2 mulai nominal (kosong = selalu)"><input inputMode="numeric" value={min} placeholder="mis. 500000" onChange={(e) => setMin(e.target.value)} onBlur={() => save(lv, min)} /></Field>}
    </div>
  );
}

function Detail({ r, owner, approver, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [can, setCan] = useState(owner);
  const [me, setMe] = useState(null);
  useEffect(() => { supabase.auth.getSession().then(({ data }) => setMe(data?.session?.user?.id || null)); }, []);
  useEffect(() => { if (!owner && approver && r.status === 'menunggu') supabase.rpc('approval_can_decide', { p_id: r.id }).then(({ data }) => setCan(Boolean(data))); }, [r.id]);
  const decide = async (ok) => {
    if (ok && !window.confirm(`${!owner && r.levels_needed > 1 ? 'Setujui tingkat 1 dan teruskan ke pemilik?' : 'Setujui dan jalankan sekarang?'}\n${r.summary}`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('approval_decide', { p_id: r.id, p_approve: ok, p_note: note });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(data?.status === 'dijalankan' ? 'Disetujui & dijalankan' : data?.status === 'menunggu' ? 'Disetujui tingkat 1 — diteruskan ke pemilik' : data?.status === 'gagal' ? `Gagal dijalankan: ${data.error}` : 'Ditolak');
    onDone();
  };
  const cancel = async () => { if (await run(() => supabase.rpc('approval_cancel', { p_id: r.id }), 'Permintaan dibatalkan', errMsg)) onDone(); };
  return (
    <Sheet title={r.number} onClose={onClose}>
      <b>{r.summary}</b>
      <div className="list">
        <div className="li"><span className="small">Status</span><span className={'chip ' + ST[r.status][1]}>{ST[r.status][0]}</span></div>
        <div className="li"><span className="small">Diminta oleh</span><b className="small">{r.requested_via === 'otomatisasi' ? 'Otomatisasi' : r.requested_email}</b></div>
        <div className="li"><span className="small">Waktu</span><b className="small">{when(r.created_at)}</b></div>
        {r.reason && <div className="li"><span className="small">Alasan</span><b className="small">{r.reason}</b></div>}
        {r.est_cost != null && <div className="li"><span className="small">Estimasi nilai</span><b className="small">{rp(r.est_cost)}</b></div>}
      </div>
      {r.impact && Object.keys(r.impact).length > 0 && <>
        <span className="label">Data terdampak</span>
        <div className="list">{Object.entries(r.impact).map(([k, v]) => <div className="li" key={k} style={{ alignItems: 'flex-start' }}><span className="small">{KEY[k] || k}</span><b className="small" style={{ textAlign: 'right' }}>{val(k, v)}</b></div>)}</div>
      </>}
      {r.levels_needed > 1 && <span className="small muted">Permintaan ini perlu {r.levels_needed} tingkat persetujuan · sekarang di tingkat {r.level}.</span>}
      {Array.isArray(r.steps) && r.steps.length > 0 && <>
        <span className="label">Riwayat keputusan</span>
        <div className="list">{r.steps.map((x, i) => <div className="li" key={i} style={{ alignItems: 'flex-start' }}><span className="small">Tingkat {x.level} · {x.oleh} ({x.peran}){x.catatan ? ` · "${x.catatan}"` : ''}</span><span className={'chip ' + (x.keputusan === 'setuju' ? 'good' : 'bad')}>{x.keputusan === 'setuju' ? 'Setuju' : 'Tolak'}</span></div>)}</div>
      </>}
      {r.decided_at && <div className="notice">{ST[r.status][0]} oleh {r.decided_by || '—'} · {when(r.decided_at)}{r.decision_note ? ` · "${r.decision_note}"` : ''}{r.result?.error ? <><br />Kesalahan: {r.result.error}</> : ''}</div>}
      {r.status === 'menunggu' && can && <>
        <Field label="Catatan (opsional)"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="row"><button className="primary" disabled={busy} onClick={() => decide(true)}>{!owner && r.levels_needed > 1 ? 'Setujui tingkat 1' : 'Setujui & jalankan'}</button><button className="danger" disabled={busy} onClick={() => decide(false)}>Tolak</button></div>
      </>}
      {r.status === 'menunggu' && !owner && me && r.requested_by === me && <button className="ghost" onClick={cancel}>Batalkan permintaan</button>}
    </Sheet>
  );
}
