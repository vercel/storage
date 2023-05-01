import { sqlTemplate } from './sql-template';

const cases = [
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
  it.each(cases)('should return a query and params', ({ input, output }) => {
    expect(input).toEqual(output);
  });
});
