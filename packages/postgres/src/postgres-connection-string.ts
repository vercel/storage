import { VercelPostgresError } from './error';

export type ConnectionStringType = 'pool' | 'direct';

export function postgresConnectionString(
  type: ConnectionStringType = 'pool',
): string | undefined {
  let connectionString: string | undefined;

  switch (type) {
    case 'pool': {
      connectionString = process.env.POSTGRES_URL;
      break;
    }
    case 'direct': {
      connectionString = process.env.POSTGRES_URL_NON_POOLING;
      break;
    }
    default: {
      const _exhaustiveCheck: never = type;
      const str = _exhaustiveCheck as string;
      throw new VercelPostgresError(
        'invalid_connection_type',
        `Unhandled type: ${str}`,
      );
    }
  }

  if (connectionString === 'undefined') connectionString = undefined;
  return connectionString;
}

export function isPooledConnectionString(connectionString: string): boolean {
  return connectionString.includes('-pooler.');
}

export function isDirectConnectionString(connectionString: string): boolean {
  return !isPooledConnectionString(connectionString);
}
