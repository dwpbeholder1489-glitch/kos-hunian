'use client';
import PageHelp from '@/components/PageHelp';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Field, Sheet, Loading, toast, run } from '@/components/ui';
import { rp, tgl, errMsg } from '@/lib/format';
import { planOf, PLANS, FEATURES, FEATURE_CODES, BUSINESS, waTo, featureCell, termOf, totalOf, savePct } from '@/lib/plan';

const DUR = [1, 3, 6, 12];
const REQ_ST = { menunggu: ['Menunggu diperiksa', 'gold'], disetujui: ['Lunas', 'good'], ditolak: ['Ditolak', 'bad'], batal: ['Dibatalkan', 'void'], kedaluwarsa: ['Kedaluwarsa', 'void'] };
const st = (k) => REQ_ST[k] || [k, 'void'];
const TRX_ST = { pending: 'Menunggu pembayaran diperiksa', processing: 'Sedang diproses', paid: 'Pembayaran diterima', failed: 'Tidak diterima', expired: 'Kedaluwarsa', cancelled: 'Dibatalkan', refunded: 'Dikembalikan', draft: 'Draf' };
const KIND = { baru: 'Langganan baru', perpanjang: 'Perpanjangan', upgrade: 'Naik paket', downgrade: 'Turun paket' };

function copy(text, label) {
  try { navigator.clipboard.writeText(text); toast(label + ' disalin'); } catch { toast('Tidak bisa menyalin otomatis'); }
}

