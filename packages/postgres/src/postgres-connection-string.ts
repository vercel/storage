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

export function isLocalhostConnectionString(connectionString: string): boolean {
  try {
    // This seems silly, but we can use all of the hard work put into URL parsing
    // if we just convert `postgresql://` to `https://` and then parse it as a URL.
    const withHttpsProtocol = connectionString.replace(
      /^postgresql:\/\//,
      'https://',
    );
    return new URL(withHttpsProtocol).hostname === 'localhost';
  } catch (err) {
    if (err instanceof TypeError) {
      return false;
    }
    // ok typescript
    if (
      typeof err === 'object' &&
      err !== null &&
      'message' in err &&
      typeof err.message === 'string' &&
      err.message === 'Invalid URL'
    ) {
      return false;
    }
    throw err;
  }
}
