import type { Metadata } from "next";
import { AnalyzeFlow } from "@/components/analyze/analyze-flow";
import { FlowHeader } from "@/components/analyze/flow-header";

export const metadata: Metadata = {
  title: "Mulai Analisis — FLICKS Lite",
  robots: { index: false },
};

// Static shell; the flow loads its state from /api/session in the browser.
export default function AnalyzePage() {
  return (
    <>
      <FlowHeader />
      <main className="flex-1">
        <AnalyzeFlow />
      </main>
    </>
  );
}
