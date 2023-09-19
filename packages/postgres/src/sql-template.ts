import { VercelPostgresError } from './error';

export type Primitive = string | number | boolean | undefined | null;

/** An SQL query fragment created by `fragment` tagged literal. */
export interface QueryFragment {
  [fragmentSymbol]: true;
  strings: TemplateStringsArray;
  values: (Primitive | QueryFragment)[];
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

  const result: [string, Primitive[]] = ['', []];

  processTemplate(result, strings, values);

  return result;
}

function processTemplate(
  result: [string, Primitive[]],
  strings: TemplateStringsArray,
  values: (Primitive | QueryFragment)[],
): void {
  for (let i = 0; i < strings.length; i++) {
    if (i > 0) {
      const value = values[i - 1];
      const valueIsFragment =
        value && typeof value === 'object' && fragmentSymbol in value;

      if (valueIsFragment) {
        processTemplate(result, value.strings, value.values);
      } else {
        let valueIndex = result[1].indexOf(value);
        if (valueIndex < 0) {
          valueIndex = result[1].push(value) - 1;
        }
        result[0] += `$${valueIndex + 1}`;
      }
    }

    result[0] += strings[i];
  }
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
  ...values: (Primitive | QueryFragment)[]
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
