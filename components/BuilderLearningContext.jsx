'use client';

import { fieldsOf, FTYPES, statusesOf, useBuilder } from '@/lib/builder';

export default function BuilderLearningContext({ kosId, href, role }) {
  const { cfg, err } = useBuilder(kosId);
  if (err) return <p role="status">Konfigurasi panduan belum dapat dibaca. Anda masih dapat membuka materi dasar.</p>;
  if (!cfg) return <p className="muted">Membaca konfigurasi Business Builder…</p>;
  const key = href.split('/')[2];
  const objects = cfg.objects.filter((item) => item.active && (!key || item.key === key));
  if (!objects.length) return <p>Jenis catatan ini belum aktif.</p>;
  return <div className="stack">
    <h3>Konfigurasi yang dipakai bisnis ini</h3>
    {objects.map((item) => {
      const fields = fieldsOf(cfg, item.id).filter((field) => !field.hidden_roles?.includes(role));
      const statuses = statusesOf(cfg, item.id);
      const byId = new Map(statuses.map((status) => [status.id, status.label]));
      const allowedMoves = cfg.rules.filter((rule) => rule.object_id === item.id && byId.has(rule.to_status)
        && (role === 'pemilik' || !rule.roles?.length || rule.roles.includes(role)));
      return <details key={item.id} open={Boolean(key)}>
        <summary>{item.name}</summary>
        {fields.length > 0 && <ul>{fields.map((field) => <li key={field.key}>{field.label} · {FTYPES[field.type] || 'Isian'}{field.required ? ' · Wajib' : ''}</li>)}</ul>}
        {allowedMoves.length > 0 && <ul>{allowedMoves.map((rule, i) => <li key={rule.id || i}>{byId.get(rule.from_status) || 'Status yang diizinkan'} → {byId.get(rule.to_status)}</li>)}</ul>}
        {item.workflow && !allowedMoves.length && <p>Periksa status pekerjaan yang tersedia pada catatan. Perubahan status mengikuti izin aplikasi.</p>}
      </details>;
    })}
  </div>;
}
