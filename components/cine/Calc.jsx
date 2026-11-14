'use client';
import { useState } from 'react';
import { useCount, rp } from './useCount';

// Kalkulator perkiraan waktu administrasi manual. Hanya hitungan dari isian pengunjung + asumsi yang ditulis terbuka;
// bukan janji penghematan. Hasil langsung terbaca (angka akhir dihitung saat render, animasi hanya hiasan).
const MENIT_PER_TRANSAKSI = 0.5, MENIT_PER_CEK = 15, MINGGU_PER_BULAN = 4.33, HARI_PER_BULAN = 30;

function Range({ label, unit, value, min, max, step = 1, on }) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <label className="cx-field">
      <span>{label}<b>{value} {unit}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} style={{ '--fill': fill + '%' }} onChange={(e) => on(Number(e.target.value))} aria-valuetext={`${value} ${unit}`} />
    </label>
  );
}

export default function Calc() {
  const [adm, setAdm] = useState(6);
  const [trx, setTrx] = useState(40);
  const [cek, setCek] = useState(5);
  const [rate, setRate] = useState('25000');
  const hAdm = adm * MINGGU_PER_BULAN;
  const hTrx = (trx * HARI_PER_BULAN * MENIT_PER_TRANSAKSI) / 60;
  const hCek = (cek * MINGGU_PER_BULAN * MENIT_PER_CEK) / 60;
  const jam = hAdm + hTrx + hCek;
  const tarif = Number(String(rate).replace(/\D/g, '')) || 0;
  const nilai = jam * tarif;
  const aJam = useCount(jam), aNilai = useCount(nilai), aHari = useCount(jam / 8);
  const part = [['Administrasi', hAdm], ['Catat transaksi', hTrx], ['Cek manual', hCek]];
  return (
    <div className="cx-calc" data-rv="">
      <div>
        <Range label="Jam administrasi per minggu" unit="jam" value={adm} min={0} max={40} on={setAdm} />
        <Range label="Jumlah transaksi per hari" unit="transaksi" value={trx} min={0} max={500} step={5} on={setTrx} />
        <Range label="Pengecekan manual per minggu" unit="kali" value={cek} min={0} max={30} on={setCek} />
        <label className="cx-field" style={{ marginBottom: 0 }}>
          <span>Nilai waktu Anda per jam <b>perkiraan Anda sendiri</b></span>
          <div className="cx-money"><span>Rp</span><input inputMode="numeric" value={new Intl.NumberFormat('id-ID').format(tarif)} onChange={(e) => setRate(e.target.value)} aria-label="Nilai waktu per jam dalam rupiah" /></div>
        </label>
      </div>
      <div>
        <div className="cx-out" aria-live="polite">
          <small>Perkiraan waktu untuk pekerjaan manual</small>
          <span className="cx-big">{Math.round(aJam)} jam<span style={{ fontSize: '.45em', fontWeight: 700 }}> / bulan</span></span>
          <small>setara ± {aHari.toFixed(1).replace('.', ',')} hari kerja (8 jam)</small>
          <div className="cx-out-row">
            <div><small>Nilai waktu per bulan</small><b>{rp(aNilai)}</b></div>
            <div><small>Per tahun</small><b>{rp(aNilai * 12)}</b></div>
          </div>
          <div className="cx-split" aria-hidden="true">
            {part.map(([l, h]) => <div key={l}><span>{l}</span><i style={{ '--w': jam ? (h / jam).toFixed(3) : 0 }} /><span>{Math.round(h)} j</span></div>)}
          </div>
        </div>
        <details className="cx-assume">
          <summary>Lihat asumsi perhitungan</summary>
          <ul>
            <li>Mencatat satu transaksi secara manual dihitung ± 30 detik.</li>
            <li>Satu kali pengecekan manual (stok, kas, tagihan) dihitung ± 15 menit.</li>
            <li>Satu bulan = 4,33 minggu atau 30 hari; satu hari kerja = 8 jam.</li>
            <li>Nilai waktu per jam adalah angka yang Anda isi sendiri.</li>
            <li>Ini perkiraan waktu yang terpakai saat ini, bukan janji penghematan. Hasil nyata bergantung pada cara kerja tiap bisnis.</li>
          </ul>
        </details>
      </div>
    </div>
  );
}
