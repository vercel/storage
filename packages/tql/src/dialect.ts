import type { TqlQuery } from './nodes';

export class BaseDialect {
  constructor(
    protected readonly appendToQuery: (...values: string[]) => number,
    protected readonly appendToParams: (...values: unknown[]) => number,
  ) {}

  preprocess(ast: TqlQuery): TqlQuery {
    return ast;
  }

  postprocess(query: string, values: unknown[]): [string, unknown[]] {
    return [query, values];
  }
}
