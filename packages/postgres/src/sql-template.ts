import { type CompiledQuery, init, PostgresDialect } from '@sejohnson/tql';
import { VercelPostgresError } from './error';

const { query, ...rest } = init({ dialect: PostgresDialect });

export const tql = {
  query: (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): CompiledQuery => {
    try {
      return query(strings, ...values);
    } catch (e) {
      // this is for backwards-compatibility; there's no reason we can't remove it in a future major
      if (
        typeof e === 'object' &&
        e !== null &&
        'code' in e &&
        typeof e.code === 'string' &&
        e.code === 'untemplated_sql_call'
      ) {
        throw new VercelPostgresError(
          'incorrect_tagged_template_call',
          "It looks like you tried to call `sql` as a function. Make sure to use it as a tagged template.\n\tExample: sql`SELECT * FROM users`, not sql('SELECT * FROM users')",
        );
      }
      throw e;
    }
  },
  ...rest,
};
