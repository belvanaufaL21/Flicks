"use client";

import { motion } from "motion/react";
import { ArrowUpRight, Palette, Repeat, Ruler, Wallet } from "lucide-react";
import { easeOut } from "@/components/motion/reveal";
import { DomeSection, MorphBlob } from "@/components/motion/shapes";
import { SectionHeading } from "./section-heading";

const items = [
  {
    icon: Palette,
    problem: "Bingung warna apa yang bikin wajah terlihat segar?",
    answer: "Estimasi season dan palet warna yang layak kamu coba.",
  },
  {
    icon: Ruler,
    problem: "Tidak yakin potongan baju yang pas untuk bentuk tubuhmu?",
    answer: "Estimasi body shape beserta panduan siluet dan fit.",
  },
  {
    icon: Wallet,
    problem: "Konsultasi personal color manual terasa mahal dan ribet?",
    answer: "Coba sendiri dari rumah dengan harga transparan.",
  },
  {
    icon: Repeat,
    problem: "Tidak mau terikat langganan bulanan?",
    answer: "Cukup beli satu token, pakai sekali, selesai.",
  },
];

export function Problems() {
  return (
    <DomeSection className="bg-paper pt-32 pb-24 lg:pb-32">
      <MorphBlob className="pointer-events-none absolute -left-32 top-40 h-[420px] w-[420px] text-accent-soft/70" />
      <MorphBlob
        duration={18}
        className="pointer-events-none absolute -right-24 bottom-10 h-[320px] w-[320px] text-line/50"
      />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          eyebrow="Dari ragu jadi yakin"
          title={
            <>
              Ubah pertanyaan sehari-hari jadi <em className="text-accent">panduan gaya</em>.
            </>
          }
          description="FLICKS Lite dirancang untuk kamu yang ingin mengenal warna dan siluet diri sendiri, dengan konteks yang relevan untuk pengguna Indonesia."
        />

        <ol className="mt-16 border-t border-line">
          {items.map(({ icon: Icon, problem, answer }, i) => (
            <motion.li
              key={problem}
              initial="hidden"
              whileInView="show"
              whileHover="hover"
              viewport={{ once: true, amount: 0.6 }}
              className="group relative grid cursor-default gap-4 border-b border-line py-8 md:grid-cols-[5rem_1fr_1.1fr_auto] md:items-center md:gap-8"
            >
              {/* Hover sweep: an arch-ended pill fills the row from the left */}
              <motion.span
                variants={{ hidden: { scaleX: 0 }, show: { scaleX: 0 }, hover: { scaleX: 1 } }}
                transition={{ duration: 0.55, ease: easeOut }}
                className="absolute inset-y-2 -inset-x-4 origin-left rounded-full bg-accent-soft/60"
              />
              <span className="relative font-display text-4xl text-accent">0{i + 1}</span>

              <p className="relative text-muted">
                {/* Strike line draws across every wrapped line once the row is visible */}
                <motion.span
                  variants={{ hidden: { backgroundSize: "0% 1px" }, show: { backgroundSize: "100% 1px" } }}
                  transition={{ duration: 0.9, ease: easeOut, delay: 0.35 }}
                  className="bg-[linear-gradient(var(--color-accent),var(--color-accent))] bg-[position:0_55%] bg-no-repeat"
                >
                  {problem}
                </motion.span>
              </p>

              <motion.p
                variants={{ hidden: { opacity: 0, x: -16 }, show: { opacity: 1, x: 0 } }}
                transition={{ duration: 0.7, ease: easeOut, delay: 0.6 }}
                className="relative font-display text-2xl leading-snug text-ink sm:text-3xl"
              >
                {answer}
              </motion.p>

              <motion.span
                variants={{ hidden: { rotate: 0 }, show: { rotate: 0 }, hover: { rotate: 45, scale: 1.1 } }}
                className="relative hidden h-14 w-14 items-center justify-center rounded-full bg-ink text-paper md:flex"
              >
                <Icon size={20} className="transition-opacity duration-300 group-hover:opacity-0" />
                <ArrowUpRight size={20} className="absolute -rotate-45 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              </motion.span>
            </motion.li>
          ))}
        </ol>
      </div>
    </DomeSection>
  );
}
