'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useKos } from './KosProvider';
import Dashboard, { Widget, Alerts, useDashPrefs } from './Dashboard';
import NavIcon from './NavIcon';
import Persiapan from './Persiapan';
import { Loading } from './ui';
import { supabase } from '@/lib/supabase';
import { canArea, moduleOn, tabsFor } from '@/lib/business';
import { rp, tgl } from '@/lib/format';
import { jakartaDate, stageLabel } from '@/lib/jasa';
import { isLow } from '@/lib/retail';
import { tableState } from '@/lib/tableState';
import { mediaUrl } from '@/lib/media';
import css from './FnbHome.module.css';

const modules = [['/pesanan?baru=1','Kasir'],['/pesanan','Pesanan'],['/meja','Meja'],['/layanan','Menu'],['/dapur','Dapur'],['/barang','Bahan baku'],['/belanja','Pembelian'],['/operasional','Lainnya']];
const clock = ts => new Date(ts).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'});
const dayAt = (day, offset) => new Date(Date.parse(day+'T12:00:00Z') + offset*86400000).toISOString().slice(0,10);
function Result({data,children}) {
  if (data === undefined) return <Loading rows={2} />;
  if (data === null) return <p className="small muted" role="status">Data belum dapat dimuat.</p>;
  return children;
}
function Trend({days}) {
  const max = Math.max(1,...days.map(d=>d.value));
  const points = days.map((d,i)=>[10+i*60,101-91*d.value/max]);
  return <figure className={css.trend}><svg viewBox="0 0 380 110" role="img" aria-label={days.map(d=>tgl(d.day)+' '+rp(d.value)).join(', ')}>
    {[20,48,76,102].map(y=><path key={y} d={`M10 ${y}H370`} stroke="#dee8f0" />)}
    <polygon points={`10,102 ${points.join(' ')} 370,102`} fill="#deedff" />
    <polyline points={points.join(' ')} fill="none" stroke="#2467ba" strokeWidth="3" />
    {points.map(([cx,cy],i)=><circle key={cx} cx={cx} cy={cy} r="4" fill="#1665be"><title>{tgl(days[i].day)} · {rp(days[i].value)}</title></circle>)}</svg>
    <figcaption>{days.map(d=><span key={d.day}>{d.day.slice(-2)}</span>)}</figcaption></figure>;
}
export default function FnbHome({onDetail}) {
  const {kos,kosId,user,ver} = useKos();
  const prefs = useDashPrefs('jasa');
  const [data,setData] = useState({});
  const [refresh,setRefresh] = useState(0);
  const [day,setDay] = useState(()=>jakartaDate(Date.now()));
  useEffect(()=>{const timer=setInterval(()=>setDay(jakartaDate(Date.now())),30000);return ()=>clearInterval(timer);},[]);
  const allowed = new Set(tabsFor(kos).map(([path])=>path));
  const sell = canArea(kos,'sell');
  const finance = canArea(kos,'finance');
  const stock = canArea(kos,'stock') && moduleOn(kos,'j_bahan');
  const tables = allowed.has('/meja') ? Math.min(200,Number(kos.profile?.tables)||0) : 0;
  useEffect(()=>{
    let current = true;
    setData({});
    function read(key,request,convert = x=>x) {
      Promise.resolve(request).then(({data:rows,error})=>error || rows == null ? null : convert(rows)).catch(()=>null)
        .then(value=>{if(current)setData(prior=>({...prior,[key]:value}));});
    }
    const args={p_kos:kosId};
    read('board',supabase.rpc('svc_board',args));
    if (finance) {
      read('today',supabase.rpc('svc_report',{...args,p_from:day,p_to:day}));
      read('week',supabase.rpc('svc_report',{...args,p_from:dayAt(day,-6),p_to:day}));
      read('media',supabase.rpc('media_thumbs',{...args,p_entity:'service'}));
      read('catalog',supabase.from('svc_services').select('id,name,unit,price').eq('kos_id',kosId));
    }
    if(stock) read('low',supabase.from('products').select('name,stock,min_stock').eq('kos_id',kosId).eq('active',true),rows=>rows.filter(isLow));
    if(tables && sell) read('reservations',supabase.from('kul_reservations').select('table_no,status,starts_at,minutes').eq('kos_id',kosId).in('status',['datang','dipesan']).gte('starts_at',dayAt(day,-2)+'T00:00:00+07:00').lte('starts_at',day+'T23:59:59+07:00'));
    return ()=>{current=false;};
  },[kosId,ver,day,finance,stock,tables,sell,refresh]);
  const board=data.board;
  const orders=board?.orders || [];
  const active=orders.filter(o=>!['selesai','batal'].includes(o.status));
  const states=board && data.reservations ? Array.from({length:tables},(_,i)=>tableState(board,data.reservations,i+1)) : [];
  const occupied=states.filter(s=>s.os.length || s.resv?.status==='datang').length;
  const hour=Number(clock(Date.now()).slice(0,2));
  const greeting=hour<11?'pagi':hour<15?'siang':hour<18?'sore':'malam';
  const name=user?.user_metadata?.name || user?.user_metadata?.full_name;
  const metrics=[
    finance && ['Penjualan hari ini',data.today && rp(data.today.pendapatan),'/laporan-jasa'],
    ['Pesanan aktif',board && active.length,'/pesanan'],
    tables>0 && sell && ['Meja terisi',states.length ? occupied+' / '+tables : null,'/meja'],
    stock && ['Stok menipis',data.low && data.low.length+' item','/barang']
  ].filter(Boolean);
  const sorted=[...orders].sort((a,b)=>Date.parse(b.received_at)-Date.parse(a.received_at)).slice(0,3);
  const top=[...(data.today?.layanan||[])].sort((a,b)=>b.qty-a.qty).slice(0,4);
  const days=Array.from({length:7},(_,i)=>{const d=dayAt(day,i-6);return {day:d,value:Number(data.week?.harian?.find(x=>x.d===d)?.pendapatan)||0};});
  const notice=[];
  if(data.low?.length) notice.push({tone:'warn',text:data.low.length+' bahan perlu restok · '+data.low.slice(0,3).map(x=>x.name).join(', '),href:'/barang'});
  if(active.some(o=>o.status==='siap')) notice.push({tone:'good',text:active.filter(o=>o.status==='siap').length+' pesanan siap disajikan',href:'/pesanan'});
  const shownModules=modules.filter(([h])=>(h==='/operasional'||allowed.has(h.split('?')[0])) && (h!=='/meja'||tables>0) && (!h.includes('?baru')||sell) && !kos.exp?.nav?.hidden?.includes(h.split('?')[0]));
  const action=(path,label)=>allowed.has(path) && <Link href={path}>{label} →</Link>;
  const widgets=[
    {id:'kpi',title:'Kinerja hari ini',size:'full',node:<div className={css.metrics}>{metrics.map(([label,value,icon])=><article key={label}><NavIcon name={icon}/><span>{label}</span><b>{value ?? '—'}</b></article>)}</div>},
    {id:'pintasan',title:'Operasional',size:'full',node:<div><div className={css.actions}>{sell && allowed.has('/pesanan') && <Link href="/pesanan?baru=1">＋ Buat Pesanan Baru</Link>}{tables>0 && <Link href="/meja">Buka / Kelola Meja</Link>}</div><details className={css.shortcuts}><summary>Operasional</summary><nav>{shownModules.map(([h,l])=><Link key={h} href={h}><NavIcon name={h.split('?')[0]}/>{l}</Link>)}</nav></details></div>},
    {id:'tren',title:'Grafik penjualan',node:finance && <Widget title="Grafik penjualan" action={<small>7 hari terakhir</small>}><Result data={data.week}><Trend days={days}/></Result></Widget>},
    {id:'meja',title:'Status meja',node:tables>0 && sell && <Widget title="Status meja" action={action('/meja','Lihat denah')}><Result data={board==null?board:data.reservations}><div className={css.tables}>{states.slice(0,12).map((s,i)=><Link key={i} href="/meja" data-active={s.label!=='Kosong'}><b>M{String(i+1).padStart(2,'0')}</b><small>{s.label}</small></Link>)}</div></Result></Widget>},
    {id:'pesanan',title:'Pesanan terbaru',node:<Widget title="Pesanan terbaru" action={action('/pesanan','Lihat semua')}><Result data={board}>{sorted.map(o=><div className={css.row} key={o.id}><span><b>{o.number}</b><small>{o.table_no?'Meja '+o.table_no:o.dine==='antar'?'Delivery':'Takeaway'} · {clock(o.received_at)}</small></span><span>{board?.money && rp(o.total)}<small>{stageLabel(o,true)}</small></span></div>)}{!sorted.length && <p>Belum ada pesanan.</p>}</Result></Widget>},
    {id:'layanan',title:'Menu terlaris hari ini',node:finance && <Widget title="Menu terlaris hari ini" action={action('/laporan-jasa','Lihat laporan')}><Result data={data.today}><div className={css.products}>{top.map((m,i)=>{
      const matches=data.catalog?.filter(c=>c.name===m.name && c.unit===m.unit)||[];
      const item=matches.length===1?matches[0]:null;
      const photo=item && mediaUrl(data.media?.[item.id]);
      return <div key={m.name+'-'+m.unit}><b>{i+1}</b>{photo?<img src={photo} alt="" loading="lazy"/>:<NavIcon name="/layanan"/>}<span><strong>{m.name}</strong><small>{m.qty} {m.unit} terjual</small></span>{item && <em>{rp(item.price)}</em>}</div>;
    })}</div>{!top.length && <p>Belum ada menu terjual hari ini.</p>}</Result></Widget>},
    {id:'perhatian',title:'Perlu perhatian',node:<Widget title="Perlu perhatian">{(board===null||stock && data.low===null) && <p>Sebagian data belum dapat dimuat.</p>}{notice.length || (board && (!stock||data.low)) ? <Alerts items={notice}/> : null}<button className="sm ghost" onClick={()=>setRefresh(n=>n+1)}>Muat ulang</button></Widget>}
  ];
  return <div className={css.home} data-default-order={!prefs.pref.order?.length || undefined}><Dashboard id="jasa" kosId={kosId} prefs={prefs} widgets={widgets} header={atur=><header className={css.hero}><div><h1>Selamat {greeting}{name?', '+name:''}</h1><span>Ringkasan operasional {kos.name} hari ini.</span></div><img src="/retail/prasara-maskot.webp" alt="Maskot PRASARA"/><div>{atur}</div></header>}/><button className="sm ghost" onClick={onDetail}>Ringkasan lengkap &amp; food cost</button>{canArea(kos,'settings') && <Persiapan kos={kos}/>}</div>;
}
