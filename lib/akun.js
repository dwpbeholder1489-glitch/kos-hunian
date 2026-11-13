// Validasi pendaftaran akun (dipakai di formulir; kata sandi & email tetap diperiksa lagi oleh layanan autentikasi)
export const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());
// Nomor WhatsApp Indonesia: 08xx / 628xx / +628xx, total 10–13 angka sesudah awalan 0
export const waNorm = (v) => { const d = String(v || '').replace(/[^\d]/g, ''); return d.startsWith('62') ? '0' + d.slice(2) : d.startsWith('8') ? '0' + d : d; };
export const waOk = (v) => /^08[1-9]\d{7,10}$/.test(waNorm(v));
// 0 = terlalu pendek, 1 = lemah, 2 = sedang (syarat minimum), 3 = kuat
export const pwScore = (p) => {
  const s = String(p || '');
  if (s.length < 8) return 0;
  const letter = /[A-Za-z]/.test(s), digit = /\d/.test(s);
  if (!letter || !digit) return 1;
  const mixed = /[a-z]/.test(s) && /[A-Z]/.test(s), symbol = /[^A-Za-z0-9]/.test(s);
  return s.length >= 12 || (mixed && symbol) || (s.length >= 10 && (mixed || symbol)) ? 3 : 2;
};
// Pesan galat autentikasi dalam bahasa sehari-hari
export const authMsg = (error) => {
  const m = String(error?.message || '');
  if (/Invalid login/i.test(m)) return 'Email atau kata sandi salah.';
  if (/already registered|already been registered/i.test(m)) return 'Email ini sudah terdaftar. Silakan masuk atau atur ulang kata sandi.';
  if (/rate limit|too many|security purposes|only request this after/i.test(m)) return 'Terlalu sering mencoba. Tunggu sekitar satu menit, lalu coba lagi.';
  if (/password.*(short|least|weak)|weak password/i.test(m)) return 'Kata sandi terlalu lemah. Pakai minimal 8 karakter dengan huruf dan angka.';
  if (/same password|different from the old/i.test(m)) return 'Kata sandi baru harus berbeda dari yang lama.';
  if (/invalid.*email|email.*invalid/i.test(m)) return 'Alamat email tidak dikenali. Periksa lagi penulisannya.';
  if (/signups? not allowed|disabled/i.test(m)) return 'Pendaftaran sedang ditutup sementara. Coba lagi nanti.';
  if (/fetch|network/i.test(m)) return 'Koneksi internet terputus. Periksa jaringan, lalu coba lagi.';
  if (/expired|invalid.*token|otp/i.test(m)) return 'Tautan sudah tidak berlaku. Minta tautan baru.';
  return 'Belum berhasil. Coba lagi sebentar; bila tetap gagal, hubungi bantuan PRASARA.';
};
