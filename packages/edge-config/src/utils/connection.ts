const privateEdgeConfigSymbol = Symbol.for('privateEdgeConfig');

/**
 * The parsed info contained in a connection string.
 */
export class Connection {
  baseUrl: string;
  id: string;
  token: string;
  version: string;
  type: 'vercel' | 'external';

  constructor(options: {
    baseUrl: string;
    id: string;
    token: string;
    version: string;
    type: 'vercel' | 'external';
  }) {
    this.baseUrl = options.baseUrl;
    this.id = options.id;
    this.token = options.token;
    this.version = options.version;
    this.type = options.type;
  }

  getMostRecentUpdateTimestamp(): number | null {
    const privateEdgeConfig = Reflect.get(
      globalThis,
      privateEdgeConfigSymbol,
    ) as { getUpdatedAt: (id: string) => number | null } | undefined;

    return typeof privateEdgeConfig === 'object' &&
      typeof privateEdgeConfig.getUpdatedAt === 'function'
      ? privateEdgeConfig.getUpdatedAt(this.id)
      : null;
  }
}

/**
 * Parses internal edge config connection strings
 *
 * Internal edge config connection strings are those which are native to Vercel.
 *
 * Internal Edge Config Connection Strings look like this:
 * https://edge-config.vercel.com/<edgeConfigId>?token=<token>
 */
function parseVercelConnectionStringFromUrl(text: string): Connection | null {
  try {
    const url = new URL(text);
    if (url.host !== 'edge-config.vercel.com') return null;
    if (url.protocol !== 'https:') return null;
    if (!url.pathname.startsWith('/ecfg')) return null;

    const id = url.pathname.split('/')[1];
    if (!id) return null;

    const token = url.searchParams.get('token');
    if (!token || token === '') return null;

    return new Connection({
      type: 'vercel',
      baseUrl: `https://edge-config.vercel.com/${id}`,
      id,
      version: '1',
      token,
    });
  } catch {
    return null;
  }
}

/**
 * Parses a connection string with the following format:
 * `edge-config:id=ecfg_abcd&token=xxx`
 */
function parseConnectionFromQueryParams(text: string): Connection | null {
  try {
    if (!text.startsWith('edge-config:')) return null;
    const params = new URLSearchParams(text.slice(12));

    const id = params.get('id');
    const token = params.get('token');

    if (!id || !token) return null;

    return new Connection({
      type: 'vercel',
      baseUrl: `https://edge-config.vercel.com/${id}`,
      id,
      version: '1',
      token,
    });
  } catch {
    // no-op
  }

  return null;
}

/**
 * Parses info contained in connection strings.
 *
 * This works with the vercel-provided connection strings, but it also
 * works with custom connection strings.
 *
 * The reason we support custom connection strings is that it makes testing
 * edge config really straightforward. Users can provide  connection strings
 * pointing to their own servers and then either have a custom server
 * return the desired values or even intercept requests with something like
 * msw.
 *
 * To allow interception we need a custom connection string as the
 * edge-config.vercel.com connection string might not always go over
 * the network, so msw would not have a chance to intercept.
 */
/**
 * Parses external edge config connection strings
 *
 * External edge config connection strings are those which are foreign to Vercel.
 *
 * External Edge Config Connection Strings look like this:
 * - https://example.com/?id=<edgeConfigId>&token=<token>
 * - https://example.com/<edgeConfigId>?token=<token>
 */
function parseExternalConnectionStringFromUrl(
  connectionString: string,
): Connection | null {
  try {
    const url = new URL(connectionString);

    let id: string | null = url.searchParams.get('id');
    const token = url.searchParams.get('token');
    const version = url.searchParams.get('version') || '1';

    // try to determine id based on pathname if it wasn't provided explicitly
    if (!id || url.pathname.startsWith('/ecfg_')) {
      id = url.pathname.split('/')[1] || null;
    }

    if (!id || !token) return null;

    // remove all search params for use as baseURL
    url.search = '';

    // try to parse as external connection string
    return new Connection({
      type: 'external',
      baseUrl: url.toString(),
      id,
      token,
      version,
    });
  } catch {
    return null;
  }
}

/**
 * Parse the edgeConfigId and token from an Edge Config Connection String.
 *
 * Edge Config Connection Strings usually look like one of the following:
 *  - https://edge-config.vercel.com/<edgeConfigId>?token=<token>
 *  - edge-config:id=<edgeConfigId>&token=<token>
 *
 * @param text - A potential Edge Config Connection String
 * @returns The connection parsed from the given Connection String or null.
 */
export function parseConnectionString(
  connectionString: string,
): Connection | null {
  return (
    parseConnectionFromQueryParams(connectionString) ||
    parseVercelConnectionStringFromUrl(connectionString) ||
    parseExternalConnectionStringFromUrl(connectionString)
  );
}
