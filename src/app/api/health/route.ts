import { NextResponse } from 'next/server';
import { getApplicationHealth } from '@/server/health/health-service';

export async function GET() {
  return NextResponse.json(getApplicationHealth());
}
