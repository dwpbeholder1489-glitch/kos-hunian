-- Satuan barang: boleh pecahan (mis. "¼ kg" isi 0,25 kg untuk barang curah), satuan terkecil wajib diisi,
-- dan isi satuan berat/volume diperiksa (mis. "250 gram" pada barang ber-satuan kg harus isi 0,25 — bukan 250).

-- Ukuran satuan berat (gram) / volume (ml); null bila bukan satuan berat/volume
create or replace function public.unit_measure(p_name text, out dim text, out size numeric)
language plpgsql immutable as $$
declare s text := lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g')); m text[]; n numeric; u text;
begin
  m := regexp_match(s, '^(¼|½|¾|1/4|1/2|3/4|setengah|seperempat|[0-9]+(?:[.,][0-9]+)?)? ?([a-z]+)$');
  if m is null then return; end if;
  u := m[2];
  n := case m[1] when '¼' then 0.25 when '1/4' then 0.25 when 'seperempat' then 0.25 when '½' then 0.5 when '1/2' then 0.5 when 'setengah' then 0.5
         when '¾' then 0.75 when '3/4' then 0.75 when null then 1 else replace(m[1], ',', '.')::numeric end;
  if m[1] is null then n := 1; end if;
  if u in ('kg', 'kilo', 'kilogram') then dim := 'm'; size := n * 1000;
  elsif u in ('gram', 'gr', 'g') then dim := 'm'; size := n;
  elsif u = 'ons' then dim := 'm'; size := n * 100;
  elsif u in ('liter', 'ltr', 'l') then dim := 'v'; size := n * 1000;
  elsif u in ('ml', 'mililiter') then dim := 'v'; size := n;
  end if;
end $$;

create or replace function public._prasara_patch(p_sig text, p_old text, p_new text)
returns void language plpgsql as $$
declare d text;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_old in d) = 0 then raise exception 'patch %: potongan tidak ditemukan', p_sig; end if;
  execute replace(d, p_old, p_new);
end $$;

select public._prasara_patch('public.product_save(uuid,uuid,text,text,numeric,numeric,jsonb,numeric,text)',
  'v_code text; v_other text;',
  'v_code text; v_other text; v_q numeric; mb record; mu record;');
select public._prasara_patch('public.product_save(uuid,uuid,text,text,numeric,numeric,jsonb,numeric,text)',
  'if coalesce(trim(p_name), '''') = '''' then raise exception ''Nama barang wajib diisi''; end if;',
  'if coalesce(trim(p_name), '''') = '''' then raise exception ''Nama barang wajib diisi''; end if;
  if coalesce(trim(p_base), '''') = '''' then raise exception ''Isi satuan terkecil (mis. pcs, kg, liter)''; end if;
  select * into mb from unit_measure(v_base);');
select public._prasara_patch('public.product_save(uuid,uuid,text,text,numeric,numeric,jsonb,numeric,text)',
  'if lower(trim(u->>''name'')) = any(v_names) then raise exception ''Nama satuan "%" dobel'', trim(u->>''name''); end if;',
  'if i > 0 and lower(trim(u->>''name'')) = lower(v_base) then raise exception ''Nama satuan "%" sama dengan satuan terkecil. Beri nama lain, mis. "½ %"'', trim(u->>''name''), v_base; end if;
    if lower(trim(u->>''name'')) = any(v_names) then raise exception ''Nama satuan "%" dobel'', trim(u->>''name''); end if;');
select public._prasara_patch('public.product_save(uuid,uuid,text,text,numeric,numeric,jsonb,numeric,text)',
  'if i > 0 and coalesce((u->>''qty'')::numeric, 0) <= 1 then raise exception ''Isi satuan "%" harus lebih dari 1 %'', trim(u->>''name''), v_base; end if;',
  'if i > 0 then
      v_q := coalesce((u->>''qty'')::numeric, 0);
      if v_q <= 0 then raise exception ''Isi satuan "%" harus lebih dari 0 %'', trim(u->>''name''), v_base; end if;
      if v_q = 1 then raise exception ''Isi satuan "%" = 1 % sama dengan satuan terkecil. Hapus atau ubah isinya.'', trim(u->>''name''), v_base; end if;
      if v_q <> round(v_q, 3) or v_q > 100000 then raise exception ''Isi satuan "%" maksimal 3 angka di belakang koma'', trim(u->>''name''); end if;
      select * into mu from unit_measure(u->>''name'');
      if mb.dim is not null and mu.dim = mb.dim and abs(mu.size / mb.size - v_q) > greatest(0.001, mu.size / mb.size * 0.005) then
        raise exception ''Satuan "%" = % %, bukan % %. Perbaiki isinya.'', trim(u->>''name''), replace(rtrim(rtrim(to_char(mu.size / mb.size, ''FM999999990.999''), ''0''), ''.''), ''.'', '',''), v_base,
          replace(rtrim(rtrim(to_char(v_q, ''FM999999990.999''), ''0''), ''.''), ''.'', '',''), v_base;
      end if;
    end if;');

drop function public._prasara_patch(text, text, text);
