// A single, quiet strip that drifts slowly at a constant pace. Pure CSS: the drift is a
// transform animation the GPU runs, with no JavaScript per frame. The row is repeated
// so shifting it by half its width loops seamlessly. Reduced motion stops it.
const items = ["Personal Color", "Body Shape", "Virtual Try-On", "Laporan Privat 72 Jam", "Bayar via QRIS", "Tanpa Akun"];

export function Marquee() {
  const row = [...items, ...items, ...items, ...items];
  return (
    <div className="relative overflow-hidden border-y border-line/80 py-5">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-32 bg-gradient-to-r from-cream to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-32 bg-gradient-to-l from-cream to-transparent" />
      <ul className="flex w-max animate-[marquee_56s_linear_infinite] items-center gap-12 motion-reduce:animate-none">
        {row.map((item, i) => (
          <li key={i} className="flex items-center gap-12 font-display text-xl italic text-muted">
            {item}
            <span className="h-1 w-1 rounded-full bg-accent/60" aria-hidden="true" />
          </li>
        ))}
      </ul>
    </div>
  );
}
