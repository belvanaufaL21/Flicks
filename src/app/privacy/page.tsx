import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Kebijakan Privasi Foto · FLICKS Lite',
  description:
    'Informasi pemrosesan, penyimpanan privat, retensi maksimal 72 jam, dan penghapusan foto pengguna di FLICKS Lite.',
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 text-stone-900">
      <p className="text-xs font-bold tracking-widest text-stone-600">
        FLICKS LITE · PRIVASI FOTO
      </p>
      <h1 className="mt-2 text-3xl font-bold">
        Kebijakan Privasi &amp; Penanganan Foto
      </h1>
      <p className="mt-4 leading-relaxed text-stone-700">
        Halaman ini menjelaskan bagaimana FLICKS Lite mengumpulkan, memvalidasi,
        memproses, menyimpan sementara, dan menghapus foto yang Anda unggah.
      </p>

      <section className="mt-8 space-y-2">
        <h2 className="text-xl font-semibold">1. Tujuan Pengumpulan Foto</h2>
        <p className="leading-relaxed text-stone-700">
          Setiap sesi paket membutuhkan tepat satu foto wajah (untuk analisis
          Personal Color) dan satu foto seluruh tubuh (untuk analisis Body Shape
          serta Virtual Try-On). Foto hanya diproses setelah Anda memberikan
          persetujuan eksplisit.
        </p>
      </section>

      <section className="mt-6 space-y-2">
        <h2 className="text-xl font-semibold">
          2. Penyimpanan Privat &amp; Batas Akses
        </h2>
        <p className="leading-relaxed text-stone-700">
          Foto yang lolos validasi disimpan di bucket privat Supabase Storage
          menggunakan pengenal acak (opaque path) yang hanya dapat diakses oleh
          server. FLICKS Lite tidak membuka akses publik dan tidak menghasilkan
          URL foto publik.
        </p>
      </section>

      <section className="mt-6 space-y-2">
        <h2 className="text-xl font-semibold">3. Pemrosesan Pihak Ketiga</h2>
        <p className="leading-relaxed text-stone-700">
          Untuk menghasilkan laporan gaya personal, foto dikirim dari server ke
          penyedia AI pihak ketiga sesuai fungsinya: Google Gemini untuk
          analisis Personal Color dan Body Shape, serta FASHN untuk Virtual
          Try-On. File yang tidak valid ditolak sebelum pemanggilan layanan AI
          berbayar dilakukan.
        </p>
      </section>

      <section className="mt-6 space-y-2">
        <h2 className="text-xl font-semibold">
          4. Retensi Maksimal 72 Jam &amp; Penghapusan
        </h2>
        <p className="leading-relaxed text-stone-700">
          Unggahan yang ditolak langsung dibuang tanpa disimpan. Foto yang
          diterima dan dikelola aplikasi dihapus segera setelah proses analisis
          atau Virtual Try-On tidak lagi membutuhkannya, dengan batas waktu
          penyimpanan maksimal 72 jam sejak diunggah beserta metadata terkait.
        </p>
      </section>

      <section className="mt-6 space-y-2">
        <h2 className="text-xl font-semibold">5. Kontak Privasi</h2>
        <p className="leading-relaxed text-stone-700">
          Saluran kontak resmi untuk pertanyaan privasi dan permintaan terkait
          data sedang menunggu konfirmasi pemilik proyek sebelum peluncuran
          publik (soft launch).
        </p>
      </section>
    </main>
  );
}
