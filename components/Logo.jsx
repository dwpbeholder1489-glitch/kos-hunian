// Logo PRASARA: huruf P miring dua warna (emerald + mint). SVG murni, tanpa gradien; dipakai di aplikasi, landing, dan ikon.
export function LogoMark({ size = 30, className = '', title }) {
  return (
    <svg className={'logomark ' + className} width={size} height={size} viewBox="0 0 48 48" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      <g transform="skewX(-14) translate(9 0)">
        <path d="M8 6h9v36H8z" fill="var(--logo-1,#3DD68C)" />
        <path d="M19 6h11a12 12 0 0 1 0 24h-11v-8h11a4 4 0 0 0 0-8h-11z" fill="var(--logo-2,#A7F3CB)" />
        <path d="M8 34h9v8H8z" fill="var(--logo-3,#22A86A)" />
      </g>
    </svg>
  );
}

export default function Logo({ size = 30, sub = true, className = '' }) {
  return (
    <span className={'logo ' + className}>
      <LogoMark size={size} />
      <span className="logo-t"><b>PRASARA</b>{sub && <small>Adaptive Business System</small>}</span>
    </span>
  );
}
