import { Grain } from "@/components/motion/shapes";
import { Faq } from "@/components/landing/faq";
import { FinalCta, Footer } from "@/components/landing/final-cta";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Marquee } from "@/components/landing/marquee";
import { Navbar } from "@/components/landing/navbar";
import { Pricing } from "@/components/landing/pricing";
import { Privacy } from "@/components/landing/privacy";
import { Problems } from "@/components/landing/problems";
import { ReportPreview } from "@/components/landing/report-preview";
import { Stats } from "@/components/landing/stats";

export default function LandingPage() {
  return (
    <>
      <Grain />
      <Navbar />
      <main className="overflow-x-clip">
        <Hero />
        <Marquee />
        <Stats />
        <Problems />
        <HowItWorks />
        <ReportPreview />
        <Pricing />
        <Privacy />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
