import {
  BLOB_PRESIGN_QUERY_TTL_DAYS,
  buildPresignCanonicalQueryEntries,
} from './presign-query-params';

const nowMs = 1_700_000_000_000;
const delegation = { validUntil: nowMs + 3_600_000 };

describe('buildPresignCanonicalQueryEntries ttlDays', () => {
  it('signs ttlDays into the presigned put URL', () => {
    const entries = buildPresignCanonicalQueryEntries({
      operation: 'put',
      delegation,
      urlOptions: { ttlDays: 7 },
      nowMs,
    });
    expect(entries).toContainEqual([BLOB_PRESIGN_QUERY_TTL_DAYS, '7']);
  });

  it.each([0, 31, 1.5])('rejects ttlDays=%p', (ttlDays) => {
    expect(() =>
      buildPresignCanonicalQueryEntries({
        operation: 'put',
        delegation,
        urlOptions: { ttlDays },
        nowMs,
      }),
    ).toThrow('ttlDays must be an integer between 1 and 30');
  });
});
