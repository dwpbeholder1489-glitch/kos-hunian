-- Perkaya rekomendasi yang sama untuk pemilih barang dan Saran Belanja.
do $$
declare
  body text := pg_get_functiondef('public.reorder_guidance(uuid,int)'::regprocedure);
begin
  if position('as unit_price, pref.moq' in body) = 0
     or position('when order_in = 0 then' in body) = 0 then
    raise exception 'Definisi reorder_guidance tidak sesuai';
  end if;
  body := replace(body, 'as unit_price, pref.moq', 'as unit_price, pref.moq,
      actual.price as last_price, actual.unit as last_unit, actual.purchase_date as last_date');
  body := replace(body, ') last on pref.contact_id is null', ') last on pref.contact_id is null
    left join lateral (
      select l.price, l.unit, b.purchase_date
      from purchase_lines l join purchases b on b.id = l.purchase_id and b.kos_id = p_kos
      where l.kos_id = p_kos and l.product_id = p.id and l.qty_received > 0 and b.status in (''selesai'',''sebagian'')
      order by (coalesce(b.branch_id, v_main) = v_branch) desc, b.purchase_date desc, b.created_at desc, l.id
      limit 1
    ) actual on true');
  body := replace(body, 'when order_in = 0 then',
    'when coalesce(ceil(moq),0) > ceil(need / unit_qty)
          and coalesce(ceil(moq),0) * unit_qty - need > rate * 30 then ''check_moq''
        when order_in = 0 then');
  body := replace(body, '''supplier_id'', r.supplier_id,', '''supplier_id'', r.supplier_id,
      ''last_price'', r.last_price, ''last_unit'', r.last_unit, ''last_date'', r.last_date,');
  execute body;
end $$;