export default function Langganan() {
  const { kos, user, loadKos } = useKos();
  const p = planOf(kos);
  const [plans, setPlans] = useState(null);
  const [plan, setPlan] = useState(null);
  const [months, setMonths] = useState(1);
  const [method, setMethod] = useState('qris');
  const [note, setNote] = useState('');
  const [reqs, setReqs] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);
  const [inv, setInv] = useState(null);
  const [lynkUrl, setLynkUrl] = useState(null);
  const [pendingUrl, setPendingUrl] = useState(null);

  // Tagihan + ID transaksi & status pembayaran dari server; cadangan: tabel tagihan saja
  const loadReqs = () => supabase.rpc('my_invoices', { p_kos: kos.id }).then(async ({ data, error }) => {
    if (!error && Array.isArray(data)) return setReqs(data);
    const r = await supabase.from('plan_requests').select('*').eq('kos_id', kos.id).order('created_at', { ascending: false }).limit(24);
    setReqs(r.data || []);
  });
  useEffect(() => {
    loadReqs(); loadKos();
    // Harga & fitur dari database (bisa berubah lewat Management Center); cadangan: daftar bawaan
    supabase.rpc('plan_quote', { p_kos: kos.id }).then(({ data, error }) => {
      const list = !error && data?.length ? data : ['dasar', 'bisnis', 'pro'].map((k) => ({ key: k, name: PLANS[k].name, tagline: PLANS[k].tagline, price: PLANS[k].price, current_price: PLANS[k].price, list_price: PLANS[k].list_price, terms: PLANS[k].terms || [] }));
      setPlans(list);
      setPlan((cur) => cur || (list.find((x) => x.key === kos.plan && !p.free) || list[0])?.key);
    });
  }, [kos.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Link Lynk: hanya ada bila harganya masih sama dengan link yang dipasang (dicek server)
  const pendingReq = reqs?.find((r) => r.status === 'menunggu');
  useEffect(() => {
    if (!plan) return;
    supabase.rpc('plan_pay_link', { p_kos: kos.id, p_plan: plan, p_months: months }).then(({ data }) => setLynkUrl(data || null));
  }, [kos.id, plan, months]);
  useEffect(() => {
    if (pendingReq?.method !== 'gateway') return;
    supabase.rpc('plan_pay_link', { p_kos: kos.id, p_plan: pendingReq.plan, p_months: pendingReq.months }).then(({ data }) => setPendingUrl(data || null));
  }, [kos.id, pendingReq?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Kartu "Upgrade berhasil": tampil sekali untuk setiap persetujuan baru (penanda per perangkat)
  const [baru, setBaru] = useState(null);
  useEffect(() => {
    if (!reqs) return;
    const key = `prasara-upgrade-${kos.id}`;
    const ok = reqs.find((r) => r.status === 'disetujui');
    if (!ok) return;
    let seen = null; try { seen = localStorage.getItem(key); } catch {}
    if (seen === null) { try { localStorage.setItem(key, ok.id); } catch {} return; }
    if (seen !== ok.id) setBaru(ok);
  }, [reqs, kos.id]);
  const tutupBaru = () => { try { localStorage.setItem(`prasara-upgrade-${kos.id}`, baru.id); } catch {} setBaru(null); };

  if (p.owner) return (
    <div className="stack">
      <div className="row"><h2>Langganan</h2><PageHelp page="langganan" /></div>
      <section className="panel">
        <span className="label">Paket saat ini</span>
        <b style={{ fontSize: 20 }}>Pro · Pemilik aplikasi 👑</b>
        <p className="small muted" style={{ margin: 0 }}>Bisnis ini milik akun admin PRASARA, jadi semua fitur aktif selamanya tanpa langganan.</p>
      </section>
      <p className="small muted" style={{ margin: 0 }}>Konfirmasi pembayaran dari pelanggan bisa diperiksa di menu Admin.</p>
    </div>
  );
  if (!plans || !reqs) return <Loading />;

  const sel = plans.find((x) => x.key === plan) || plans[0];
  const total = totalOf(sel, months);
  const term = termOf(sel, months);
  const pending = reqs.find((r) => r.status === 'menunggu');
  const active = !p.free && !p.trial && p.until;
  const pname = (k) => plans.find((x) => x.key === k)?.name || PLANS[k]?.name || k;
  const change = active && sel && sel.key !== kos.plan ? (Number(sel.price) >= Number(plans.find((x) => x.key === kos.plan)?.price || 0) ? 'upgrade' : 'downgrade') : null;
  const typeRows = FEATURES.filter((f) => !f.soon && (f.group === 'umum' || f.group === (kos.business_type || 'properti')));

  async function confirm() {
    setBusy(true);
    const metode = method === 'lynk' ? 'gateway' : method;
    const { data: id, error } = await supabase.rpc('request_plan', { p_kos: kos.id, p_plan: sel.key, p_months: months, p_method: metode, p_note: note });
    setBusy(false);
    if (error) return toast(errMsg(error));
    if (metode === 'gateway') { toast('Tagihan dibuat. Ketuk Buka halaman Lynk.id untuk membayar.'); loadReqs(); return; }
    const { data: r } = await supabase.from('plan_requests').select('number').eq('id', id).maybeSingle();
    const msg = `Halo, saya sudah membayar langganan PRASARA.\n\nInvoice: ${r?.number || '-'}\nBisnis: ${kos.name}\nAkun: ${user?.email}\nPaket: ${sel.name} ${months === 12 && term ? '1 tahun' : months + ' bulan'}\nTotal: ${rp(total)}\nMetode: ${method === 'qris' ? 'QRIS' : 'Transfer ' + BUSINESS.bank.name}${note ? `\nCatatan: ${note}` : ''}\n\n(Bukti pembayaran saya lampirkan)`;
    setSent(waTo(msg));
    loadReqs();
  }
  const cancelInv = async (r) => {
    if (!window.confirm(`Batalkan tagihan ${r.number || ''}? Lakukan ini hanya bila Anda BELUM membayar. Setelah dibatalkan Anda bisa memilih paket lain.`)) return;
    if (await run(() => supabase.rpc('plan_request_cancel', { p_request: r.id }), 'Tagihan dibatalkan', errMsg)) { setSent(null); loadReqs(); }
  };
  const cancel = async (on) => {
    if (on && !window.confirm(`Berhenti memperpanjang? Paket ${p.name} tetap aktif sampai ${tgl(p.until)}, lalu bisnis menjadi paket Gratis. Data tidak dihapus.`)) return;
    if (await run(() => supabase.rpc('plan_cancel', { p_kos: kos.id, p_cancel: on }), on ? 'Tidak akan diperpanjang' : 'Langganan dilanjutkan', errMsg)) loadKos();
  };

  return (
    <div className="stack">
      <div className="row"><h2>Langganan</h2><PageHelp page="langganan" /></div>

      <section className="panel">
        <span className="label">Paket saat ini</span>
        <div className="row between">
          <b style={{ fontSize: 20 }}>{p.trial ? `Masa coba (${p.name})` : p.name}</b>
          {p.until && <span className={'chip ' + (p.grace ? 'bad' : 'info')}>{p.trial ? 'Coba' : p.grace ? 'Masa tenggang' : 'Aktif'} s.d. {tgl(p.until)}</span>}
        </div>
        {p.grace && <div className="notice bad">Masa paket sudah habis. Fitur masih terbuka selama masa tenggang sampai {tgl(p.until)} — perpanjang agar tidak menjadi paket Gratis.</div>}
        {p.next && <div className="notice">Turun ke paket <b>{p.next.name}</b> setelah paket sekarang berakhir, berlaku s.d. {tgl(p.next.until)}.</div>}
        <p className="small muted" style={{ margin: 0 }}>
          {p.trial ? `Masa coba memakai fitur Paket ${p.name}. Setelah masa coba, bisnis otomatis menjadi paket Gratis kecuali Anda berlangganan. Data tidak hilang.`
            : p.free ? 'Paket Gratis. Pilih paket di bawah untuk membuka fitur lainnya.'
              : p.cancel ? `Anda memilih berhenti memperpanjang. Paket tetap aktif sampai ${tgl(p.until)}.` : 'Perpanjangan ditambahkan setelah masa aktif sekarang berakhir.'}
        </p>
        {active && !p.grace && (p.cancel
          ? <button className="sm" onClick={() => cancel(false)}>Lanjutkan langganan</button>
          : <button className="sm ghost" onClick={() => cancel(true)}>Berhenti memperpanjang</button>)}
      </section>

      {baru && (
        <section className="panel" style={{ borderColor: 'var(--good)' }}>
          <h3>Upgrade berhasil!</h3>
          <div className="row between"><b>Paket {pname(baru.plan)}</b><span className="chip good">{baru.months === 12 ? '1 tahun' : `${baru.months} bulan`}</span></div>
          <span className="small">Dibayar {rp(baru.amount)} (sekali bayar){baru.active_until ? ` · aktif s.d. ${tgl(String(baru.active_until).slice(0, 10))}` : ''}.</span>
          {(() => { const pl = plans.find((x) => x.key === baru.plan); return pl ? (
            <>
              <span className="small">Kapasitas baru: karyawan {pl.limits?.karyawan ?? '—'}, ruang lampiran {pl.limits?.lampiran_mb ?? '—'} MB.</span>
              <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>{(pl.features || []).map((c) => <li key={c}>{FEATURE_CODES[c] || c}</li>)}</ul>
            </>
          ) : null; })()}
          <button className="cta" style={{ width: '100%', marginTop: 8 }} onClick={tutupBaru}>Mengerti</button>
        </section>
      )}

      {pending && !sent && (
        <div className="notice info">
          {pending.method === 'gateway' ? (
            <>Invoice {pending.number || ''} · {pname(pending.plan)} {pending.months} bulan ({rp(pending.amount)}) menunggu pembayaran di Lynk.id. Paket aktif <b>otomatis</b> begitu pembayaran diterima, asalkan email di halaman Lynk sama dengan <b>{user?.email}</b>.</>
          ) : (
            <>Invoice {pending.number || ''} · {pname(pending.plan)} {pending.months} bulan ({rp(pending.amount)}) sedang diperiksa. Paket aktif setelah disetujui, biasanya dalam 1×24 jam pada hari kerja.</>
          )}
          {pending.trx?.code && <div className="small" style={{ marginTop: 6 }}>ID transaksi: <b>{pending.trx.code}</b></div>}
          {pending.due_at && <div className="small" style={{ marginTop: 6 }}>Batas waktu bayar: <b>{tgl(String(pending.due_at).slice(0, 10))}</b>{new Date(pending.due_at) < new Date() && <span style={{ color: 'var(--att-fg)' }}> · sudah lewat. Belum membayar? Ketuk Belum bayar — batalkan, lalu pilih lagi.</span>}</div>}
          {pending.method === 'gateway' && pendingUrl && <a href={pendingUrl} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 8 }}><button className="cta" style={{ width: '100%' }}>Buka halaman Lynk.id</button></a>}
          <div className="row" style={{ marginTop: 8 }}><a href={waTo(`Halo, saya ingin menanyakan konfirmasi langganan PRASARA ${pending.number || ''}${pending.trx?.code ? ` (${pending.trx.code})` : ''} untuk "${kos.name}" (${user?.email}).`)} target="_blank" rel="noreferrer">Tanya via WhatsApp →</a>
            <button className="sm ghost" onClick={() => cancelInv(pending)}>Belum bayar — batalkan</button></div>
        </div>
      )}

      {sent ? (
        <section className="panel">
          <h3>✅ Konfirmasi tercatat</h3>
          <p className="small muted" style={{ margin: 0 }}>Langkah terakhir: kirim bukti pembayaran lewat WhatsApp agar bisa segera diperiksa.</p>
          <a href={sent} target="_blank" rel="noreferrer"><button className="cta" style={{ width: '100%' }}>Kirim bukti via WhatsApp</button></a>
          <button className="ghost" onClick={() => setSent(null)}>Tutup</button>
        </section>
      ) : !pending && sel && (
        <>
          <section className="panel">
            <h3>1. Pilih paket</h3>
            <div className="grid">
              {plans.map((x) => (
                <button key={x.key} className="tile" style={{ textAlign: 'left', cursor: 'pointer', borderColor: plan === x.key ? 'var(--gold)' : undefined, borderWidth: plan === x.key ? 2 : 1 }} onClick={() => setPlan(x.key)} aria-pressed={plan === x.key}>
                  <span className="label">{x.name}{active && x.key === kos.plan ? ' · paket Anda' : ''}</span>
                  {Number(x.list_price) > Number(x.price) && <span className="planwas"><s>{rp(x.list_price)}</s><span className="savechip">Hemat {savePct(x.price, x.list_price)}%</span></span>}
                  <span className="v">{rp(x.price)}<span className="small muted"> /bulan</span></span>
                  {x.current_price != null && Number(x.price) < Number(x.current_price) && <span className="small" style={{ color: 'var(--good)' }}>Harga lama Anda tetap berlaku (harga sekarang {rp(x.current_price)})</span>}
                  {(x.terms || []).map((t) => <span key={t.months} className="small" style={{ color: 'var(--gold)' }}>{Number(t.months) === 12 ? 'Tahunan' : `${t.months} bulan`}: {rp(t.price)}{Number(t.list_price) > Number(t.price) ? ` · hemat ${savePct(t.price, t.list_price)}%` : ''}</span>)}
                  <span className="s">{x.tagline}</span>
                </button>
              ))}
            </div>
            <ul className="lp-list small">
              {typeRows.map((f) => { const v = featureCell(f, sel); return v ? <li key={f.label}>✓ {f.label}{typeof v === 'string' ? ` — ${v}` : ''}</li> : null; })}
            </ul>
            {change === 'upgrade' && <div className="notice">Naik paket berlaku sejak disetujui. Sisa hari paket {p.name} dihitung ulang sesuai perbandingan harga dan ditambahkan.</div>}
            {change === 'downgrade' && <div className="notice">Turun paket berlaku setelah paket {p.name} berakhir ({tgl(p.until)}).</div>}
          </section>

          <section className="panel">
            <h3>2. Pilih durasi</h3>
            <div className="seg">{DUR.map((m) => <button key={m} className={months === m ? 'on' : ''} onClick={() => setMonths(m)}>{m === 12 && termOf(sel, 12) ? '1 tahun' : `${m} bulan`}</button>)}</div>
            {term && Number(term.list_price) > Number(term.price) && <div className="notice">Paket {sel.name} {months === 12 ? 'Tahunan' : `${months} bulan`}: <s>{rp(term.list_price)}</s> menjadi <b>{rp(term.price)}</b> — hemat {rp(Number(term.list_price) - Number(term.price))} ({savePct(term.price, term.list_price)}%). Dibayar sekali untuk {months} bulan.</div>}
            {!term && termOf(sel, 12) && months !== 12 && <span className="small muted">Pilih <b>1 tahun</b> untuk harga tahunan {rp(termOf(sel, 12).price)}.</span>}
            <div className="row between"><span className="label">Total bayar{months > 1 ? ` (sekali untuk ${months} bulan)` : ''}</span><b style={{ fontSize: 22 }}>{rp(total)}</b></div>
          </section>

          <section className="panel">
            <h3>3. Bayar</h3>
            <div className="seg">
              <button className={method === 'qris' ? 'on' : ''} onClick={() => setMethod('qris')}>QRIS</button>
              <button className={method === 'transfer' ? 'on' : ''} onClick={() => setMethod('transfer')}>Transfer bank</button>
              <button className={method === 'lynk' ? 'on' : ''} onClick={() => setMethod('lynk')}>Lynk.id</button>
            </div>
            {method === 'qris' ? (
              <>
                <img src={BUSINESS.qrisImage} alt="QRIS pembayaran PRASARA" className="qris" />
                <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>Scan dengan aplikasi bank atau e-wallet, lalu masukkan nominal <b>{rp(total)}</b>.</p>
                <a href={BUSINESS.qrisImage} download="QRIS-PRASARA.jpg" className="small" style={{ textAlign: 'center' }}>Simpan gambar QRIS</a>
              </>
            ) : method === 'lynk' ? (
              lynkUrl ? (
                <p className="small muted" style={{ margin: 0 }}>Bayar di halaman Lynk.id (QRIS, e-wallet, atau virtual account sesuai pilihan di sana) dengan nominal <b>{rp(total)}</b>. Di halaman Lynk, isi email <b>{user?.email}</b> agar pembayaran otomatis cocok dengan akun Anda. Tekan tombol di bawah untuk membuat tagihan lalu membuka Lynk.id.</p>
              ) : (
                <p className="small" style={{ margin: 0, color: 'var(--att)' }}>Pembayaran Lynk.id belum tersedia untuk pilihan ini. Pilih QRIS atau transfer bank.</p>
              )
            ) : (
              <>
                <span className="small muted">{BUSINESS.bank.name} a.n. {BUSINESS.bank.holder}</span>
                <div className="copyrow"><span>{BUSINESS.bank.account}</span><button className="sm" onClick={() => copy(BUSINESS.bank.account, 'Nomor rekening')}>Salin</button></div>
                <div className="copyrow"><span>{rp(total)}</span><button className="sm" onClick={() => copy(String(total), 'Nominal')}>Salin</button></div>
              </>
            )}
          </section>

          <section className="panel">
            <h3>4. Konfirmasi</h3>
            <div className="tile" style={{ marginBottom: 8 }}>
              <span className="label">Ringkasan pesanan</span>
              <span className="v">Paket {sel.name} · {months === 12 && term ? '1 tahun' : `${months} bulan`}</span>
              <span className="small">Total {rp(total)}{months > 1 ? ' (dibayar sekali)' : ''}</span>
              {(sel.features || []).length > 0 && <ul className="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>{sel.features.map((c) => <li key={c}>{FEATURE_CODES[c] || c}</li>)}</ul>}
              <span className="small muted">Invoice dibuat setelah Anda menekan tombol di bawah. Batas waktu bayar 3 hari.</span>
            </div>
            <Field label="Catatan (opsional)" hint="mis. nama pengirim di rekening atau aplikasi"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            {method === 'lynk' ? (
              <>
                <button className="cta" onClick={confirm} disabled={busy || !lynkUrl}>{busy ? 'Menyimpan…' : 'Buat tagihan & buka Lynk.id'}</button>
                <p className="small muted" style={{ margin: 0 }}>Paket aktif otomatis setelah pembayaran di Lynk.id diterima. Tidak perlu kirim bukti.</p>
              </>
            ) : (
              <>
                <button className="cta" onClick={confirm} disabled={busy}>{busy ? 'Menyimpan…' : 'Saya sudah bayar'}</button>
                <p className="small muted" style={{ margin: 0 }}>Paket aktif setelah pembayaran diperiksa, biasanya dalam 1×24 jam pada hari kerja.</p>
              </>
            )}
          </section>
        </>
      )}

      {reqs.length > 0 && (
        <section className="panel"><h3>Riwayat tagihan</h3>
          <div className="list">{reqs.map((r) => (
            <button key={r.id} className="li click" onClick={() => setInv(r)} style={{ background: 'none', border: 0, borderTop: '1px solid var(--line)', borderRadius: 0, width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit' }}>
              <div className="main"><b>{pname(r.plan)} · {r.months} bulan</b><span className="small muted">{r.number || '—'} · {tgl(r.created_at.slice(0, 10))}</span></div>
              <div style={{ textAlign: 'right' }}><div className="num">{rp(r.amount)}</div><span className={'chip ' + st(r.status)[1]}>{st(r.status)[0]}</span></div>
            </button>
          ))}</div>
        </section>
      )}

      {inv && (
        <Sheet title={`Invoice ${inv.number || ''}`} onClose={() => setInv(null)}>
          <div className="panel" style={{ gap: 6 }}>
            <div className="row between"><b>PRASARA</b><span className={'chip ' + st(inv.status)[1]}>{st(inv.status)[0]}</span></div>
            <span className="small muted">Untuk: {kos.name} · {user?.email}</span>
            <div className="list">
              <div className="li"><span className="small">Nomor</span><b className="small">{inv.number || '—'}</b></div>
              <div className="li"><span className="small">Tanggal</span><b className="small">{tgl(inv.created_at.slice(0, 10))}</b></div>
              <div className="li"><span className="small">{KIND[inv.kind] || 'Langganan'}</span><b className="small">{pname(inv.plan)} × {inv.months} bulan</b></div>
              {inv.unit_price && inv.months === 1 && <div className="li"><span className="small">Harga per bulan</span><b className="small">{rp(inv.unit_price)}</b></div>}
              <div className="li"><span className="small">Metode</span><b className="small">{inv.method === 'qris' ? 'QRIS' : inv.method === 'transfer' ? 'Transfer bank' : inv.method === 'gateway' ? 'Lynk.id' : 'Pembayaran online'}</b></div>
              {inv.trx?.code && <div className="li"><span className="small">ID transaksi</span><b className="small" style={{ overflowWrap: 'anywhere' }}>{inv.trx.code}</b></div>}
              {inv.trx?.status && <div className="li"><span className="small">Status pembayaran</span><b className="small">{TRX_ST[inv.trx.status] || inv.trx.status}</b></div>}
              <div className="li"><b>Total</b><b>{rp(inv.amount)}</b></div>
              {inv.decided_at && <div className="li"><span className="small">{inv.status === 'disetujui' ? 'Dibayar & diaktifkan' : 'Diproses'}</span><b className="small">{tgl(inv.decided_at.slice(0, 10))}</b></div>}
              {inv.active_until && <div className="li"><span className="small">Paket aktif sampai</span><b className="small">{tgl(inv.active_until)}</b></div>}
            </div>
          </div>
          <button className="noprint" onClick={() => window.print()}>Cetak / simpan PDF</button>
        </Sheet>
      )}
    </div>
  );
}
