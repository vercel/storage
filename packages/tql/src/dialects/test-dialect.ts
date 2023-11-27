import type { Dialect, DialectImpl } from '../types';
import { BaseDialect } from '../dialect';
import type { TqlQuery } from '../nodes';

export function createTestDialect(): {
  Dialect: Dialect;
  mocks: {
    string: jest.MockedFunction<DialectImpl['string']>;
    parameter: jest.MockedFunction<DialectImpl['parameter']>;
    identifiers: jest.MockedFunction<DialectImpl['identifiers']>;
    list: jest.MockedFunction<DialectImpl['list']>;
    values: jest.MockedFunction<DialectImpl['values']>;
    set: jest.MockedFunction<DialectImpl['set']>;
    preprocess: jest.MockedFunction<DialectImpl['preprocess']>;
    postprocess: jest.MockedFunction<DialectImpl['postprocess']>;
  };
} {
  const mocks = {
    string: jest.fn(),
    parameter: jest.fn(),
    identifiers: jest.fn(),
    list: jest.fn(),
    values: jest.fn(),
    set: jest.fn(),
    preprocess: jest.fn<TqlQuery, [fragment: TqlQuery]>((fragment) => fragment),
    postprocess: jest.fn<[string, unknown[]], [string, unknown[]]>(
      (query, params) => [query, params],
    ),
  };
  class TestDialect extends BaseDialect implements DialectImpl {
    string = mocks.string;
    parameter = mocks.parameter;
    identifiers = mocks.identifiers;
    list = mocks.list;
    values = mocks.values;
    set = mocks.set;
    preprocess = mocks.preprocess;
    postprocess = mocks.postprocess;
  }
  return {
    Dialect: TestDialect,
    mocks,
  };
}
