type VercelPostgresKyselyErrorCode =
  | 'kysely_transactions_not_supported'
  | 'kysely_streaming_not_supported';

export class VercelPostgresKyselyError extends Error {
  public constructor(
    public code: VercelPostgresKyselyErrorCode,
    message: string,
  ) {
    super(`VercelPostgresError - '${code}': ${message}`);
    this.name = 'VercelPostgresError';
  }
}
