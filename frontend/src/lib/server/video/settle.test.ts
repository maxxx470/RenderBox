// Money moves on these decisions, and there is no paid trial run to catch a
// mistake. Every branch is pinned here.
import { describe, it, expect } from 'vitest';
import { VIDEO_JOB_DEADLINE_MS, decideVideoExpiry, decideVideoSettlement } from './settle';
import { readVideoUrl } from './kie-video';
import { isValidVideoCallbackToken, videoCallbackUrl, videoCallbackToken } from './callback-token';

const base = {
  current: 'RUNNING' as const,
  creditsCharged: 85,
  providerCredits: null,
  alreadyRefunded: false,
  videoUrl: null,
};

describe('settling a video job', () => {
  it('never reopens a job that already ended', () => {
    for (const current of ['SUCCEEDED', 'FAILED', 'EXPIRED'] as const) {
      const out = decideVideoSettlement({ ...base, current, state: 'fail' });
      expect(out.status).toBe(current);
      expect(out.refund).toBe(0);
    }
  });

  it('refunds in full when Kie failed', () => {
    const out = decideVideoSettlement({ ...base, state: 'fail' });
    expect(out.status).toBe('FAILED');
    expect(out.refund).toBe(85);
    expect(out.failCode).toBe('PROVIDER_FAILED');
  });

  it('treats a success with no clip as a failure, and refunds it', () => {
    // Billing for a video that does not exist is the worst of the outcomes.
    const out = decideVideoSettlement({ ...base, state: 'success', videoUrl: null });
    expect(out.status).toBe('FAILED');
    expect(out.refund).toBe(85);
    expect(out.failCode).toBe('NO_RESULT');
    expect(out.store).toBe(false);
  });

  it('gives back the difference when the clip cost less than the estimate', () => {
    // The other half of shipping on published prices rather than verified ones.
    const out = decideVideoSettlement({
      ...base,
      state: 'success',
      videoUrl: 'https://file.kie.ai/a.mp4',
      providerCredits: 70,
    });
    expect(out.status).toBe('SUCCEEDED');
    expect(out.refund).toBe(15);
    expect(out.store).toBe(true);
  });

  it('refunds nothing when the clip cost more than we sold it for', () => {
    // The loss is ours and stays visible in the row; nothing is clawed back
    // from a user who already has their video.
    const out = decideVideoSettlement({
      ...base,
      state: 'success',
      videoUrl: 'https://file.kie.ai/a.mp4',
      providerCredits: 120,
    });
    expect(out.status).toBe('SUCCEEDED');
    expect(out.refund).toBe(0);
  });

  it('refunds nothing twice', () => {
    const out = decideVideoSettlement({ ...base, state: 'fail', alreadyRefunded: true });
    expect(out.status).toBe('FAILED');
    expect(out.refund).toBe(0);
  });

  it('keeps waiting on every state that is not an ending', () => {
    for (const state of ['waiting', 'queuing', 'generating', 'something_new']) {
      const out = decideVideoSettlement({ ...base, state });
      expect(out.status).toBe('RUNNING');
      expect(out.refund).toBe(0);
    }
  });
});

describe('expiring a job whose callback never came', () => {
  const createdAt = new Date('2026-11-07T10:00:00Z');

  it('leaves a young job alone', () => {
    const out = decideVideoExpiry({
      current: 'RUNNING',
      createdAt,
      now: new Date(createdAt.getTime() + VIDEO_JOB_DEADLINE_MS - 1000),
      creditsCharged: 65,
      alreadyRefunded: false,
    });
    expect(out).toBeNull();
  });

  it('refunds a job past the deadline', () => {
    const out = decideVideoExpiry({
      current: 'RUNNING',
      createdAt,
      now: new Date(createdAt.getTime() + VIDEO_JOB_DEADLINE_MS + 1000),
      creditsCharged: 65,
      alreadyRefunded: false,
    });
    expect(out?.status).toBe('EXPIRED');
    expect(out?.refund).toBe(65);
  });

  it('never expires a job that already ended', () => {
    expect(
      decideVideoExpiry({
        current: 'SUCCEEDED',
        createdAt,
        now: new Date(createdAt.getTime() + VIDEO_JOB_DEADLINE_MS * 10),
        creditsCharged: 65,
        alreadyRefunded: false,
      }),
    ).toBeNull();
  });
});

describe('finding the clip in Kie s answer', () => {
  it('reads every shape Kie uses, because one reader would refund a good clip', () => {
    expect(readVideoUrl('{"resultUrls":["https://f.kie.ai/a.mp4"]}')).toBe(
      'https://f.kie.ai/a.mp4',
    );
    expect(readVideoUrl({ data: { result_urls: ['https://f.kie.ai/b.mp4'] } })).toBe(
      'https://f.kie.ai/b.mp4',
    );
    expect(readVideoUrl({ videoUrl: 'https://f.kie.ai/c.mp4' })).toBe('https://f.kie.ai/c.mp4');
  });

  it('says nothing rather than something wrong', () => {
    expect(readVideoUrl(null)).toBeNull();
    expect(readVideoUrl('not json')).toBeNull();
    expect(readVideoUrl({ resultUrls: [] })).toBeNull();
    expect(readVideoUrl({ resultUrls: ['/relative.mp4'] })).toBeNull();
  });
});

describe('the callback token', () => {
  const OLD = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-secret-for-video-callbacks';

  it('accepts only the token issued for that job', () => {
    expect(isValidVideoCallbackToken('job_1', videoCallbackToken('job_1'))).toBe(true);
    // A token lifted from another job is useless: it is bound to the id.
    expect(isValidVideoCallbackToken('job_2', videoCallbackToken('job_1'))).toBe(false);
    expect(isValidVideoCallbackToken('job_1', '')).toBe(false);
    expect(isValidVideoCallbackToken('job_1', 'deadbeef')).toBe(false);
  });

  it('hands Kie an absolute URL, whatever trailing slash APP_URL carries', () => {
    const url = videoCallbackUrl('job_1', 'https://www.renderpro.app/');
    expect(url.startsWith('https://www.renderpro.app/api/webhooks/kie-video?job=job_1')).toBe(true);
    expect(url).toContain(`token=${videoCallbackToken('job_1')}`);
  });

  process.env.JWT_SECRET = OLD;
});
