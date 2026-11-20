// Tema tampilan: TERANG = bawaan (Unified Design System, 20 Nov 2026); 'dark' atau 'auto' (ikuti HP) disimpan di perangkat.
// Juga memulihkan sidebar desktop yang diciutkan ('prasara-side' = 'mini'). Dipasang sebelum halaman tampil agar tidak berkedip.
export const THEME_KEY = 'prasara-theme';
export const SIDE_KEY = 'prasara-side';
// Landing page: kunci terpisah dari tema aplikasi
export const LN_THEME_KEY = 'prasara-ln-theme';
export const themeScript = `try{var d=document.documentElement,t=localStorage.getItem('${THEME_KEY}');d.dataset.theme=(t==='dark'||t==='auto')?t:'light';if(localStorage.getItem('${SIDE_KEY}')==='mini')d.dataset.side='mini';if(localStorage.getItem('${LN_THEME_KEY}')==='light')d.dataset.ln='light'}catch(e){document.documentElement.dataset.theme='light'}`;
