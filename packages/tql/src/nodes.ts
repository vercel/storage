import type { SetObject, ValuesObject } from './types';

export const tqlNodeTypes = [
  'list',
  'parameter',
  'template-string',
  'values',
  'set',
  'query',
  'fragment',
  'identifiers',
] as const;

export type TqlNodeType = (typeof tqlNodeTypes)[number];

export class TqlNode<T extends TqlNodeType = TqlNodeType> {
  constructor(public readonly type: T) {}
}

/**
 * A list of identifiers. Can be used to provide multiple column names in a SELECT or GROUP BY clause, for example, or
 * multiple table names in a comma-separated JOIN. The dialect is responsible for formatting the list appropriately.
 */
export class TqlIdentifiers extends TqlNode<'identifiers'> {
  constructor(public readonly values: string | string[]) {
    super('identifiers');
  }
}

/**
 * A list of values for use in an `IN` clause.
 */
export class TqlList extends TqlNode<'list'> {
  constructor(public readonly values: unknown[]) {
    super('list');
  }
}

/**
 * A parameter value.
 */
export class TqlParameter extends TqlNode<'parameter'> {
  constructor(public readonly value: unknown) {
    super('parameter');
  }
}

/**
 * A string literal. These are ONLY created by the `tql` template tag -- i.e. these strings are written by the developer,
 * not the user.
 */
export class TqlTemplateString extends TqlNode<'template-string'> {
  constructor(public readonly value: string) {
    super('template-string');
  }
}

/**
 * A VALUES clause. The ValuesObject is either a record or an array of records. The record keys are column names
 * and the record values are the values for each column. The dialect should write both "sides" of the VALUES clause,
 * i.e. `("col_1", "col_2") VALUES ($1, $2)`.
 */
export class TqlValues extends TqlNode<'values'> {
  constructor(public readonly values: ValuesObject) {
    super('values');
  }
}

/**
 * A SET clause. Given a record, the record keys are column names and the corresponding values are the values for that column.
 * The dialect should write the full SET clause, i.e. `SET "col_1" = $1, "col_2" = $2`.
 */
export class TqlSet extends TqlNode<'set'> {
  constructor(public readonly values: SetObject) {
    super('set');
  }
}

/**
 * This represents the input to a `fragment` tagged function. It is a list of nodes, which can be either strings (represented by {@link TqlTemplateString})
 * or any other {@link TqlNode} type, including other {@link TqlFragment} instances. (This would occur in nested calls to `fragment`.) It cannot contain
 * {@link TqlQuery} instances.
 *
 * ### Developer note: Why are there both Query and Fragment types?
 *
 * Fundamentally, the value returned from a `query` function needs compile to a string and a list of parameters. In order to be able to
 * recursively nest calls to `query`, we _also_ need to be able to determine that whatever "thing" is returned from `query` can be told
 * apart from any other JavaScript object, and it must be doable in such a way that it couldn't be faked by something coming from outside
 * the application (eg. a JSON document passed to `JSON.parse`). This basically leaves us with two possibilities:
 *
 * 1. Make the `query` function recursively-nestable by having it return a class instance with a `build` method. This would mean every call
 * to `query` would have to end in a call to `build`, which makes the most-common usecase (a non-nested query) worse.
 * 2. Have two separate functions, one which returns a nestable value, and the other which returns a compiled query. Hence, `query` and `fragment`.
 */
export class TqlFragment extends TqlNode<'fragment'> {
  constructor(public readonly nodes: TqlNode<Exclude<TqlNodeType, 'query'>>[]) {
    super('fragment');
  }
}

/**
 * This represents the input to a `query` tagged function. It is a list of nodes, which can be either strings (represented by {@link TqlTemplateString})
 * or any other {@link TqlNode} type, including {@link TqlFragment} instances. It cannot recursively include {@link TqlQuery} instances.
 */
export class TqlQuery extends TqlNode<'query'> {
  constructor(public readonly nodes: TqlNode<Exclude<TqlNodeType, 'query'>>[]) {
    super('query');
  }
}
