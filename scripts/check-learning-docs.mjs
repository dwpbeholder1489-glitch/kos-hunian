import { execFileSync } from 'node:child_process';

const base = process.argv[2];
if (!base) {
  console.error('Gunakan node scripts/check-learning-docs.mjs <commit-dasar> [commit-akhir]');
  process.exit(1);
}

const files = execFileSync('git', ['diff', '--name-only', base, process.argv[3] || 'HEAD', '--'], { encoding: 'utf8' }).trim().split('\n');
const handbook = 'app/panduan/page.jsx';
const pageGuides = 'lib/guide.js';
const knowledge = 'lib/help.js';
const documentation = [handbook, pageGuides, knowledge];
const productChanged = files.some((file) =>
  /^(app\/|components\/|lib\/|supabase\/migrations\/)/.test(file)
  && !documentation.includes(file)
  && /\.(js|jsx|mjs|ts|tsx|sql|css)$/.test(file)
);

if (productChanged) {
  const missing = documentation.filter((file) => !files.includes(file));
  if (missing.length) {
    console.error('Sertakan pembaruan materi, panduan, dan basis pengetahuan bersama perubahan PRASARA:');
    missing.forEach((file) => console.error(' - ' + file));
    process.exit(1);
  }
}
