import { VercelPostgresError } from './error';

export type Primitive = string | number | boolean | undefined | null;

export function sqlTemplate(
  strings: TemplateStringsArray,
  ...values: Primitive[]
): [string, Primitive[]] {
  if (!Array.isArray(strings)) {
    throw new VercelPostgresError(
      'incorrect_tagged_template_call',
      "It looks like you tried to call `sql` as a function. Make sure to use it as a tagged template.\n\tExample: sql`SELECT * FROM users`, not sql('SELECT * FROM users')",
    );
  }

  // ts tries to annotate `strings` with `& any[]` because of the prior check which breaks the type
  let result = (strings as TemplateStringsArray)[0] ?? '';

  for (let i = 1; i < strings.length; i++) {
    result += `$${i}${(strings as TemplateStringsArray)[i] ?? ''}`;
  }

  return [result, values];
}
