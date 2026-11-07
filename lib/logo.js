// Logo bisnis disimpan di Supabase Storage (bucket publik "logo"); database hanya menyimpan path-nya.
export const logoUrl = (path) => (path && process.env.NEXT_PUBLIC_SUPABASE_URL ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/logo/${path}` : null);
