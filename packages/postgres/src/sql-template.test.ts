import { QueryResult, QueryResultRow } from '@neondatabase/serverless';
import { VercelPostgresError } from './error';
import { Primitive, SqlTemplate } from './sql-template';

// this is just a mock that causes `execute` to return the internal state of the SqlTemplate
const returnBuiltDbQuery = jest.fn(
  <O extends QueryResultRow>(
    query: string,
    params?: Primitive[],
  ): Promise<QueryResult<O>> =>
    Promise.resolve([query, params] as unknown as QueryResult<O>),
);

const validCases = [
  {
    input: new SqlTemplate(returnBuiltDbQuery)
      .append`SELECT * FROM users WHERE id = ${123}`,
    output: ['SELECT * FROM users WHERE id = $1', [123]],
  },
  {
    input: new SqlTemplate(returnBuiltDbQuery)
      .append`SELECT * FROM users WHERE id = ${123} AND name = ${'John'}`,
    output: ['SELECT * FROM users WHERE id = $1 AND name = $2', [123, 'John']],
  },
  {
    input: new SqlTemplate(returnBuiltDbQuery).append`SELECT *`
      .append` FROM users WHERE name = ${'John; DROP TABLE users;--'}`,
    output: [
      'SELECT * FROM users WHERE name = $1',
      ['John; DROP TABLE users;--'],
    ],
  },
  {
    input: new SqlTemplate(returnBuiltDbQuery).append`SELECT * FROM users`
      .append` WHERE name = ${'John AND 1=1'}`,
    output: ['SELECT * FROM users WHERE name = $1', ['John AND 1=1']],
  },
];

beforeEach(() => {
  returnBuiltDbQuery.mockClear();
});

describe('append', () => {
  it.each(validCases)(
    'should return a query and params',
    async ({ input, output }) => {
      const built = input.build();
      expect(built).toEqual(output);
      await input.execute();
      expect(returnBuiltDbQuery).toHaveBeenCalledWith(...built);
    },
  );
  it('throws when accidentally not used as a tagged literal', () => {
    const likes = 100;
    expect(() => {
      new SqlTemplate(returnBuiltDbQuery).append(
        // @ts-expect-error - intentionally incorrect usage
        `SELECT * FROM posts WHERE likes > ${likes}`,
      );
    }).toThrow(VercelPostgresError);
  });
  it('throws when deliberately not used as a tagged literal to try to make us look dumb', () => {
    const likes = 100;
    expect(() => {
      // @ts-expect-error - intentionally incorrect usage
      new SqlTemplate(returnBuiltDbQuery).append([
        `SELECT * FROM posts WHERE likes > ${likes}`,
      ]);
    }).toThrow(VercelPostgresError);
    expect(() => {
      new SqlTemplate(returnBuiltDbQuery).append(
        // @ts-expect-error - intentionally incorrect usage
        `SELECT * FROM posts WHERE likes > ${likes}`,
        123,
      );
    }).toThrow(VercelPostgresError);
  });
});
