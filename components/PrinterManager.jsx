'use client';
import { useState } from 'react';
import { Field, Sheet, toast } from '@/components/ui';
import { discoverPrinters, printReceipt, printerSettings, savePrinter } from '@/lib/printer';

export function PrintReceiptButton({ kosId, renderText, children = 'Cetak ulang' }) {
  const [busy, setBusy] = useState(false);
  async function print() {
    setBusy(true);
    try {
      const settings = printerSettings(kosId);
      await printReceipt(renderText(settings.paper), settings);
    } catch (error) {
      toast('Cetak gagal: ' + error.message);
    } finally {
      setBusy(false);
    }
  }
  return <button type="button" className="primary" disabled={busy} onClick={print}>{children}</button>;
}

const transportLabels = { lan: 'WiFi/LAN', bluetooth: 'Bluetooth', cups: 'Antrean sistem' };

export default function PrinterManager({ kosId }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="sm ghost" onClick={() => setOpen(true)}>Pengaturan printer</button>
    {open && <PrinterSheet key={kosId} kosId={kosId} onClose={() => setOpen(false)} />}
  </>;
}

function PrinterSheet({ kosId, onClose }) {
  const [settings, setSettings] = useState(() => printerSettings(kosId));
  const [devices, setDevices] = useState([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [failed, setFailed] = useState(false);
  const change = (patch) => setSettings((current) => ({ ...current, ...patch }));
  const endpoint = (patch) => {
    setDevices([]);
    change({ ...patch, id: '', name: '' });
  };
  async function run(action) {
    setBusy(true);
    setStatus('');
    setFailed(false);
    try { await action(); }
    catch (error) { setFailed(true); setStatus(error.message); }
    finally { setBusy(false); }
  }
  const bridge = settings.mode === 'bridge';
  const ready = !bridge || Boolean(settings.id && settings.url && settings.token);
  return <Sheet title="Pengaturan printer" onClose={onClose}>
    <p className="small muted">Pengaturan disimpan untuk bisnis ini di browser perangkat ini.</p>
    <fieldset disabled={busy} className="stack" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <Field label="Jalur cetak"><select value={settings.mode} onChange={(event) => change({ mode: event.target.value })}>
        <option value="system">Dialog cetak sistem / AirPrint</option>
        <option value="bridge">Aplikasi penghubung PRASARA</option>
      </select></Field>
      {bridge ? <>
        <Field label="Alamat aplikasi penghubung"><input type="url" value={settings.url} onChange={(event) => endpoint({ url: event.target.value.trim() })} /></Field>
        <Field label="Token penghubung"><input type="password" autoComplete="off" value={settings.token} onChange={(event) => endpoint({ token: event.target.value.trim() })} /></Field>
        <button type="button" disabled={!settings.url || !settings.token} onClick={() => run(async () => {
          const found = await discoverPrinters(settings);
          setDevices(found);
          if (settings.id) {
            const selected = found.find((device) => device.id === settings.id);
            change(selected ? { name: selected.name, paper: selected.paper } : { id: '', name: '' });
          }
          setStatus(found.length ? `${found.length} printer terdaftar di penghubung.` : 'Belum ada printer yang terdaftar di penghubung.');
        })}>Deteksi printer</button>
        <Field label="Printer default"><select value={settings.id} onChange={(event) => {
          const device = devices.find(({ id }) => id === event.target.value);
          change(device ? { id: device.id, name: device.name, paper: device.paper } : { id: '', name: '' });
        }}>
          <option value="">Pilih printer</option>
          {settings.id && !devices.some(({ id }) => id === settings.id) && <option value={settings.id}>{settings.name}</option>}
          {devices.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.paper === 'A4' ? 'A4' : p.paper + ' mm'} · {transportLabels[p.type]}</option>)}
        </select></Field>
      </> : <p className="small muted">Sistem mendeteksi printer yang kompatibel dan menangani pilihan printer. Di iPhone atau iPad, pilih printer AirPrint. Untuk thermal lain, gunakan aplikasi penghubung melalui HTTPS.</p>}
      <Field label="Ukuran kertas"><select value={settings.paper} disabled={bridge} onChange={(event) => change({ paper: event.target.value })}>
        <option value="58">Thermal 58 mm</option>
        <option value="80">Thermal 80 mm</option>
        <option value="A4">Dokumen A4</option>
      </select></Field>
      {bridge && <span className="small muted">Ukuran mengikuti profil printer di aplikasi penghubung.</span>}
      <Field label="Jumlah salinan"><input type="number" min="1" max="10" step="1" value={settings.copies || ''} onChange={(event) => change({ copies: event.target.valueAsNumber })} /></Field>
      {bridge && <label className="row"><input type="checkbox" checked={settings.auto} onChange={(event) => change({ auto: event.target.checked })} /> Cetak otomatis setelah transaksi atau pembayaran tersimpan</label>}
      <div className="row">
        <button type="button" disabled={!ready} onClick={() => run(async () => {
          await printReceipt('PRASARA\nTES CETAK\n' + new Date().toLocaleString('id-ID'), settings);
          setStatus(bridge ? 'Pekerjaan tes dikirim. Periksa hasil di printer.' : 'Dialog cetak sistem dibuka.');
        })}>Tes cetak</button>
        <button type="button" className="primary" disabled={!ready} onClick={() => run(() => {
          if (!Number.isInteger(settings.copies) || settings.copies < 1 || settings.copies > 10) throw new Error('Jumlah salinan harus 1–10.');
          savePrinter(kosId, settings);
          onClose();
          toast('Pengaturan printer disimpan.');
        })}>Simpan</button>
      </div>
    </fieldset>
    {status && <p role="status" className={'notice' + (failed ? ' bad' : '')}>{status}</p>}
  </Sheet>;
}
