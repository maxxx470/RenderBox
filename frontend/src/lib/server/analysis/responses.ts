// The answer a route gives when the analysis stops a render (2026-10-22
// specification, step 3): a clear code, and every credit already given back
// by the route. `error` carries the code, as ApiError.code reads it.
import 'server-only';
import { NextResponse } from 'next/server';
import type { PipelineResult } from './pipeline';

const ANSWERS = {
  unreadable: { status: 422, code: 'ANALYSIS_UNREADABLE' },
  not_configured: { status: 503, code: 'ANALYSIS_NOT_CONFIGURED' },
  timeout: { status: 504, code: 'ANALYSIS_TIMEOUT' },
  failed: { status: 502, code: 'ANALYSIS_FAILED' },
} as const;

export function analysisFailureResponse(
  result: Extract<PipelineResult, { ok: false }>,
  requestId: string,
): NextResponse {
  const a = ANSWERS[result.reason];
  return NextResponse.json(
    { error: a.code, step: result.step, message: 'The image analysis did not succeed' },
    { status: a.status, headers: { 'x-request-id': requestId } },
  );
}
