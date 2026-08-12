# Setelah deploy ke Netlify

1. Deploy folder project ini ke site Netlify baru.
2. Pastikan Environment Variables sudah dipindahkan.
3. Endpoint webhook yang harus dipakai di Biteship:
   `https://NAMA-SITE-BARU.netlify.app/.netlify/functions/biteship-webhook`
4. Di Biteship > Integrasi > Webhook:
   - hapus webhook lama yang masih menunjuk ke site lama;
   - buat webhook baru dengan URL di atas;
   - event: `order.status`;
   - gunakan Signature Key dan Signature Secret yang sama dengan Netlify:
     - `BITESHIP_WEBHOOK_SIGNATURE_KEY`
     - `BITESHIP_WEBHOOK_SIGNATURE_SECRET`
5. Setelah webhook aktif, lakukan pengujian order/status. Di Events Log Biteship harus terlihat HTTP 200.
6. Admin: untuk COD, pilih/biarkan status `Dikemas`, lalu tekan `🚚 Buat Pengiriman`. Setelah order Biteship dibuat, status dan resi akan diperbarui oleh webhook.
7. Admin sekarang memiliki tombol `🗑️ Hapus Pesanan` di setiap kartu pesanan. Pesanan yang belum diproses akan mengembalikan stok. Pesanan yang sudah punya resi/pengiriman hanya menghapus data lokal dan TIDAK membatalkan pengiriman Biteship.
