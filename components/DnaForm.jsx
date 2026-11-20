'use client';
// Formulir Business DNA (6 dimensi) — dipakai di pendaftaran (/mulai) dan Pusat Pengalaman › Profil bisnis.
// value/onChange = objek DNA kanonik. Server memvalidasi ulang (dna_clean): kode tak dikenal ditolak.
import { Field } from '@/components/ui';
import { DNA_DIMS } from '@/lib/dna';

function Chips({ list, value, onChange, disabled }) {
  const v = Array.isArray(value) ? value : [];
  return (
    <div className="dna-chips">{list.map((x) => {
      const on = v.includes(x.code);
      return <button type="button" key={x.code} aria-pressed={on} disabled={disabled} className={on ? 'on' : ''} onClick={() => onChange(on ? v.filter((c) => c !== x.code) : [...v, x.code])}>{on ? '✓ ' : ''}{x.label}</button>;
    })}</div>
  );
}

// Grup pilihan: <div> (bukan <label>) agar mengetuk judul tidak ikut memilih tombol pertama
const Group = ({ label, hint, children }) => <div className="f" role="group" aria-label={label}><span>{label}</span>{children}{hint && <span className="hint">{hint}</span>}</div>;
const num = (s) => String(s ?? '').replace(/\D/g, '').slice(0, 7);

export default function DnaForm({ value, onChange, vocab, primary, only, disabled }) {
  const d = value;
  const set = (k, v) => onChange({ ...d, [k]: v });
  const setI = (k, v) => onChange({ ...d, indicators: { ...(d.indicators || {}), [k]: v } });
  const setId = (k, v) => onChange({ ...d, identity: { ...(d.identity || {}), [k]: v } });
  const show = (k) => !only || only.includes(k);
  return (
    <div className="stack dna-form">
      {DNA_DIMS.filter(([k]) => show(k)).map(([k, dim, label, hint]) => (
        <Group key={k} label={label} hint={hint}>
          <Chips list={vocab?.[dim] || []} value={d[k]} onChange={(v) => set(k, v)} disabled={disabled} />
        </Group>
      ))}
      {show('scale') && <>
        <Group label="Skala usaha" hint={(vocab?.scale || []).find((x) => x.code === d.scale)?.hint || 'Skala bukan satu-satunya penentu fitur — karakter operasional tetap yang utama.'}>
          <div className="seg">{(vocab?.scale || []).map((x) => <button type="button" key={x.code} disabled={disabled} className={d.scale === x.code ? 'on' : ''} onClick={() => set('scale', x.code)}>{x.label}</button>)}</div>
        </Group>
        <div className="dna-grid">
          <Field label="Jumlah karyawan"><input inputMode="numeric" disabled={disabled} value={d.indicators?.employees ?? ''} onChange={(e) => setI('employees', num(e.target.value) === '' ? null : num(e.target.value))} placeholder="mis. 3" /></Field>
          <Field label="Jumlah outlet / cabang"><input inputMode="numeric" disabled={disabled} value={d.indicators?.outlets ?? ''} onChange={(e) => setI('outlets', num(e.target.value) === '' ? null : num(e.target.value))} placeholder="1" /></Field>
          <Field label="Transaksi per bulan (perkiraan)"><input inputMode="numeric" disabled={disabled} value={d.indicators?.tx_month ?? ''} onChange={(e) => setI('tx_month', num(e.target.value) === '' ? null : num(e.target.value))} placeholder="opsional" /></Field>
          <Field label="Omzet per bulan"><select disabled={disabled} value={d.indicators?.omzet || ''} onChange={(e) => setI('omzet', e.target.value || null)}><option value="">— tidak diisi —</option>{(vocab?.omzet || []).map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}</select></Field>
        </div>
      </>}
      {show('identity') && <div className="dna-grid">
        <Field label="Bentuk kepemilikan"><select disabled={disabled} value={d.identity?.ownership || ''} onChange={(e) => setId('ownership', e.target.value || null)}><option value="">— tidak diisi —</option>{(vocab?.ownership || []).map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}</select></Field>
        <Field label="Aktivitas bisnis kedua" hint="Mis. toko yang juga menjual kopi"><select disabled={disabled} value={d.identity?.secondary_category || ''} onChange={(e) => setId('secondary_category', e.target.value || null)}><option value="">— tidak ada —</option>{(vocab?.categories || []).filter((c) => c.code !== primary).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</select></Field>
        <Field label="Jenis usaha khusus (opsional)" hint="Bila tidak ada di daftar"><input disabled={disabled} maxLength={60} value={d.identity?.custom_label || ''} onChange={(e) => setId('custom_label', e.target.value)} placeholder="mis. Toko oleh-oleh khas" /></Field>
      </div>}
    </div>
  );
}
