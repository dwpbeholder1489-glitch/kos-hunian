// Tema tampilan: disimpan di perangkat (localStorage). Dipasang sebelum halaman tampil agar tidak berkedip.
export const THEME_KEY = 'prasara-theme';
// Landing page: gelap sebagai tampilan utama; terang hanya bila pengunjung memilihnya (kunci terpisah dari tema aplikasi)
export const LN_THEME_KEY = 'prasara-ln-theme';
export const themeScript = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;if(localStorage.getItem('${LN_THEME_KEY}')==='light')document.documentElement.dataset.ln='light'}catch(e){}`;
