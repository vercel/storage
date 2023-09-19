import { VercelPostgresError } from './error';

export type Primitive = string | number | boolean | undefined | null;

/** An SQL query fragment created by `fragment` tagged literal. */
export interface QueryFragment {
  [fragmentSymbol]: true;
  strings: TemplateStringsArray;
  values: Primitive[];
}

const fragmentSymbol = Symbol('fragment');

export function sqlTemplate(
  strings: TemplateStringsArray,
  ...values: (Primitive | QueryFragment)[]
): [string, Primitive[]] {
  if (!isTemplateStringsArray(strings) || !Array.isArray(values)) {
    throw new VercelPostgresError(
      'incorrect_tagged_template_call',
      "It looks like you tried to call `sql` as a function. Make sure to use it as a tagged template.\n\tExample: sql`SELECT * FROM users`, not sql('SELECT * FROM users')",
    );
  }

  let resultQuery = '';
  const resultValues: Primitive[] = [];

  function processTemplate(
    innerStrings: TemplateStringsArray,
    innerArgs: (Primitive | QueryFragment)[],
  ): void {
    for (let i = 0; i < innerStrings.length; i++) {
      if (i > 0) {
        const value = innerArgs[i - 1];
        const valueIsFragment =
          value && typeof value === 'object' && fragmentSymbol in value;

        if (valueIsFragment) {
          processTemplate(value.strings, value.values);
        } else {
          let valueIndex = resultValues.indexOf(value);
          if (valueIndex < 0) {
            resultValues.push(value);
            valueIndex = resultValues.length - 1;
          }
          resultQuery += `$${valueIndex + 1}`;
        }
      }
      resultQuery += innerStrings[i];
    }
  }

  processTemplate(strings, values);

  return [resultQuery, resultValues];
}

/**
 * A template literal tag providing a fragment of an SQL query.
 * @example
 * ```ts
 * const userId = 123;
 * const filter = fragment`id = ${userId}`;
 * const result = await sql`SELECT * FROM users WHERE ${filter}`;
 * // Equivalent to: await `SELECT * FROM users WHERE id = ${userId}`;
 * ```
 * @returns An SQL query fragment to be used by `sql`
 */
export function fragment(
  strings: TemplateStringsArray,
  ...values: Primitive[]
): QueryFragment {
  if (!isTemplateStringsArray(strings) || !Array.isArray(values)) {
    throw new VercelPostgresError(
      'incorrect_tagged_template_call',
      // eslint-disable-next-line no-template-curly-in-string -- showing usage of a template string
      "It looks like you tried to call `fragment` as a function. Make sure to use it as a tagged template.\n\tExample: fragment`id = ${id}`, not fragment('id = 1')",
    );
  }

  return { [fragmentSymbol]: true, strings, values };
}

function isTemplateStringsArray(
  strings: unknown,
): strings is TemplateStringsArray {
  return (
    Array.isArray(strings) && 'raw' in strings && Array.isArray(strings.raw)
  );
}
