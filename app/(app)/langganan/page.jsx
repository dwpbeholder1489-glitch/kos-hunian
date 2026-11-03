'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useKos } from '@/components/KosProvider';
import { Field, toast } from '@/components/ui';
import { rp, tgl, errMsg } from '@/lib/format';
import { planOf, PLANS, FEATURES, BUSINESS, waTo } from '@/lib/plan';

const DUR = [1, 3, 6, 12];
const REQ_ST = { menunggu: ['Menunggu diperiksa', 'gold'], disetujui: ['Aktif', 'good'], ditolak: ['Ditolak', 'bad'] };

function copy(text, label) {
  try { navigator.clipboard.writeText(text); toast(label + ' disalin'); } catch { toast('Tidak bisa menyalin otomatis'); }
}

export default function Langganan() {
  const { kos, user, loadKos } = useKos();
  const p = planOf(kos);
  const [plan, setPlan] = useState('standar');
  const [months, setMonths] = useState(1);
  const [method, setMethod] = useState('qris');
  const [note, setNote] = useState('');
  const [reqs, setReqs] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(null);

  const loadReqs = () => supabase.from('plan_requests').select('*').eq('kos_id', kos.id).order('created_at', { ascending: false }).limit(10)
    .then(({ data }) => setReqs(data || []));
  useEffect(() => { loadReqs(); loadKos(); }, [kos.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const total = PLANS[plan].price * months;
  const pending = reqs?.find((r) => r.status === 'menunggu');

  async function confirm() {
    setBusy(true);
    const { error } = await supabase.rpc('request_plan', { p_kos: kos.id, p_plan: plan, p_months: months, p_method: method, p_note: note });
    setBusy(false);
    if (error) return toast(errMsg(error));
    const msg = `Halo, saya sudah membayar langganan Kos Hunian.\n\nKos: ${kos.name}\nAkun: ${user?.email}\nPaket: ${PLANS[plan].name} ${months} bulan\nTotal: ${rp(total)}\nMetode: ${method === 'qris' ? 'QRIS' : 'Transfer ' + BUSINESS.bank.name}${note ? `\nCatatan: ${note}` : ''}\n\n(Bukti pembayaran saya lampirkan)`;
    setSent(waTo(msg));
    loadReqs();
  }

  return (
    <div className="stack">
      <h2>Langganan</h2>

      <section className="panel">
        <span className="label">Paket saat ini</span>
        <div className="row between">
          <b style={{ fontSize: 20 }}>{p.trial ? 'Masa coba (semua fitur)' : PLANS[p.plan].name}</b>
          {p.until && <span className="chip info">{p.trial ? 'Coba' : 'Aktif'} s.d. {tgl(p.until)}</span>}
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          {p.trial ? `Setelah masa coba, kos otomatis menjadi paket Gratis (maks ${BUSINESS.freeRoomLimit} kamar terisi). Data tidak hilang.`
            : p.plan === 'gratis' ? `Paket Gratis: maks ${BUSINESS.freeRoomLimit} kamar terisi, tanpa laporan lengkap, ekspor, dan kwitansi.`
              : 'Perpanjangan akan ditambahkan setelah masa aktif sekarang berakhir.'}
        </p>
      </section>

      {pending && !sent && (
        <div className="notice info">
          Konfirmasi pembayaran {PLANS[pending.plan].name} {pending.months} bulan ({rp(pending.amount)}) sedang diperiksa. Paket aktif setelah disetujui, biasanya dalam 1×24 jam.
          <div style={{ marginTop: 8 }}><a href={waTo(`Halo, saya ingin menanyakan konfirmasi langganan Kos Hunian untuk kos "${kos.name}" (${user?.email}).`)} target="_blank" rel="noreferrer">Tanya via WhatsApp →</a></div>
        </div>
      )}

      {sent ? (
        <section className="panel">
          <h3>✅ Konfirmasi tercatat</h3>
          <p className="small muted" style={{ margin: 0 }}>Langkah terakhir: kirim bukti pembayaran lewat WhatsApp agar bisa segera diperiksa.</p>
          <a href={sent} target="_blank" rel="noreferrer"><button className="cta" style={{ width: '100%' }}>Kirim bukti via WhatsApp</button></a>
          <button className="ghost" onClick={() => setSent(null)}>Tutup</button>
        </section>
      ) : !pending && (
        <>
          <section className="panel">
            <h3>1. Pilih paket</h3>
            <div className="grid">
              {['standar', 'pro'].map((k) => (
                <button key={k} className="tile" style={{ textAlign: 'left', cursor: 'pointer', borderColor: plan === k ? 'var(--gold)' : undefined, borderWidth: plan === k ? 2 : 1 }} onClick={() => setPlan(k)} aria-pressed={plan === k}>
                  <span className="label">{PLANS[k].name}</span>
                  <span className="v">{rp(PLANS[k].price)}<span className="small muted"> /bulan</span></span>
                  <span className="s">{PLANS[k].tagline}</span>
                </button>
              ))}
            </div>
            <ul className="lp-list small">
              {FEATURES.filter((f) => f[plan] && !f.gratis).map((f) => <li key={f.label}>✓ {f.label}{f.soon && <span className="chip info" style={{ marginLeft: 6 }}>Segera</span>}</li>)}
              <li>✓ Kamar tanpa batas + semua fitur Gratis</li>
            </ul>
          </section>

          <section className="panel">
            <h3>2. Pilih durasi</h3>
            <div className="seg">{DUR.map((m) => <button key={m} className={months === m ? 'on' : ''} onClick={() => setMonths(m)}>{m} bulan</button>)}</div>
            <div className="row between"><span className="label">Total bayar</span><b style={{ fontSize: 22 }}>{rp(total)}</b></div>
          </section>

          <section className="panel">
            <h3>3. Bayar</h3>
            <div className="seg">
              <button className={method === 'qris' ? 'on' : ''} onClick={() => setMethod('qris')}>QRIS</button>
              <button className={method === 'transfer' ? 'on' : ''} onClick={() => setMethod('transfer')}>Transfer bank</button>
            </div>
            {method === 'qris' ? (
              <>
                <img src={BUSINESS.qrisImage} alt="QRIS pembayaran Kos Hunian" className="qris" />
                <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>Scan dengan aplikasi bank atau e-wallet, lalu masukkan nominal <b>{rp(total)}</b>.</p>
                <a href={BUSINESS.qrisImage} download="QRIS-Kos-Hunian.jpg" className="small" style={{ textAlign: 'center' }}>Simpan gambar QRIS</a>
              </>
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
            <Field label="Catatan (opsional)" hint="mis. nama pengirim di rekening atau aplikasi"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <button className="cta" onClick={confirm} disabled={busy}>{busy ? 'Menyimpan…' : 'Saya sudah bayar'}</button>
            <p className="small muted" style={{ margin: 0 }}>Paket aktif setelah pembayaran diperiksa, biasanya dalam 1×24 jam.</p>
          </section>
        </>
      )}

      {reqs && reqs.length > 0 && (
        <section className="panel"><h3>Riwayat</h3>
          <div className="list">{reqs.map((r) => (
            <div className="li" key={r.id}>
              <div className="main"><b>{PLANS[r.plan].name} · {r.months} bulan</b><span className="small muted">{tgl(r.created_at.slice(0, 10))} · {r.method === 'qris' ? 'QRIS' : 'Transfer'}</span></div>
              <div style={{ textAlign: 'right' }}><div className="num">{rp(r.amount)}</div><span className={'chip ' + REQ_ST[r.status][1]}>{REQ_ST[r.status][0]}</span></div>
            </div>
          ))}</div>
        </section>
      )}
    </div>
  );
}
