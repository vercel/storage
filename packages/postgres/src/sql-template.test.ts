import { VercelPostgresError } from './error';
import { sqlTemplate, fragment } from './sql-template';

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
  {
    input: sqlTemplate`SELECT * FROM users WHERE ${fragment`id = ${123}`}`,
    output: ['SELECT * FROM users WHERE id = $1', [123]],
  },
  {
    input: (() => {
      const filterOnFoo = Boolean('true');
      const filter = filterOnFoo
        ? fragment`foo = ${123}`
        : fragment`bar = ${234}`;
      return sqlTemplate`SELECT * FROM users WHERE ${filter}`;
    })(),
    output: ['SELECT * FROM users WHERE foo = $1', [123]],
  },
  {
    input: (() => {
      const sharedValues = fragment`${123}, ${'admin'}`;
      return sqlTemplate`INSERT INTO users (id, credits, role) VALUES (1, ${sharedValues}), (2, ${sharedValues})`;
    })(),
    output: [
      'INSERT INTO users (id, credits, role) VALUES (1, $1, $2), (2, $1, $2)',
      [123, 'admin'],
    ],
  },
  {
    input: (() => {
      const column = fragment`foo`;
      const filter = fragment`${column} = ${123}`;
      return sqlTemplate`SELECT ${column} FROM table WHERE ${filter}`;
    })(),
    output: ['SELECT foo FROM table WHERE foo = $1', [123]],
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

describe('fragment', () => {
  it('throws when deliberately not used as a tagged literal to try to make us look dumb', () => {
    const likes = 100;
    expect(() => {
      // @ts-expect-error - intentionally incorrect usage
      fragment([`likes > ${likes}`]);
    }).toThrow(VercelPostgresError);
    expect(() => {
      // @ts-expect-error - intentionally incorrect usage
      fragment(`likes > ${likes}`, 123);
    }).toThrow(VercelPostgresError);
  });
});
