# Printer PRASARA

Buka **Pengaturan → Pengaturan printer** atau tombol yang sama di Kasir. Simpan pilihan untuk tiap bisnis di browser yang digunakan. Tes cetak sebelum mengaktifkan cetak otomatis.

| Printer | Jalur | Prasyarat |
| --- | --- | --- |
| A4, USB, WiFi, LAN | Dialog sistem atau penghubung | Driver sistem atau antrean CUPS, misalnya IPP Everywhere |
| AirPrint di iPhone dan iPad | Dialog sistem | Printer AirPrint dapat ditemukan oleh iOS |
| Thermal 58/80 mm, WiFi/LAN | Penghubung | Printer ESC/POS dengan port TCP raw, biasanya 9100 |
| Thermal 58/80 mm, USB | Penghubung | Antrean CUPS yang meneruskan ESC/POS tanpa filter |
| Thermal 58/80 mm, Bluetooth Classic | Penghubung | Linux, pairing Bluetooth SPP, perangkat RFCOMM; atau antrean CUPS raw dengan backend Bluetooth yang sesuai |
| Thermal dengan driver sistem | Dialog sistem | Driver dan ukuran rol yang sesuai tersedia di perangkat |

Dialog sistem menemukan printer melalui sistem operasi. Pilih **Ikuti ukuran kertas printer** agar struk mengikuti media dari dialog cetak. Struk diletakkan di tengah, dan baris yang melebihi satu halaman diteruskan ke halaman berikutnya. Halaman **Cetak label barcode** memiliki pengaturan medianya sendiri untuk mencetak beberapa kolom pada A4 atau satu kolom pada rol thermal. Pilih printer dan periksa ukuran media di dialog tersebut. Sistem operasi mengelola printer default dan izin. Untuk salinan yang sudah diatur di PRASARA, biarkan jumlah salinan di dialog sistem tetap 1. Browser dapat mengabaikan ukuran kertas CSS untuk rol tertentu, sehingga pilih ukuran rol di driver. AirPrint memerlukan konfirmasi pengguna.

## Menjalankan aplikasi penghubung

Jalankan di komputer kasir atau komputer tepercaya yang bisa menjangkau printer. Penghubung memerlukan Node.js 20+, dependensi proyek (`npm install`), serta perintah CUPS `lpstat` dan `lp` untuk antrean sistem. Profil LAN dan Bluetooth dapat dipakai tanpa CUPS.

Buat `printer-bridge.json` di direktori repositori. Ganti origin dengan alamat PRASARA yang benar, tanpa garis miring akhir. Buat token unik dengan `openssl rand -hex 32`. Gunakan profil di bawah sesuai perangkat yang terpasang.

```json
{
  "origin": "https://alamat-prasara.example",
  "token": "GANTI_DENGAN_TOKEN_ACAK",
  "printers": [
    { "id": "struk-lan", "name": "Kasir 80 mm", "type": "lan", "host": "192.168.1.50", "port": 9100, "paper": "80", "cut": true },
    { "id": "struk-usb", "name": "USB 58 mm", "type": "cups", "queue": "Thermal58", "paper": "58" },
    { "id": "struk-bt", "name": "Bluetooth 58 mm", "type": "bluetooth", "path": "/dev/rfcomm0", "paper": "58" }
  ]
}
```

- Tambahkan printer USB di CUPS lalu cocokkan nama `queue` dengan keluaran `lpstat -p`. Daftarkan setiap antrean thermal dengan profil 58/80 mm. Antrean CUPS lain ditampilkan sebagai A4.
- Untuk Bluetooth Classic SPP, pasangkan printer di Linux, hubungkan atau ikat kanal SPP yang didokumentasikan vendor ke `/dev/rfcomm0`, lalu atur TTY ke mode raw tanpa echo. Berikan izin tulis perangkat tersebut kepada akun yang menjalankan penghubung. Printer BLE GATT atau protokol vendor memerlukan backend/driver vendor yang menerima ESC/POS dan bisa dipakai melalui antrean raw; dukungan bergantung pada model.
- Gunakan `cut: true` hanya pada printer dengan pemotong yang mendukung perintah ESC/POS. Teks ESC/POS memakai ASCII kompatibel, 32 kolom untuk 58 mm dan 48 untuk 80 mm. A4 melalui CUPS dikirim sebagai PDF berisi teks.
- Pilih **Deteksi printer** untuk membaca antrean CUPS dan profil terdaftar. Profil LAN dan Bluetooth berasal dari konfigurasi penghubung. Gunakan **Tes cetak** untuk memastikan perangkat dapat menerima pekerjaan.
- Jalankan `npm run printer:bridge`. Di browser komputer yang sama, masukkan `http://127.0.0.1:17658` dan token. Izinkan akses jaringan lokal jika browser meminta.
- Simpan konfigurasi dan token secara privat. Penghubung menerima pekerjaan dari origin yang dikonfigurasi dan memerlukan token. Simpan token hanya di perangkat kasir tepercaya.

### Safari dan PWA di iOS

Pilih **Dialog cetak sistem / AirPrint** untuk printer AirPrint. Untuk printer thermal ESC/POS lainnya, komputer penghubung menangani koneksi Bluetooth, USB, atau LAN ke printer. Safari dan PWA berkomunikasi dengan komputer penghubung lewat HTTPS. Printer Bluetooth dipasangkan ke komputer tersebut.

Tambahkan pengaturan berikut pada konfigurasi penghubung untuk menerima koneksi iPhone/iPad. Gunakan nama DNS lokal yang mengarah ke komputer penghubung serta sertifikat TLS yang dipercaya iOS dan cocok dengan nama DNS itu. Batasi akses dengan firewall ke jaringan kasir.

```json
{
  "host": "192.168.1.20",
  "port": 17658,
  "tls": { "key": "/lokasi/private-key.pem", "cert": "/lokasi/fullchain.pem" }
}
```

Di iOS, masukkan alamat seperti `https://printer.example.com:17658`, masukkan token lalu tes cetak. Jika kebijakan browser atau jaringan memblokir akses lokal, gunakan AirPrint bila tersedia atau cetak dari browser komputer penghubung.

## Pembayaran dan cetak ulang

Aktifkan **Cetak otomatis** setelah memilih printer penghubung. Kasir mencetak setelah penjualan diterima server atau tersimpan di antrean offline perangkat. Struk offline memakai nomor sementara dan sinkronisasi tidak mencetak salinan kedua. Pembayaran awal saat pesanan jasa dibuat dan pembayaran dari layar detail mencetak nota. Pembayaran hunian yang dicatat sebagai terverifikasi atau diverifikasi dari layar Pembayaran mencetak kwitansi bila fitur kwitansi aktif. Pembayaran yang diproses oleh webhook tidak memicu pekerjaan cetak di browser. Bila pekerjaan gagal, buka struk dari riwayat penjualan, antrean offline, atau nota pesanan untuk mencetak ulang. Kwitansi terverifikasi dapat dicetak melalui printer default, dan tampilan kwitansi lengkap tetap tersedia untuk cetak/PDF. Periksa hasil fisik sebelum mengulang pekerjaan yang hasilnya belum pasti.
