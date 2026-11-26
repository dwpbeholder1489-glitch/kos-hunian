-- Pemberitahuan adalah antrean tindakan, sehingga membuka detail tidak mengeluarkan kiriman.
create function public.retail_portal_inbox(p_kos uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with access as (
    select id from kos where id = p_kos and business_type = 'retail' and member_in('sell', p_kos)
  ), inbox as (
    select o.id, o.number, o.portal_kind as kind, o.total, c.name as customer, o.created_at, 'order'::text as target
    from access a join so_orders o on o.kos_id = a.id
    left join contacts c on c.id = o.contact_id and c.kos_id = a.id
    where o.source = 'portal' and o.status = 'penawaran'
    union all
    select l.id, l.number, 'permintaan', l.est_value, l.name, l.created_at, 'lead'
    from access a join crm_leads l on l.kos_id = a.id
    where l.source = 'halaman' and l.stage not in ('jadi', 'batal') and l.ref_id is null
  )
  select coalesce(jsonb_agg(to_jsonb(inbox) order by created_at desc, id), '[]'::jsonb) from inbox;
$$;
revoke execute on function public.retail_portal_inbox(uuid) from public, anon;
grant execute on function public.retail_portal_inbox(uuid) to authenticated;
