'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { addMonthsYm, monthEnd, rp, today } from '@/lib/format';
import { investmentEvidence } from '@/lib/investmentPlanner';

export function useInvestmentEvidence(kosId, ver, category, enabled) {
  const month = today().slice(0, 7);
  const expectedMonths = [3, 2, 1].map((offset) => addMonthsYm(month, -offset));
  const key = JSON.stringify([kosId, ver, category, month]);
  const [loaded, setLoaded] = useState(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const call = async (name, args) => {
      try { return await supabase.rpc(name, { p_kos: kosId, ...args }); }
      catch { return { error: true }; }
    };
    async function load() {
      const latest = expectedMonths.at(-1);
      const intel = await call('biz_intel', { p_from: latest + '-01', p_to: monthEnd(latest) });
      const cash = [];
      for (const month of expectedMonths) {
        if (!active) return;
        const response = await call('acct_cashflow', { p_from: month + '-01', p_to: monthEnd(month) });
        cash.push({ month, report: response.data, unavailable: Boolean(response.error) });
      }
      if (!active) return;
      const stock = category === 'retail' ? await call('stock_health', {}) : {};
      if (active) setLoaded({ key, intel: intel.data, stock: stock.data, cash,
        unavailable: Boolean(intel.error || cash.some((row) => row.unavailable)) });
    }
    load();
    return () => { active = false; };
  }, [key, enabled]);
  return { expectedMonths, ...(loaded?.key === key ? loaded : {}), loading: loaded?.key !== key };
}

export default function InvestmentEvidence({ history, project, category, goal, onProject, onApply, applied, saving }) {
  const evidence = investmentEvidence(history, { ...project, category, goal });
  const { suggestions, coverage, sufficient, gross, expense, inventory, risks, trendCount } = evidence;
  const field = (key, label, max) => <label>{label}<input type="number" min={key === 'life' ? 1 : 0} max={max} step={key === 'share' ? 'any' : '1'} value={project[key]}
    disabled={saving} onChange={(event) => onProject(key, event.target.value)} /></label>;
  return <div className="stack">
    <div className="notice" role="status">
      {history.loading ? 'Memuat data bisnis…' : sufficient ? 'Data arus kas operasi cukup untuk pembanding.'
        : 'Data arus kas operasi belum cukup untuk pengisian otomatis.'}
      {' '}{coverage}/3 bulan kalender selesai dengan rincian operasi dan saldo cocok.
      {history.cash?.some(({ report }) => report && !report.lengkap) && ' Rincian aktivitas mengikuti akses Laporan Arus Kas.'}
      {history.unavailable && ' Sebagian laporan gagal dimuat.'}
    </div>
    <p className="small muted">Data pembanding memakai seluruh bisnis aktif. Gunakan hanya bila kegiatan proyek sebanding dengan operasi yang ada. Penerimaan dan biaya historis dapat mencakup beberapa jenis transaksi operasi.</p>
    {goal === 'savings' ? <p className="small muted">Isi pembayaran yang bisa dihindari pada kolom Penghematan kas. Data usaha belum menandai pengeluaran yang dapat dihemat oleh proyek ini.</p>
      : field('share', 'Porsi aktivitas tambahan proyek dibanding operasi bisnis (%)', 100)}
    <details><summary>Rincian modal dan masa penggunaan proyek</summary>
      <p className="small muted">Gunakan penawaran dan catatan proyek. Isi 0 untuk biaya yang memang tidak diperlukan.</p>
      <div className="grid">
        {field('asset', 'Harga aset (Rp)')}
        {field('setup', 'Biaya pemasangan atau persiapan (Rp)')}
        {category === 'retail' && field('openingStock', 'Stok awal proyek (Rp)')}
        {field('life', 'Masa penggunaan proyek (bulan)', 60)}
      </div>
    </details>
    <div className="list">
      {Object.entries(suggestions).map(([key, item]) => <div className="li" key={key}>
        <div><b>{{ capital: 'Modal awal', months: 'Durasi', revenue: 'Penerimaan bulanan', cost: 'Biaya bulanan', change: 'Perubahan skenario' }[key]}</b>
          <p className="small muted">{item.source}. {item.reason}</p></div>
        <span>{key === 'months' ? item.value + ' bulan' : key === 'change' ? item.value + '%' : rp(item.value)}</span>
      </div>)}
    </div>
    <button className="sm" type="button" disabled={saving || !Object.keys(suggestions).length} onClick={() => onApply(suggestions)}>Gunakan rekomendasi</button>
    {applied && <p className="small muted" role="status">{applied}</p>}
    <details><summary>Data pembanding dan risiko</summary>
      <p className="small">Business Intelligence · {trendCount}/3 bulan dengan transaksi pendapatan.</p>
      {gross != null && <p className="small">Margin kotor historis {gross.toLocaleString('id-ID', { maximumFractionDigits: 1 })}% · (penjualan − HPP) ÷ penjualan.</p>}
      {expense != null && <p className="small">Rata-rata beban tercatat {rp(expense)}/bulan · Laporan Laba Rugi.</p>}
      {inventory != null && <p className="small">Saldo persediaan {rp(inventory)} · jurnal akhir periode. Gunakan biaya stok khusus proyek untuk menghitung modal.</p>}
      {risks.map((risk) => <p className="small" key={risk}>{risk}</p>)}
    </details>
  </div>;
}
