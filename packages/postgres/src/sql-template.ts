import type { QueryResult, QueryResultRow } from '@neondatabase/serverless';
import { VercelPostgresError } from './error';

/**
 * Allows safe construction and execution of SQL queries using tagged templates.
 */
export class SqlTemplate<O extends QueryResultRow> {
  private templates: {
    strings: TemplateStringsArray;
    params: Primitive[];
  }[] = [];

  constructor(
    private dbQuery: (
      query: string,
      params?: Primitive[],
    ) => Promise<QueryResult<O>>,
  ) {}

  /**
   * Appends SQL code to the end of this template.
   * @example
   * ```ts
   * template.append`SELECT * FROM pokemon`;
   * if (pokemonName) {
   *   template.append` WHERE name = ${pokemonName}`;
   * }
   * const { rows, fields } = await template.execute();
   * ```
   * @returns This template, with the templated SQL appended.
   */
  public append(strings: TemplateStringsArray, ...values: Primitive[]): this {
    SqlTemplate.throwIfNotTemplateStringsArray(strings);
    SqlTemplate.throwIfNotValuesArray(values);
    this.templates.push({ strings, params: values });
    return this;
  }

  /**
   * Appends raw, unsafe SQL code to the end of this template. Do not use
   * unless you are absolutely sure that the SQL is safe.
   * @example
   * ```ts
   * template.append`SELECT * FROM`.appendUnsafeRaw(' pokemon');
   * if (pokemonName) {
   *   template.append` WHERE name = ${pokemonName}`;
   * }
   * const { rows, fields } = await template.execute();
   * ```
   * @returns This template, with the unsafe raw SQL appended.
   */
  public appendUnsafeRaw(value: string): this {
    const fakeTemplateString = [value] as unknown as string[] & {
      raw: string[];
    };
    fakeTemplateString.raw = [value];
    this.templates.push({ strings: fakeTemplateString, params: [] });
    return this;
  }

  /**
   * Execute this query against the database, returning the result.
   * @returns A promise that resolves to the query result.
   */
  public async execute(): Promise<QueryResult<O>> {
    return this.dbQuery(...this.build());
  }

  /**
   * Build this template into a query string and parameter array.
   * @returns A tuple containing the query string and parameter array.
   */
  public build(): [string, Primitive[]] {
    let query = '';
    const aggregatedParams: Primitive[] = [];

    for (const { strings, params } of this.templates) {
      query += strings[0] ?? '';
      for (let i = 1; i < strings.length; i++) {
        aggregatedParams.push(params[i - 1]);
        query += `$${aggregatedParams.length}${strings[i] ?? ''}`;
      }
    }

    return [query, aggregatedParams];
  }

  private static isTemplateStringsArray(
    strings: unknown,
  ): strings is TemplateStringsArray {
    return (
      // @ts-expect-error - I don't know how to convince TS that an array can have a property
      Array.isArray(strings) && 'raw' in strings && Array.isArray(strings.raw)
    );
  }

  private static throwIfNotTemplateStringsArray(
    strings: unknown,
  ): asserts strings is TemplateStringsArray {
    if (!SqlTemplate.isTemplateStringsArray(strings)) {
      throw new VercelPostgresError(
        'incorrect_tagged_template_call',
        "It looks like you tried to call `sql` or `append` as a function. Make sure to use it as a tagged template.\n\tExample: sql`SELECT * FROM users`, not sql('SELECT * FROM users')",
      );
    }
  }

  private static throwIfNotValuesArray(
    values: unknown,
  ): asserts values is Primitive[] {
    if (!Array.isArray(values)) {
      throw new VercelPostgresError(
        'incorrect_tagged_template_call',
        "It looks like you tried to call `sql` or `append` as a function. Make sure to use it as a tagged template.\n\tExample: sql`SELECT * FROM users`, not sql('SELECT * FROM users')",
      );
    }
  }
}

export type Primitive = string | number | boolean | undefined | null;
