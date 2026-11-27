export const PAPER = ['58', '80', 'A4'];

export function printLines(text, columns) {
  return text.replace(/\r\n?/g, '\n').replace(/\t/g, '  ').split('\n')
    .flatMap((line) => {
      const chars = Array.from(line);
      const rows = [];
      for (let i = 0; i < chars.length; i += columns) rows.push(chars.slice(i, i + columns).join(''));
      return rows.length ? rows : [''];
    });
}

export function escpos(text, paper, cut) {
  const safe = text.normalize('NFKD').replace(/\p{Mark}/gu, '')
    .replace(/[–—−]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/·/g, '.')
    .replace(/[^\x20-\x7e\r\n\t]/gu, '?');
  const body = printLines(safe, paper === '80' ? 48 : 32).join('\n');
  return new TextEncoder().encode('\x1b@\x1bM\x00' + body + '\n\n\n\n' + (cut ? '\x1dV\x00' : ''));
}
