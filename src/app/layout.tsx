import type { Metadata } from "next";
import { Instrument_Serif, Plus_Jakarta_Sans } from "next/font/google";
import { MotionProvider } from "@/components/motion/motion-provider";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "FLICKS Lite — AI Personal Color, Body Shape & Virtual Try-On",
  description:
    "Estimasi personal color, analisis body shape, dan virtual try-on berbasis AI dalam satu paket Rp19.000. Tanpa akun, tanpa langganan, laporan privat 72 jam.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      className={`${jakarta.variable} ${instrument.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
