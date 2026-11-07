-- Halaman bisnis: tautan tambahan (mis. lokasi Google Maps, Instagram, foto kamar di Google Drive), maks 6.
-- Hanya http/https; label & alamat dibersihkan server.
alter table public.public_pages add column if not exists links jsonb not null default '[]';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'public_pages_links_check') then
    alter table public.public_pages add constraint public_pages_links_check check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 6);
  end if;
end $$;

create or replace function public.page_links_clean(p jsonb)
returns jsonb language plpgsql immutable as $$
declare x jsonb; v_url text; v_label text; out jsonb := '[]';
begin
  if p is null or jsonb_typeof(p) <> 'array' then return '[]'; end if;
  for x in select * from jsonb_array_elements(p) loop
    v_url := trim(coalesce(x->>'url', ''));
    v_label := left(trim(regexp_replace(coalesce(x->>'label', ''), '\s+', ' ', 'g')), 40);
    if v_url = '' then continue; end if; -- baris yang belum diisi alamatnya diabaikan
    if v_url !~* '^https?://' and v_url ~* '^[a-z0-9-]+(\.[a-z0-9-]+)+(/|$)' then v_url := 'https://' || v_url; end if; -- "maps.app.goo.gl/xx" → https://
    if v_url !~* '^https?://[^\s/$.?#][^\s]*$' or length(v_url) > 300 then
      raise exception 'Tautan "%" tidak valid. Salin alamat lengkap yang diawali https://', left(v_url, 60);
    end if;
    if v_label = '' then
      v_label := case when v_url ~* '(maps\.app\.goo\.gl|google\.[a-z.]+/maps|goo\.gl/maps)' then 'Lokasi (Google Maps)'
                      when v_url ~* 'instagram\.com' then 'Instagram' when v_url ~* 'tiktok\.com' then 'TikTok'
                      when v_url ~* '(facebook\.com|fb\.com)' then 'Facebook' when v_url ~* '(drive\.google|photos\.app\.goo\.gl|photos\.google)' then 'Foto'
                      when v_url ~* '(youtube\.com|youtu\.be)' then 'Video' else 'Tautan' end;
    end if;
    out := out || jsonb_build_array(jsonb_build_object('label', v_label, 'url', v_url));
  end loop;
  if jsonb_array_length(out) > 6 then raise exception 'Maksimal 6 tautan'; end if;
  return out;
end $$;

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;

select public._prasara_patch('public.public_page_save(uuid,jsonb)',
  'policy, form_intro, email_notify, published_at, updated_at, updated_by)',
  'policy, form_intro, email_notify, published_at, updated_at, updated_by, links)');
select public._prasara_patch('public.public_page_save(uuid,jsonb)',
  'case when v_on then now() end, now(), actor_email())',
  'case when v_on then now() end, now(), actor_email(), page_links_clean(p->''links''))');
select public._prasara_patch('public.public_page_save(uuid,jsonb)',
  'updated_at = now(), updated_by = excluded.updated_by;',
  'updated_at = now(), updated_by = excluded.updated_by, links = excluded.links;');
select public._prasara_patch('public.public_page_view(text)',
  '''policy'', pg.policy,',
  '''policy'', pg.policy, ''links'', pg.links,');

drop function public._prasara_patch(text, text, text);
