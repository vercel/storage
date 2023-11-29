import type {
  TqlIdentifiers,
  TqlList,
  TqlParameter,
  TqlQuery,
  TqlFragment,
  TqlTemplateString,
  TqlValues,
  TqlSet,
} from './nodes';

export type SetObject = Record<string, unknown>;
export type ValuesObject = Record<string, unknown> | Record<string, unknown>[];

export interface DialectImpl {
  preprocess: (fragment: TqlQuery) => TqlQuery;
  templateString: (str: TqlTemplateString) => void;
  parameter: (param: TqlParameter) => void;
  identifiers: (ids: TqlIdentifiers) => void;
  list: (vals: TqlList) => void;
  values: (entries: TqlValues) => void;
  set: (entries: TqlSet) => void;
  postprocess: (query: string, params: unknown[]) => [string, unknown[]];
}

export type Dialect = new (
  appendToQuery: (...values: string[]) => number,
  appendToParams: (...values: unknown[]) => number,
) => DialectImpl;

export type CompiledQuery = [string, unknown[]];

export interface Tql {
  /**
   * Builds a SQL query out of a JavaScript tagged template.
   * @example
   * Examples are using the Postgres dialect for their output.
   *
   * ### A simple query:
   * ```ts
   * const userId = 1234;
   * const [q, params] = query`SELECT * FROM users WHERE id = ${userId};`;
   * // ["SELECT * FROM users WHERE id = $1;", [1234]]
   * ```
   *
   * ### Insert values:
   * ```ts
   * // This uses an array of records, but you can also use a single record if you only need to insert one row.
   * const rows = [
   *   { name: 'Alice', age: 30 },
   *   { name: 'Bob', age: 40 },
   * ]
   * const [q, params] = query`INSERT INTO users ${values(rows)}`;
   * // ['INSERT INTO users ("name", "age") VALUES ($1, $2), ($3, $4);', ['Alice', 30, 'Bob', 40]]
   * ```
   *
   * ### A single dynamic identifier:
   * ```ts
   * const column = 'name';
   * const [q, params] = query`SELECT ${identifier(column)} FROM users`;
   * // ['SELECT "name" FROM users', []]
   * ```
   *
   * ### Dynamic identifiers:
   * ```ts
   * const columns = ['name', 'age'];
   * const [q, params] = query`SELECT ${identifiers(columns)} FROM users`;
   * // ['SELECT "name", "age" FROM users', []]
   * ```
   *
   * @returns A tuple of the query string and the parameters to be passed to the database driver.
   */
  query: (strings: TemplateStringsArray, ...values: unknown[]) => CompiledQuery;

  /**
   * Builds a SQL fragment out of a JavaScript tagged template. Works the same as {@link query}, but returns a value
   * that can be nested recursively and included in calls to {@link query}.
   *
   * ### Build a query out of multiple variable declarations:
   * ```ts
   * const familyName = 'Smith';
   * const familyFragment = fragment`SELECT * FROM users WHERE family_name = ${familyName}`;
   * const [jobsHeldByFamilyMembersQuery, params] = query`
   * WITH family AS (${familyFragment})
   * SELECT * FROM jobs INNER JOIN family ON jobs.user_id = family.user_id;
   * `;
   * // [
   * //   `
   * //   WITH family AS (SELECT * FROM users WHERE family_name = $1)
   * //   SELECT * FROM jobs INNER JOIN family ON jobs.user_id = family.user_id;
   * //   `,
   * //   ['Smith']
   * // ]
   * ```
   * @returns A value that can be included recursively in other calls to {@link fragment} and in calls to {@link query}.
   */
  fragment: (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => TqlFragment;

  /**
   * The same as {@link identifier}, but for multiple identifiers. These will be comma-separated by the driver.
   * @param ids - The IDs to escape.
   * @returns A representation of the identifiers that will be escaped by {@link query}.
   */
  IDENTIFIERS: (ids: string | string[]) => TqlIdentifiers;

  /**
   * For use with the IN operator or anywhere else a parenthesis-list of values is needed.
   *
   * @example
   * ```ts
   * const [q, params] = query`SELECT * FROM users WHERE id IN ${list([1, 2, 3])}`;
   * // ['SELECT * FROM users WHERE id IN ($1, $2, $3)', [1, 2, 3]]
   * ```
   *
   * @param vals - The values to build into a list.
   * @returns A representation of the list that will be escaped by {@link query}.
   */
  LIST: (vals: unknown[]) => TqlList;

  /**
   * For use with the VALUES clause of an INSERT statement. Can insert one or multiple rows. If multiple
   * rows are provided, the columns must be the same for each row. A different number of columns or the same
   * number of columns with different names will throw a runtime error.
   *
   * @example
   * ### A single row:
   * ```ts
   * const value = { name: 'Alice', age: 30 };
   * const [q, params] = query`INSERT INTO users ${values(value)}`;
   * // ['INSERT INTO users ("name", "age") VALUES ($1, $2);', ['Alice', 30]]
   * ```
   *
   * ### Multiple rows:
   * ```ts
   * const values = [
   *  { name: 'Alice', age: 30 },
   *  { name: 'Bob', age: 40 },
   * ];
   * const [q, params] = query`INSERT INTO users ${values(values)}`;
   * // ['INSERT INTO users ("name", "age") VALUES ($1, $2), ($3, $4);', ['Alice', 30, 'Bob', 40]]
   * ```
   *
   * @param entries - The value or values to insert.
   * @returns A representation of the values that will be escaped by {@link query}.
   */
  VALUES: (entries: ValuesObject) => TqlValues;

  /**
   * A SET clause. Given a record, the record keys are column names and the corresponding values are the values for that column.
   *
   * @example
   * ### Update a record
   * ```ts
   * const userId = 1234;
   * const updatedUser = { name: 'vercelliott' };
   * const [q, params] = query`UPDATE users ${set(updatedUser)} WHERE user_id = ${userId};`;
   * // ['UPDATE users SET "name" = $1 WHERE user_id = $2;', ['vercelliott', 1234]]
   *
   * @param entry An object representing this SET clause.
   * @returns A representation of the SET clause to be passed to {@link query}.
   * ```
   */
  SET: (entry: SetObject) => TqlSet;

  /**
   * A raw string that will be inserted into the query as-is.
   * **WARNING**: This WILL expose your query to SQL injection attacks if you use it with user input. It should
   * _only_ be used with trusted, escaped input.
   * @example
   * ### Expose yourself to SQL injection attacks:
   * ```ts
   * const userInputName = "Robert'); DROP TABLE students; --";
   * const [q, params] = query(`INSERT INTO students ("name") VALUES ('${unsafe(userInputName)});`);
   * // INSERT INTO students ("name") VALUES ('Robert'); DROP TABLE students; --');
   * ```
   * Don't do this, obviously.
   *
   * @returns A representation of the string that will be inserted into the query as-is by {@link query} and {@link fragment}.
   */
  UNSAFE: (str: string) => TqlTemplateString;
}

export type Init = (options: { dialect: Dialect }) => Tql;
