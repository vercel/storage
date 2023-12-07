import { BaseDialect } from './dialect';
import type { TqlQuery } from './nodes';

describe('base dialect', () => {
  it('should not preprocess the ast', () => {
    const dialect = new BaseDialect(
      () => 0,
      () => 0,
    );
    const ast = { nodes: [], type: 'query' } satisfies TqlQuery;
    expect(dialect.preprocess(ast)).toEqual(ast);
  });
  it('should not postprocess the query', () => {
    const dialect = new BaseDialect(
      () => 0,
      () => 0,
    );
    const query = 'SELECT * FROM foo';
    const params: unknown[] = [];
    expect(dialect.postprocess(query, params)).toEqual([query, params]);
  });
});
