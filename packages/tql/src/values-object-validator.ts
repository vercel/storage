import { TqlError, type ColumnDiff } from './error';

/**
 * Given a record, validates that the record has the same keys as all prior records passed to `validate`.
 */
export class IdenticalColumnValidator {
  private readonly columns = new Set<string>();

  validate(entry: Record<string, unknown>): void {
    if (this.columns.size === 0) {
      const cols = Object.keys(entry);
      if (cols.length === 0) throw new TqlError('values_records_empty');
      cols.forEach((key) => this.columns.add(key));
      return;
    }

    const currentRecordColumns = new Set(Object.keys(entry));
    if (this.columns.size !== currentRecordColumns.size) {
      throw new TqlError(
        'values_records_mismatch',
        diffColumns(this.columns, currentRecordColumns),
      );
    }
    for (const column of currentRecordColumns) {
      if (!this.columns.has(column)) {
        throw new TqlError(
          'values_records_mismatch',
          diffColumns(this.columns, currentRecordColumns),
        );
      }
    }
  }
}

function diffColumns(template: Set<string>, mismatch: Set<string>): ColumnDiff {
  const plus: string[] = [];
  const minus: string[] = [];
  const templateColumns = [...template.values()];
  for (const templateColumn of templateColumns) {
    if (!mismatch.has(templateColumn)) {
      minus.push(templateColumn);
    }
  }

  for (const mismatchedColumn of mismatch.values()) {
    if (!template.has(mismatchedColumn)) {
      plus.push(mismatchedColumn);
    }
  }

  return {
    template: templateColumns,
    plus,
    minus,
  };
}
