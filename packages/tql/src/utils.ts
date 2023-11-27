export function isTemplateStringsArray(
  value: unknown,
): value is TemplateStringsArray {
  return (
    Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, 'raw')
  );
}

// TODO: Test
export function createQueryBuilder(): {
  readonly query: string;
  readonly params: unknown[];
  appendToQuery: (...values: string[]) => number;
  appendToParams: (...values: unknown[]) => number;
} {
  let query = '';
  const params: unknown[] = [];
  const appendToQuery = (...values: string[]): number => {
    query += values.join('');
    return query.length;
  };
  const appendToParams = (...values: unknown[]): number => {
    return params.push(...values);
  };
  return {
    get query(): string {
      return query;
    },
    get params(): unknown[] {
      return params;
    },
    appendToQuery,
    appendToParams,
  };
}

// TODO: test
export function pluralize(str: string, plural: boolean, suffix = 's'): string {
  if (plural) {
    return `${str}${suffix}`;
  }
  return str;
}
