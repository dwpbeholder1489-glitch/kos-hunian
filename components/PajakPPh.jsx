'use client';
// PPh final UMKM 0,5% (Tahap B Master Blueprint BI, keputusan pemilik 27 Nov 2026).
// Semua angka dari RPC pph_overview (jurnal + aturan berversi tax_rules). Halaman ini hanya menampilkan & mencatat setoran.
// Estimasi untuk catatan internal — bukan pengganti pelaporan/penyetoran resmi DJP (ditulis jelas di layar).
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Field, Loading, Sheet, run, toast } from '@/components/ui';
import { BLN, errMsg, parseRp, rp, tgl, today } from '@/lib/format';
import { uid } from '@/lib/retail';

const n = (v) => Number(v || 0);
const WP = { op: 'Orang pribadi', cv: 'CV', firma: 'Firma', koperasi: 'Koperasi', pt: 'Perseroan Terbatas (PT)' };
const mon = (d) => `${BLN[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;

export default function PajakPPh({ kosId, year, styles }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [ver, setVer] = useState(0);
  const [sheet, setSheet] = useState(null);
  useEffect(() => {
    let on = true; setD(null);
    supabase.rpc('pph_overview', { p_kos: kosId, p_year: year }).then(({ data, error }) => { if (!on) return; if (error) setErr(error); else setD(data); });
    return () => { on = false; };
  }, [kosId, year, ver]);
  const done = () => { setSheet(null); setVer((v) => v + 1); };
  if (err) return <p className="notice bad">{/pph_overview/.test(err.message || '') ? 'Database sedang diperbarui. Coba lagi beberapa menit lagi.' : errMsg(err)}</p>;
  if (!d) return <Loading rows={4} />;
  const p = d.profil; const aktif = p?.regime === 'pph_final_umkm';
  const rows = d.bulan || [];
  const total = rows.reduce((t, r) => t + n(r.pajak), 0); const paid = rows.reduce((t, r) => t + n(r.disetor), 0);
  const due = rows.find((r) => !r.berjalan && n(r.pajak) > n(r.disetor));
  const rule = (d.aturan || []).find((a) => a.id === rows[rows.length - 1]?.aturan) || (d.aturan || [])[d.aturan.length - 1];
  return <section className={styles.card}>
    <div className={styles.cardH}><h2 className={styles.cardT}>PPh Final UMKM {d.tahun}</h2>
      {d.boleh_atur && <button type="button" className={styles.link} onClick={() => setSheet({ t: 'profil' })}>{aktif ? 'Ubah profil pajak' : 'Atur profil pajak'}</button>}</div>
    {!aktif ? <>
      <p className={styles.note}>Profil pajak belum diatur, jadi PPh tidak dihitung dan tidak dijurnal. {d.boleh_atur ? 'Atur profil untuk mulai menghitung PPh final 0,5%.' : 'Minta pemilik mengatur profil pajak.'}</p>
    </> : <>
      <p className={styles.note}>{WP[p.wp_type]}{p.npwp ? ` · NPWP ${p.npwp}` : ' · NPWP belum diisi'}{p.registered_year ? ` · terdaftar ${p.registered_year}` : ''} · dihitung sejak {mon(p.start_month)}.
        Dasar: pendapatan usaha bersih dari jurnal (tanpa PPN & pendapatan lain). {rule ? `Aturan: ${rule.legal_basis}.` : ''}</p>
      {(d.grup || []).length > 0 && <p className={styles.note}>Batas omzet bebas Rp500 jt dihitung gabungan dengan: <b>{d.grup.map((g) => g.name).join(', ')}</b> (NPWP sama).</p>}
      {p.wp_type === 'op' && !p.npwp && <p className={styles.note}>Isi NPWP/NIK bila Anda punya beberapa usaha: batas Rp500 jt berlaku per wajib pajak, bukan per usaha.</p>}
      {rows.some((r) => r.lewat_batas) && <p className="notice bad">Omzet tahun ini sudah melewati Rp4,8 miliar: tahun berikutnya tidak bisa lagi memakai PPh final 0,5%. Konsultasikan ke konsultan pajak.</p>}
      {rows.some((r) => r.lewat_jangka) && <p className="notice">Menurut jangka waktu {WP[p.wp_type]} sejak {p.registered_year}, fasilitas 0,5% mungkin sudah berakhir. Angka tetap dihitung 0,5% — periksa ketentuan/perpanjangan terbaru DJP.</p>}
      {d.jenis_bisnis === 'properti' && <p className={styles.note}>Usaha kos: Anda sudah mengonfirmasi memakai PPh final UMKM. Penghasilan sewa bangunan pada umumnya dikenai PPh final 10% — pastikan dengan konsultan pajak.</p>}
      <dl className={styles.kvs}>
        <div><dt>PPh terutang {d.tahun}<small>bulan yang sudah lewat + estimasi bulan berjalan</small></dt><dd>{rp(total)}</dd></div>
        <div><dt>Sudah disetor</dt><dd>{rp(paid)}</dd></div>
        <div><dt>Utang PPh di Pembukuan</dt><dd className={n(d.utang_pph) > 0 ? styles.neg : undefined}>{rp(d.utang_pph)}</dd></div>
        {due && <div><dt>Jatuh tempo terdekat<small>setor paling lambat tanggal 15 bulan berikutnya</small></dt><dd>{mon(due.bulan)} · {tgl(due.jatuh_tempo)}</dd></div>}
      </dl>
      {rows.length === 0 ? <p className={styles.note}>Belum ada bulan dalam tahun ini sejak tanggal mulai.</p> :
        <table className={styles.stmt}><thead><tr><th>Masa (Rp)</th><th>Omzet</th><th className={styles.dcol}>Kena pajak</th><th>PPh</th><th>Disetor</th></tr></thead>
          <tbody>{rows.map((r) => { const kurang = !r.berjalan && n(r.pajak) > n(r.disetor);
            return <tr key={r.bulan}><th scope="row">{mon(r.bulan)}{r.berjalan ? ' *' : ''}</th><td>{n(r.bruto).toLocaleString('id-ID')}</td><td className={styles.dcol}>{n(r.kena).toLocaleString('id-ID')}</td>
              <td>{n(r.pajak).toLocaleString('id-ID')}</td>
              <td>{kurang ? <button type="button" className={styles.linkBtn} onClick={() => setSheet({ t: 'setor', r })}>{n(r.disetor) > 0 ? n(r.disetor).toLocaleString('id-ID') + ' · setor' : 'Setor'}</button> : n(r.disetor).toLocaleString('id-ID')}</td></tr>; })}</tbody></table>}
      <p className={styles.note}>* Bulan berjalan = estimasi, belum dijurnal. Bulan yang sudah lewat otomatis dijurnal: Beban PPh final ↔ Utang PPh. Setoran mengurangi kas/bank dan utang PPh.</p>
    </>}
    <p className={styles.note}><b>Penting:</b> ini perhitungan internal untuk pembukuan & analisis. Penyetoran (kode billing) dan pelaporan tetap lewat sistem resmi DJP.</p>
    {sheet?.t === 'profil' && <ProfileForm kosId={kosId} p={p} kos={d.jenis_bisnis} onClose={() => setSheet(null)} onSaved={done} />}
    {sheet?.t === 'setor' && <PayForm kosId={kosId} r={sheet.r} onClose={() => setSheet(null)} onSaved={done} />}
  </section>;
}

function ProfileForm({ kosId, p, kos, onClose, onSaved }) {
  const [f, setF] = useState({ regime: p?.regime === 'pph_final_umkm' ? 'pph_final_umkm' : 'pph_final_umkm', wp: p?.wp_type || '', npwp: p?.npwp || '',
    year: p?.registered_year ? String(p.registered_year) : '', start: p?.start_month || '', ack: !!p?.rent_ack });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const save = async (regime) => {
    if (regime === 'pph_final_umkm') {
      if (!f.wp) return toast('Pilih jenis wajib pajak.');
      if (!f.start) return toast('Isi bulan mulai dihitung.');
      if (kos === 'properti' && !f.ack) return toast('Centang konfirmasi untuk usaha kos.');
    }
    setBusy(true);
    const ok = await run(() => supabase.rpc('tax_profile_set', { p_kos: kosId, p_data: { regime, wp_type: f.wp, npwp: f.npwp, registered_year: f.year, start_month: f.start ? f.start + (f.start.length === 7 ? '-01' : '') : '', rent_ack: f.ack } }),
      regime === 'belum' ? 'Perhitungan PPh dimatikan' : 'Profil pajak disimpan', errMsg);
    setBusy(false);
    if (ok) onSaved();
  };
  return <Sheet title="Profil pajak (PPh final UMKM 0,5%)" onClose={onClose}>
    <Field label="Jenis wajib pajak"><select value={f.wp} onChange={set('wp')}><option value="">Pilih…</option>{Object.entries(WP).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
    <Field label="NPWP / NIK (opsional)" hint="Usaha lain milik Anda dengan NPWP sama dihitung gabungan untuk batas Rp500 jt (orang pribadi)."><input inputMode="numeric" value={f.npwp} onChange={set('npwp')} placeholder="15 atau 16 digit" /></Field>
    <div className="row"><Field label="Tahun terdaftar" hint="Untuk peringatan jangka waktu fasilitas"><input inputMode="numeric" value={f.year} onChange={set('year')} placeholder="mis. 2022" /></Field>
      <Field label="Mulai dihitung (bulan)"><input type="month" value={(f.start || '').slice(0, 7)} onChange={set('start')} /></Field></div>
    {kos === 'properti' && <label className="row" style={{ gap: 8, alignItems: 'flex-start' }}><input type="checkbox" checked={f.ack} onChange={set('ack')} style={{ width: 'auto', marginTop: 4 }} />
      <span className="small">Saya memahami bahwa penghasilan sewa kamar/bangunan pada umumnya dikenai <b>PPh final 10%</b> (PP 34/2017), dan saya sudah memastikan usaha kos saya memakai PPh final UMKM 0,5%.</span></label>}
    <p className="small muted" style={{ margin: 0 }}>Mengubah profil menghitung ulang bulan sejak tanggal mulai; jurnal koreksi dibuat otomatis. Bulan yang sudah ditutup buku tetap tercatat di riwayat.</p>
    <button className="cta" onClick={() => save('pph_final_umkm')} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan profil'}</button>
    {p?.regime === 'pph_final_umkm' && <button type="button" onClick={() => save('belum')} disabled={busy}>Matikan perhitungan PPh</button>}
  </Sheet>;
}

function PayForm({ kosId, r, onClose, onSaved }) {
  const [id] = useState(uid);
  const sisa = Math.max(0, n(r.pajak) - n(r.disetor));
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [acc, setAcc] = useState('bank');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const a = parseRp(amount);
    if (!(a > 0)) return toast('Isi jumlah setoran.');
    setBusy(true);
    const ok = await run(() => supabase.rpc('tax_pay', { p_id: id, p_kos: kosId, p_period: r.bulan, p_amount: a, p_date: date, p_account: acc, p_note: note }), `Setoran ${rp(a)} tercatat`, errMsg);
    setBusy(false);
    if (ok) onSaved();
  };
  return <Sheet title={`Setor PPh · ${mon(r.bulan)}`} onClose={onClose}>
    <p style={{ margin: 0 }}>PPh terhitung <b>{rp(r.pajak)}</b> · sudah disetor {rp(r.disetor)} · jatuh tempo {tgl(r.jatuh_tempo)}.</p>
    <button type="button" className="sm" onClick={() => setAmount(String(sisa))}>Isi sesuai perhitungan: {rp(sisa)}</button>
    <div className="row"><Field label="Jumlah disetor"><input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Field label="Tanggal setor"><input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></Field></div>
    <div className="seg">{[['bank', 'Dari Bank'], ['kas', 'Dari Kas']].map(([k, l]) => <button key={k} className={acc === k ? 'on' : ''} onClick={() => setAcc(k)}>{l}</button>)}</div>
    <Field label="NTPN / keterangan (opsional)"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nomor bukti setor" /></Field>
    <button className="cta" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan setoran'}</button>
  </Sheet>;
}
