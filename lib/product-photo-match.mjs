const STOP = new Set(['produk', 'baru', 'kemasan', 'berat', 'bersih', 'netto', 'isi', 'rasa', 'variant', 'varian', 'dengan', 'untuk', 'dari', 'oleh', 'made', 'in', 'the', 'yang', 'dan', 'pcs', 'dus', 'pack', 'sachet', 'renteng']);

function standardSize(value, unit) {
  const amount = Number(value.replace(',', '.'));
  const volume = ['l', 'liter', 'ltr', 'ml', 'mililiter'].includes(unit);
  const multiplier = ['kg', 'kilogram', 'l', 'liter', 'ltr'].includes(unit) ? 1000 : 1;
  return `${Math.round(amount * multiplier * 1000) / 1000}${volume ? 'ml' : 'g'}`;
}

export function normalizePackagingText(value) {
  return String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/\b(\d+(?:[.,]\d+)?)\s*(mililiter|kilogram|liter|gram|ltr|kg|ml|gr|g|l)\b/g, (_, value, unit) => standardSize(value, unit))
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

const isSize = (word) => /^\d+(?:g|ml)$/.test(word);
const words = (text) => new Set(text.split(' ').filter((word) => word.length >= 2 && !STOP.has(word)));

function oneEdit(a, b) {
  if (a.length < 5 || b.length < 5 || a[0] !== b[0] || Math.abs(a.length - b.length) > 1 || /\d/.test(a + b)) return false;
  if (a.length > b.length) [a, b] = [b, a];
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; }
    else {
      if (++edits > 1) return false;
      if (a.length === b.length) i++;
      j++;
    }
  }
  return edits + b.length - j <= 1;
}

export function matchProductPhoto(ocrText, products, { limit = 8 } = {}) {
  const text = normalizePackagingText(String(ocrText ?? '').slice(0, 8000));
  const observed = [...words(text)].slice(0, 180);
  if (!observed.length) return [];
  const observedSet = new Set(observed);
  const observedSizes = observed.filter(isSize);
  const indexed = products.filter((product) => product.active !== false).map((product) => {
    const names = [product.name, ...(product.packaging_aliases || [])].map(normalizePackagingText).filter(Boolean);
    return { product, names, brand: words(normalizePackagingText(product.brand)) };
  });
  const frequency = new Map();
  for (const { names, brand } of indexed) {
    const vocabulary = new Set([...names.flatMap((name) => [...words(name)]), ...brand]);
    for (const token of vocabulary) frequency.set(token, (frequency.get(token) || 0) + 1);
  }

  const candidates = [];
  for (const { product, names, brand } of indexed) {
    let best = null;
    for (const name of names) {
      const tokens = [...words(name)];
      if (!tokens.length) continue;
      const exact = tokens.filter((token) => observedSet.has(token));
      const approximate = tokens.filter((token) => !observedSet.has(token) && observed.some((word) => oneEdit(token, word)));
      const phrase = name.length >= 4 && ` ${text} `.includes(` ${name} `);
      const identifying = exact.filter((token) => !brand.has(token) && !isSize(token));
      const brandMatch = [...brand].some((token) => observedSet.has(token));
      if (!phrase && !identifying.length && !(approximate.length && (exact.length || brandMatch))) continue;
      const localSizes = tokens.filter(isSize);
      const contradictorySize = localSizes.some((size) =>
        observedSizes.some((seen) => isSize(seen) && seen.endsWith(size.endsWith('ml') ? 'ml' : 'g')) && !observedSet.has(size));
      const weighted = exact.reduce((total, token) => total + (isSize(token) ? 2.5 : 1 + 1 / frequency.get(token)), 0);
      const coverage = (exact.length + approximate.length * 0.5) / tokens.length;
      const score = weighted + approximate.length * 0.45 + coverage * 4 + (phrase ? 5 : 0) + (brandMatch ? 1 : 0) - (contradictorySize ? 5 : 0);
      if (score > 0 && (!best || score > best.score)) best = { product, score, matched: exact.slice(0, 6) };
    }
    if (best) candidates.push(best);
  }
  return candidates.sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name)).slice(0, limit);
}
