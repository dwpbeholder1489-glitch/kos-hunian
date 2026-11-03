// Ikon garis gaya Lucide (inline SVG, tanpa dependensi)
const P = {
  home: ['M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
  bed: ['M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6', 'M3 18h18', 'M3 21v-3', 'M21 21v-3', 'M7 10V8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2'],
  users: ['M2 21v-1a6 6 0 0 1 12 0v1', 'M16 3.5a4 4 0 0 1 0 7.5', 'M22 21v-1a6 6 0 0 0-4-5.6', { c: [9, 8, 4] }],
  receipt: ['M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z', 'M9 8h6', 'M9 12h6', 'M9 16h3'],
  wallet: ['M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3', 'M21 11h-5a2 2 0 0 0 0 4h5z'],
  split: ['M12 3v18', 'M5 8h4', 'M15 16h4', { c: [12, 12, 9] }],
  message: ['M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.9A8 8 0 1 1 21 12z', 'M8.5 12h.01', 'M12 12h.01', 'M15.5 12h.01'],
  out: ['M12 3v12', 'm7 10 5 5 5-5', 'M5 21h14'],
  chart: ['M3 3v18h18', 'M7 15v2', 'M11 11v6', 'M15 7v10', 'M19 12v5'],
  file: ['M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z', 'M14 3v5h5', 'M9 13h6', 'M9 17h6'],
  sheet: ['M4 4h16v16H4z', 'M4 10h16', 'M4 15h16', 'M10 4v16'],
  link: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
  sparkles: ['M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z', 'M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z'],
  notebook: ['M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z', 'M9 8h5', 'M9 12h5', 'M18 8h2', 'M18 12h2'],
  clock: [{ c: [12, 12, 9] }, 'M12 7v5l3 2'],
  trend: ['M3 7l6 6 4-4 8 8', 'M21 11v6h-6'],
  shield: ['M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z', 'm9 12 2 2 4-4'],
  globe: [{ c: [12, 12, 9] }, 'M3 12h18', 'M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18'],
  phone: ['M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z', 'M11 18h2'],
  lock: ['M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  headset: ['M4 15v-3a8 8 0 0 1 16 0v3', 'M4 15h3v5H5a1 1 0 0 1-1-1z', 'M20 15h-3v5h2a1 1 0 0 0 1-1z'],
  database: ['M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z', 'M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6', 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],
  check: ['m5 12 5 5 9-10'],
  minus: ['M6 12h12'],
  arrow: ['M5 12h14', 'm13 6 6 6-6 6'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  x: ['M6 6l12 12', 'M18 6 6 18'],
  plus: ['M12 5v14', 'M5 12h14'],
};

export default function Icon({ name, size = 20, className = '', strokeWidth = 1.9 }) {
  return (
    <svg className={'ln-ico ' + className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {(P[name] || []).map((d, i) => (typeof d === 'string' ? <path key={i} d={d} /> : <circle key={i} cx={d.c[0]} cy={d.c[1]} r={d.c[2]} />))}
    </svg>
  );
}
