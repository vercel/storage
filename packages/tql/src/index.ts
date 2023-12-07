import { createQueryBuilder, isTemplateStringsArray } from './utils';
import { TqlError } from './error';
import type { CompiledQuery, Init } from './types';
import {
  TqlIdentifiers,
  TqlList,
  TqlNode,
  TqlParameter,
  TqlQuery,
  TqlFragment,
  TqlTemplateString,
  TqlValues,
  type TqlNodeType,
  TqlSet,
} from './nodes';
import { build } from './build';

export type * from './nodes';
export type * from './types';
export { PostgresDialect } from './dialects/postgres';

export const init: Init = ({ dialect: Dialect }) => {
  return {
    query: (strings, ...values): CompiledQuery => {
      const query = parseTemplate(TqlQuery, strings, values);
      const qb = createQueryBuilder();
      const d = new Dialect(qb.appendToQuery, qb.appendToParams);
      const preprocessed = d.preprocess(query);
      build(d, preprocessed);
      return d.postprocess(qb.query, qb.params);
    },
    fragment: (strings, ...values) =>
      parseTemplate(TqlFragment, strings, values),
    identifiers: (ids) => new TqlIdentifiers(ids),
    list: (vals) => new TqlList(vals),
    values: (entries) => new TqlValues(entries),
    set: (entries) => new TqlSet(entries),
    unsafe: (str) => new TqlTemplateString(str),
  };
};

function parseTemplate<TResult extends TqlQuery | TqlFragment>(
  FragmentCtor: new (
    nodes: TqlNode<Exclude<TqlNodeType, 'query'>>[],
  ) => TResult,
  strings: TemplateStringsArray,
  values: unknown[],
): TResult {
  if (
    !isTemplateStringsArray(strings) ||
    !Array.isArray(values) ||
    strings.length !== values.length + 1
  ) {
    throw new TqlError('untemplated_sql_call');
  }

  const nodes: TqlNode<Exclude<TqlNodeType, 'query'>>[] = [];

  let nodeInsertIndex = 0;
  for (let i = 0; i < strings.length; i++) {
    // @ts-expect-error -- the line above this makes this clearly valid
    nodes[nodeInsertIndex++] = new TqlTemplateString(strings[i]);

    if (i === values.length) {
      continue;
    }

    const interpolatedValues = (
      Array.isArray(values[i]) ? values[i] : [values[i]]
    ) as unknown[];

    for (const value of interpolatedValues) {
      if (!(value instanceof TqlNode)) {
        nodes[nodeInsertIndex++] = new TqlParameter(value ?? null); // disallow undefined
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- this is silly generic stuff
      nodes[nodeInsertIndex++] = value;
    }
  }

  return new FragmentCtor(nodes);
}
