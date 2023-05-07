import { VercelPostgresError } from './error';
import { sqlTemplate, unsafeUnescaped } from './sql-template';

const validCases = [
  {
    input: sqlTemplate`SELECT * FROM users WHERE id = ${123}`,
    output: ['SELECT * FROM users WHERE id = $1', [123]],
  },
  {
    input: sqlTemplate`SELECT * FROM users WHERE id = ${123} AND name = ${'John'}`,
    output: ['SELECT * FROM users WHERE id = $1 AND name = $2', [123, 'John']],
  },
  {
    input: sqlTemplate`SELECT * FROM users WHERE name = ${'John; DROP TABLE users;--'}`,
    output: [
      'SELECT * FROM users WHERE name = $1',
      ['John; DROP TABLE users;--'],
    ],
  },
  {
    input: sqlTemplate`SELECT * FROM users WHERE name = ${'John AND 1=1'}`,
    output: ['SELECT * FROM users WHERE name = $1', ['John AND 1=1']],
  },
];

describe('sql', () => {
  it.each(validCases)(
    'should return a query and params',
    ({ input, output }) => {
      expect(input).toEqual(output);
    },
  );
  it('throws when accidentally not used as a tagged literal', () => {
    const likes = 100;
    expect(() => {
      // @ts-expect-error - intentionally incorrect usage
      sqlTemplate(`SELECT * FROM posts WHERE likes > ${likes}`);
    }).toThrow(VercelPostgresError);
  });
  it('throws when deliberately not used as a tagged literal to try to make us look dumb', () => {
    const likes = 100;
    expect(() => {
      // @ts-expect-error - intentionally incorrect usage
      sqlTemplate([`SELECT * FROM posts WHERE likes > ${likes}`]);
    }).toThrow(VercelPostgresError);
    expect(() => {
      // @ts-expect-error - intentionally incorrect usage
      sqlTemplate(`SELECT * FROM posts WHERE likes > ${likes}`, 123);
    }).toThrow(VercelPostgresError);
  });
});

const unescapedCases = [
  {
    input: sqlTemplate`SELECT * FROM ${unsafeUnescaped(
      'users',
    )} WHERE id = ${123}`,
    output: ['SELECT * FROM users WHERE id = $1', [123]],
  },
  {
    input: sqlTemplate`SELECT * ${unsafeUnescaped(
      'FROM',
    )} users WHERE id = ${123} AND name = ${'John'}`,
    output: ['SELECT * FROM users WHERE id = $1 AND name = $2', [123, 'John']],
  },
  {
    input: sqlTemplate`SELECT ${unsafeUnescaped(
      '*',
    )} FROM users WHERE name = ${'John; DROP TABLE users;--'}`,
    output: [
      'SELECT * FROM users WHERE name = $1',
      ['John; DROP TABLE users;--'],
    ],
  },
  {
    input: sqlTemplate`SELECT * FROM users WHERE name = ${unsafeUnescaped(
      "'John'; DROP TABLE users;--",
    )}`,
    output: [
      "SELECT * FROM users WHERE name = 'John'; DROP TABLE users;--",
      [],
    ],
  },
];

describe('unsafeUnescaped', () => {
  it.each(unescapedCases)(
    'should return a query with an unchanged value',
    ({ input, output }) => {
      expect(input).toEqual(output);
    },
  );
});
