type VercelPostgresErrorCode =
  | 'invalid_connection_string'
  | 'missing_connection_string'
  | 'invalid_connection_type'
  | 'incorrect_tagged_template_call';

export class VercelPostgresError extends Error {
  public constructor(
    public code: VercelPostgresErrorCode,
    message: string,
  ) {
    super(`VercelPostgresError - '${code}': ${message}`);
    this.name = 'VercelPostgresError';
  }
}
