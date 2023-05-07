import { VercelPostgresError } from './error';

export type Primitive =
  | string
  | number
  | boolean
  | undefined
  | null
  | UnsafeUnescaped;

const unsafeUnescapedSecret = Symbol('The key for all unsafe unescaped values');

export function sqlTemplate(
  strings: TemplateStringsArray,
  ...values: Primitive[]
): [string, Primitive[]] {
  if (!isTemplateStringsArray(strings) || !Array.isArray(values)) {
    throw new VercelPostgresError(
      'incorrect_tagged_template_call',
      "It looks like you tried to call `sql` as a function. Make sure to use it as a tagged template.\n\tExample: sql`SELECT * FROM users`, not sql('SELECT * FROM users')",
    );
  }

  let result = strings[0] ?? '';
  const params: Exclude<Primitive, UnsafeUnescaped>[] = [];

  let offset = 0;
  for (let i = 1; i < strings.length; i++) {
    const value = values[i - 1];
    if (isUnsafeUnescaped(value)) {
      result += `${value[unsafeUnescapedSecret]}${strings[i] ?? ''}`;
      offset++;
      continue;
    }
    params.push(value);
    result += `$${i - offset}${strings[i] ?? ''}`;
  }

  return [result, params];
}

// We do this so that no possible value can be `UnsafeUnescaped` without running through the
// `unsafeUnescaped` function. This is important because we don't want to accidentally allow
// some random input to "pretend" to be `unsafeUnescaped`.
interface UnsafeUnescaped {
  [unsafeUnescapedSecret]: string;
}

/**
 * During normal template string interpolation, values are replaced with pgsql parameters. For example,
 * ```ts
 * sql`SELECT * FROM users WHERE id = ${id}`;
 * ```
 * becomes
 * ```ts
 * pg.query('SELECT * FROM users WHERE id = $1', [id]);
 * ```
 *
 * Sometimes, it's useful to be able to insert values into a query in places where pgsql parameters aren't allowed.
 * For example, to parameterize a column or table name. To do this, you can use `unsafeUnescaped`:
 * ```ts
 * sql`SELECT * FROM ${unsafeUnescaped('users')} WHERE id = ${id}`;
 * ```
 * becomes
 * ```ts
 * pg.query('SELECT * FROM users WHERE id = $1', [id]);
 * ```
 *
 * This is _unsafe_ and _will_ lead to SQL injection vulnerabilities if you do not sanitize your input.
 *
 * @param value - The value to ignore during template string interpolation
 * @returns A value that will be ignored during {@link sqlTemplate} template string interpolation
 */
export function unsafeUnescaped(value: string): UnsafeUnescaped {
  return { [unsafeUnescapedSecret]: value };
}

function isTemplateStringsArray(
  strings: unknown,
): strings is TemplateStringsArray {
  return (
    // @ts-expect-error - I don't know how to convince TS that an array can have a property
    Array.isArray(strings) && 'raw' in strings && Array.isArray(strings.raw)
  );
}

function isUnsafeUnescaped(value: unknown): value is UnsafeUnescaped {
  return (
    typeof value === 'object' &&
    value !== null &&
    unsafeUnescapedSecret in value
  );
}
