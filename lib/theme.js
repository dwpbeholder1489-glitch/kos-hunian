// Tema tampilan: disimpan di perangkat (localStorage). Dipasang sebelum halaman tampil agar tidak berkedip.
export const THEME_KEY = 'prasara-theme';
export const themeScript = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;
