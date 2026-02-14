/**
 * GET /api/health
 * Health check for load balancers and monitoring.
 * Returns 200 if the app is running.
 */

import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    ok: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
  })
}
