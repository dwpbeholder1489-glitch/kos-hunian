const bannerFonts = [
  './node_modules/@fontsource/inter/files/inter-latin-400-normal.woff',
  './node_modules/@fontsource/inter/files/inter-latin-700-normal.woff',
];

export default {
  outputFileTracingIncludes: {
    '/api/link-banner': bannerFonts,
    '/api/link-banner/image': bannerFonts,
  },
};
