// Posisi pengguna dalam perjalanan pendaftaran: Akun → Verifikasi → Bisnis → Konfigurasi → Mulai
const S = ['Akun', 'Verifikasi', 'Bisnis', 'Konfigurasi', 'Mulai'];
export default function Journey({ at }) {
  return (
    <ol className="journey" aria-label={`Langkah ${at + 1} dari ${S.length}: ${S[at]}`}>
      {S.map((s, i) => <li key={s} className={i < at ? 'done' : i === at ? 'on' : ''} aria-current={i === at ? 'step' : undefined}><i aria-hidden="true">{i < at ? '✓' : i + 1}</i><span>{s}</span></li>)}
    </ol>
  );
}
