-- Kos: sambungan pendaftaran → portal penghuni & halaman bisnis.
-- Masalah yang diperbaiki:
-- 1) Modul Portal penghuni (p_portal) tidak ada di template kos → kos yang daftar lewat /mulai portalnya terkunci
--    dan kotak "Portal penghuni" tidak muncul di detail penghuni. Sekarang disarankan saat setup (tetap butuh persetujuan pemilik).
-- 2) Data cara bayar & peraturan dari pendaftaran tidak sampai ke portal (portal membaca kos.payment_info/house_rules).
--    Template kos sekarang menanyakan rekening/cara bayar dan peraturan, langsung dipetakan ke kolom yang dipakai portal;
--    metode & aturan pembayaran dari profil ikut ditampilkan di portal.

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;

-- setup_apply: tujuan baru kos.payment_info & kos.house_rules
select public._prasara_patch('public.setup_apply(uuid)',
  '  elsif v_apply = ''kos.contact_phone'' then update kos set contact_phone = it.value->>''v'' where id = k.id;',
  '  elsif v_apply = ''kos.contact_phone'' then update kos set contact_phone = it.value->>''v'' where id = k.id;
  elsif v_apply = ''kos.payment_info'' then update kos set payment_info = nullif(trim(it.value->>''v''), '''') where id = k.id;
  elsif v_apply = ''kos.house_rules'' then update kos set house_rules = nullif(trim(it.value->>''v''), '''') where id = k.id;');

-- portal: tampilkan juga metode & aturan bayar dari profil (diisi saat pendaftaran)
select public._prasara_patch('public.portal_get(text)',
  '''payment_info'', k.payment_info, ''house_rules'', k.house_rules, ''qris'', k.qris_image),',
  '''payment_info'', k.payment_info, ''house_rules'', k.house_rules, ''qris'', k.qris_image,
                              ''payment_methods'', k.profile->''payment_methods'', ''payment_rules'', k.profile->>''payment_rules''),');
-- 3) Akhiri sewa dengan tanggal keluar di masa depan dulu langsung mengosongkan kamar (bisa dibooking/dipesan orang lain
--    padahal penghuni masih tinggal, portal penghuni bilang "sewa berakhir"). Tanggal yang akan datang = Rencana selesai.
select public._prasara_patch('public.end_lease(uuid,date,text)',
  '  if p_end < l.start_date then',
  '  if p_end > (now() at time zone ''Asia/Jakarta'')::date then
    raise exception ''Tanggal keluar belum tiba. Selama penghuni masih tinggal, isi "Rencana selesai" di detail penghuni; akhiri sewa saat penghuni benar-benar keluar.'';
  end if;
  if p_end < l.start_date then');
drop function public._prasara_patch(text, text, text);

-- template kos: + rekening/cara bayar, + peraturan, + modul portal penghuni disarankan
update public.biz_templates t set spec = jsonb_set(t.spec, '{items}', (t.spec->'items') || jsonb_build_array(
    jsonb_build_object('code', 'rekening', 'kind', 'info', 'label', 'Rekening / cara bayar untuk penghuni',
      'help', 'Mis. BCA 1234567 a.n. Dewi. Tampil di portal penghuni saat membayar.', 'input', 'longtext', 'must', 'optional', 'apply', 'kos.payment_info'),
    jsonb_build_object('code', 'peraturan', 'kind', 'info', 'label', 'Peraturan kos',
      'help', 'Mis. jam malam, tamu, kebersihan. Tampil di portal penghuni.', 'input', 'longtext', 'must', 'optional', 'apply', 'kos.house_rules')))
where t.code = 'kos' and not exists (select 1 from jsonb_array_elements(t.spec->'items') e where e->>'code' = 'rekening');
update public.biz_templates t set spec = jsonb_set(t.spec, '{modules}', (t.spec->'modules') || '["p_portal"]'::jsonb)
where t.code = 'kos' and not (t.spec->'modules') ? 'p_portal';
