import {
  createClient,
  createPool,
  postgresConnectionString,
  sql,
  db,
} from './index';

describe('@vercel/postgres', () => {
  it('exports createPool', () => {
    expect(typeof createClient).toEqual('function');
  });
  it('exports createClient', () => {
    expect(typeof createPool).toEqual('function');
  });
  it('exports sql', () => {
    expect(typeof sql).toEqual('function');
  });
  it('exports postgresConnectionString', () => {
    expect(typeof postgresConnectionString).toEqual('function');
  });
  it('exports a default db pool instance', () => {
    expect(typeof db).toEqual('function');
  });
});
