import React, { Suspense } from 'react';
import { ReportView } from './report-view';

async function ReportContent({
  params,
}: {
  params: Promise<{ secret: string }>;
}) {
  const { secret } = await params;
  return <ReportView secret={secret} />;
}

export default function ReportPage({
  params,
}: {
  params: Promise<{ secret: string }>;
}) {
  return (
    <Suspense fallback={<main className="min-h-screen p-6">Memuat laporan...</main>}>
      <ReportContent params={params} />
    </Suspense>
  );
}
