// Teks biasa dengan alamat https://… yang bisa diketuk (aman: tanpa HTML mentah, hanya http/https).
const RE = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;
export default function Linkify({ text }) {
  if (!text) return null;
  return String(text).split(RE).map((part, i) => (i % 2 === 1
    ? <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" style={{ wordBreak: 'break-all' }}>{part}</a>
    : part));
}
