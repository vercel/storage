export class TqlError<T extends keyof typeof messages> extends Error {
  constructor(
    public code: T,
    ...details: Parameters<(typeof messages)[T]>
  ) {
    // @ts-expect-error - This is super hard to type but it does work correctly
    super(`tql: ${messages[code](...details)}`);
    this.name = 'TqlError';
  }
}

export interface ColumnDiff {
  template: string[];
  plus: string[];
  minus: string[];
}

const messages = {
  untemplated_sql_call: () =>
    "It looks like you tried to call a tagged template function as a regular JavaScript function. If your code looks like tql('SELECT *'), it should instead look like sql`SELECT *`",
  dialect_method_not_implemented: (method: string) =>
    `The dialect you are using does not implement this method: ${method}`,
  values_records_mismatch: (diff: ColumnDiff) =>
    formatValuesRecordsMismatchMessage(diff),
  values_records_empty: () =>
    'The records passed to `values` must not be empty.',
  illegal_query_recursion: () =>
    'Found a nested call to `query`. If you need to nest queries, use `fragment`.',
} as const satisfies Record<string, (...args: never[]) => string>;

function formatValuesRecordsMismatchMessage(diff: ColumnDiff): string {
  let message = `The records passed to \`values\` were invalid. Each record must have the same columns as all other records. Based on the first record's columns:\n - ${diff.template.join(
    '\n - ',
  )}`;
  if (diff.minus.length > 0) {
    message += `\n\nThese columns are missing:\n - ${diff.minus.join('\n - ')}`;
  }
  if (diff.plus.length > 0) {
    message += `\n\nThese columns are extra:\n - ${diff.plus.join('\n - ')}`;
  }
  return message;
}
