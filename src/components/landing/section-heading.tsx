import { Reveal } from "@/components/motion/reveal";

type Props = {
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "left" | "center";
  tone?: "light" | "dark";
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  tone = "light",
}: Props) {
  const centered = align === "center";
  const dark = tone === "dark";

  return (
    <div className={centered ? "mx-auto max-w-2xl text-center" : "max-w-xl"}>
      <Reveal>
        <p
          className={`text-xs font-semibold uppercase tracking-[0.22em] ${
            dark ? "text-rose" : "text-plum"
          }`}
        >
          {eyebrow}
        </p>
      </Reveal>
      <Reveal delay={0.08}>
        <h2
          className={`mt-4 font-display text-4xl leading-[1.05] tracking-tight sm:text-5xl ${
            dark ? "text-paper" : "text-ink"
          }`}
        >
          {title}
        </h2>
      </Reveal>
      {description && (
        <Reveal delay={0.16}>
          <p
            className={`mt-5 text-base leading-relaxed sm:text-lg ${
              dark ? "text-paper/70" : "text-muted"
            }`}
          >
            {description}
          </p>
        </Reveal>
      )}
    </div>
  );
}
