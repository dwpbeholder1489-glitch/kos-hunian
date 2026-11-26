-- Publikasikan semua produk aktif TOKO SUBUR lewat pengaturan katalog yang sudah ada.
update public.public_pages as page
set catalog_mode = 'semua', updated_at = now()
from public.kos as business
where page.kos_id = business.id
  and page.slug = 'toko-subur'
  and page.enabled
  and page.catalog_mode = 'favorit'
  and business.business_type = 'retail'
  and lower(trim(business.name)) = 'toko subur';
