import { IdenticalColumnValidator } from '../values-object-validator';
import type { DialectImpl } from '../types';
import { BaseDialect } from '../dialect';
import {
  type TqlIdentifiers,
  type TqlList,
  type TqlParameter,
  type TqlTemplateString,
  type TqlSet,
  type TqlValues,
} from '../nodes.js';

export class PostgresDialect extends BaseDialect implements DialectImpl {
  string(str: TqlTemplateString): void {
    this.appendToQuery(str.value);
  }

  parameter(param: TqlParameter): void {
    const paramNumber = this.appendToParams(param.value);
    this.appendToQuery(`$${paramNumber}`);
  }

  identifiers(ids: TqlIdentifiers): void {
    if (Array.isArray(ids.values)) {
      this.appendToQuery(
        ids.values.map((v) => PostgresDialect.escapeIdentifier(v)).join(', '),
      );
    } else {
      this.appendToQuery(PostgresDialect.escapeIdentifier(ids.values));
    }
  }

  list(vals: TqlList): void {
    this.appendToQuery('(');
    const queryItems: string[] = [];
    for (const param of vals.values) {
      const paramNumber = this.appendToParams(param);
      queryItems.push(`$${paramNumber}`);
    }
    this.appendToQuery(queryItems.join(', '));
    this.appendToQuery(')');
  }

  values(entries: TqlValues): void {
    if (Array.isArray(entries.values)) {
      // it's multiple entries
      const validator = new IdenticalColumnValidator();
      let first = true;
      let columns: string[] = [];
      const rows: string[] = [];
      for (const entry of entries.values) {
        validator.validate(entry);
        if (first) {
          first = false;
          columns = Object.keys(entry);
          this.appendToQuery(
            `(${columns
              .map((column) => PostgresDialect.escapeIdentifier(column))
              .join(', ')}) VALUES `,
          );
        }
        const queryItems: string[] = [];
        for (const column of columns) {
          const paramNumber = this.appendToParams(entry[column]);
          queryItems.push(`$${paramNumber}`);
        }
        rows.push(`(${queryItems.join(', ')})`);
      }
      this.appendToQuery(rows.join(', '));
    } else {
      // it's a single entry
      const entry = entries.values;
      const columns = Object.keys(entry);
      this.appendToQuery(
        `(${columns
          .map((column) => PostgresDialect.escapeIdentifier(column))
          .join(', ')}) VALUES `,
      );
      const queryItems: string[] = [];
      for (const column of columns) {
        const paramNumber = this.appendToParams(entry[column]);
        queryItems.push(`$${paramNumber}`);
      }
      this.appendToQuery(`(${queryItems.join(', ')})`);
    }
  }

  set(entry: TqlSet): void {
    this.appendToQuery('SET ');
    const columns = Object.keys(entry.values);
    const queryItems: string[] = [];
    for (const column of columns) {
      const paramNumber = this.appendToParams(entry.values[column]);
      queryItems.push(
        `${PostgresDialect.escapeIdentifier(column)} = $${paramNumber}`,
      );
    }
    this.appendToQuery(queryItems.join(', '));
  }

  private static escapeIdentifier(value: string): string {
    return `"${value.replace(/"/g, '""').replace(/\./g, '"."')}"`;
  }
}
