import type {
  ClientBase,
  ClientConfig,
  PoolConfig,
  QueryResult,
  QueryResultRow,
} from '@neondatabase/serverless';

export type {
  Pool,
  Client,
  Query,
  QueryArrayConfig,
  QueryArrayResult,
  QueryConfig,
  QueryParse,
  QueryResult,
  QueryResultBase,
  QueryResultRow,
  FieldDef,
} from '@neondatabase/serverless';

type ConfigItemsToOmit = 'user' | 'database' | 'password' | 'host' | 'port';
export type VercelPostgresClientConfig = Omit<ClientConfig, ConfigItemsToOmit>;
export type VercelPostgresPoolConfig = Omit<PoolConfig, ConfigItemsToOmit>;

export interface VercelClientBase extends ClientBase {
  sql: <O extends QueryResultRow>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<QueryResult<O>>;
}

export interface VercelPoolClient extends VercelClientBase {
  release: (err?: Error | boolean) => void;
}
