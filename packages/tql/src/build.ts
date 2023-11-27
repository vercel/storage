import { TqlError } from './error';
import { type TqlQuery, type TqlFragment, type TqlNodeType } from './nodes';
import type { DialectImpl } from './types';

// TODO: test
export function build(dialect: DialectImpl, ast: TqlQuery | TqlFragment): void {
  const actions = {
    identifiers: dialect.identifiers.bind(dialect),
    list: dialect.list.bind(dialect),
    values: dialect.values.bind(dialect),
    'update-set': dialect.set.bind(dialect),
    string: dialect.string.bind(dialect),
    parameter: dialect.parameter.bind(dialect),
    fragment: (node) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- see below
      build(dialect, node);
    },
    query: (): void => {
      throw new TqlError('illegal_query_recursion');
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- this is technically possible to get right, but really hard and unimportant
  } satisfies { [key in TqlNodeType]: (node: any) => void };
  for (const node of ast.nodes) {
    actions[node.type](node);
  }
}
