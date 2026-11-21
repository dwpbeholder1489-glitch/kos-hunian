// Alur kerja (Adaptive Experience Fase 4): label & kalimat aturan. Semua aturan DITEGAKKAN di server
// (wf_check lewat trigger svc_orders & bb_record_move); file ini hanya untuk tampilan.
import { rp } from '@/lib/format';

export const STEP_STATE = {
  berjalan: ['Berjalan', 'good'],
  otomatis: ['Otomatis', 'info'],
  belum_dipakai: ['Belum dipakai', 'void'],
  menunggu: ['Menunggu data', 'void'],
  belum_diatur: ['Belum diatur', 'warn'],
  nonaktif: ['Fitur nonaktif', 'warn'],
};

export const ACTIONS = {
  tolak: ['Tidak diizinkan', 'Karyawan tidak bisa melakukan langkah ini.'],
  persetujuan: ['Perlu persetujuan pemilik', 'Karyawan mengirim permintaan; langkah dijalankan setelah disetujui.'],
  catatan: ['Wajib catatan', 'Karyawan harus menulis catatan (mis. nama penerima).'],
};

export const CONDS = {
  belum_lunas: 'masih ada sisa bayar',
  sudah_bayar: 'sudah ada pembayaran',
  total_min: 'total minimal',
  total_max: 'total maksimal',
  antar: 'Cara serah',
  fields: 'isian catatan',
};

export const OPS = [['<', 'kurang dari'], ['<=', 'paling banyak'], ['>', 'lebih dari'], ['>=', 'minimal'], ['=', 'sama dengan'], ['!=', 'bukan'], ['isi', 'sudah diisi'], ['kosong', 'masih kosong']];
export const opLabel = (op) => (OPS.find(([k]) => k === op) || [op, op])[1];

export const KIND = { atur: ['Bisa diatur', 'gold'], standar: ['Standar', 'void'], kustom: ['Kustom', 'info'] };

export const RECO_KIND = { alur: 'Alur', aturan: 'Aturan', evaluasi: 'Evaluasi', proses: 'Proses' };

// Kalimat aturan: "Bila <langkah> dan <syarat> → <tindakan>"
export function condText(cond, fields = []) {
  const c = cond || {};
  const out = [];
  if (c.belum_lunas) out.push('masih ada sisa bayar');
  if (c.sudah_bayar) out.push('sudah ada pembayaran');
  if (c.total_min != null) out.push(`total ≥ ${rp(c.total_min)}`);
  if (c.total_max != null) out.push(`total ≤ ${rp(c.total_max)}`);
  if (c.antar === true) out.push('diantar');
  if (c.antar === false) out.push('diambil sendiri');
  for (const f of c.fields || []) {
    const fl = fields.find((x) => x.key === f.key);
    const nm = fl?.label || f.key;
    const val = f.op === 'isi' || f.op === 'kosong' ? '' : ` ${fl?.type === 'currency' ? rp(f.value) : f.value}`;
    out.push(`${nm} ${opLabel(f.op)}${val}`);
  }
  return out;
}

export function ruleText(rule, points = [], fields = []) {
  const pt = points.find((p) => String(p.code) === String(rule.point));
  const conds = condText(rule.cond, fields);
  return `Bila ${(pt?.label || rule.point).toLowerCase()}${conds.length ? ` dan ${conds.join(', ')}` : ''} → ${(ACTIONS[rule.action] || [rule.action])[0].toLowerCase()}`;
}

export const tglJam = (ts) => (ts ? new Date(ts).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }) : '—');
