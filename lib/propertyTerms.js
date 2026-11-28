// Istilah adaptif per jenis properti (subkategori bisnis). SATU tempat: menu, dashboard, judul halaman memakai ini.
// Mesin & data tetap sama (rooms, occupants, leases, bookings) — hanya kata yang tampil yang berbeda.
// Diuji: node supabase/tests/properti_adaptif_js.mjs.
const BASE = { key: 'kos', name: 'Kos', unit: 'Kamar', tenant: 'Penghuni', lease: 'Sewa', booking: 'Booking', place: 'Properti', short: 'kos' };
const TYPES = {
  kos: BASE,
  rumah: { ...BASE, key: 'rumah', name: 'Rumah sewa & kontrakan', unit: 'Unit', tenant: 'Penyewa', lease: 'Kontrak sewa', short: 'kontrakan' },
  apartemen: { ...BASE, key: 'apartemen', name: 'Apartemen', unit: 'Unit', tenant: 'Penyewa', lease: 'Kontrak sewa', short: 'apartemen' },
  komersial: { ...BASE, key: 'komersial', name: 'Ruko & gedung komersial', unit: 'Unit', tenant: 'Penyewa', lease: 'Kontrak sewa', place: 'Gedung', short: 'gedung' },
  inap: { ...BASE, key: 'inap', name: 'Penginapan', unit: 'Kamar', tenant: 'Tamu', lease: 'Menginap', booking: 'Reservasi', short: 'penginapan' },
  villa: { ...BASE, key: 'villa', name: 'Villa', unit: 'Unit', tenant: 'Tamu', lease: 'Menginap', booking: 'Reservasi', short: 'villa' },
  pengelola: { ...BASE, key: 'pengelola', name: 'Pengelolaan properti', unit: 'Unit', tenant: 'Penyewa', lease: 'Kontrak sewa', short: 'properti' },
};
const BY_SUB = {
  properti_kos: 'kos', properti_kontrakan: 'rumah', properti_rumah: 'rumah', properti_apartemen: 'apartemen', hospitality_serviced: 'apartemen',
  properti_ruko: 'komersial', properti_gedung: 'komersial', properti_pengelola: 'pengelola', properti_homestay: 'inap',
  hospitality_homestay: 'inap', hospitality_guesthouse: 'inap', hospitality_hostel: 'inap', hospitality_penginapan: 'inap', hospitality_hotel: 'inap',
  hospitality_boutique: 'inap', hospitality_resort: 'inap', kuliner_penginapan: 'inap', travel_penginapan: 'inap', hospitality_villa: 'villa',
};
export function termsFor(kos) {
  const sub = kos?.subcategory_code;
  const key = BY_SUB[sub] || (kos?.category_code === 'hospitality' ? 'inap' : 'kos');
  return TYPES[key];
}
// Ganti kata "kamar"/"penghuni" pada label menu sesuai jenis (hanya bila istilahnya berbeda)
export function relabel(label, t) {
  if (!label || !t || t.key === 'kos') return label;
  return label.replace(/Kamar/g, t.unit).replace(/kamar/g, t.unit.toLowerCase()).replace(/Penghuni/g, t.tenant).replace(/penghuni/g, t.tenant.toLowerCase())
    .replace(/^Booking/, t.booking).replace(/ booking/, ' ' + t.booking.toLowerCase());
}
