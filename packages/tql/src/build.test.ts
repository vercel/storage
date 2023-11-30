import { build } from './build';
import { createTestDialect } from './dialects/test-dialect';
import { TqlError } from './error';
import {
  TqlFragment,
  TqlIdentifiers,
  TqlList,
  TqlParameter,
  TqlQuery,
  TqlSet,
  TqlTemplateString,
  TqlValues,
} from './nodes';
import type { DialectImpl } from './types';

describe('build', () => {
  const { Dialect, mocks } = createTestDialect();
  let instance: DialectImpl;
  beforeEach(() => {
    instance = new Dialect(
      () => {
        return 0;
      },
      () => {
        return 0;
      },
    );
    jest.clearAllMocks();
  });

  it.each([
    {
      type: 'identifiers',
      node: new TqlQuery([new TqlIdentifiers('hello')]),
      expect: () => {
        expect(mocks.identifiers).toHaveBeenCalledTimes(1);
      },
    },
    {
      type: 'list',
      node: new TqlQuery([new TqlList(['hello', 'world'])]),
      expect: () => {
        expect(mocks.list).toHaveBeenCalledTimes(1);
      },
    },
    {
      type: 'values',
      node: new TqlQuery([new TqlValues({ hello: 'world' })]),
      expect: () => {
        expect(mocks.values).toHaveBeenCalledTimes(1);
      },
    },
    {
      type: 'set',
      node: new TqlQuery([new TqlSet({ hello: 'world' })]),
      expect: () => {
        expect(mocks.set).toHaveBeenCalledTimes(1);
      },
    },
    {
      type: 'templateString',
      node: new TqlQuery([new TqlTemplateString('hello')]),
      expect: () => {
        expect(mocks.templateString).toHaveBeenCalledTimes(1);
      },
    },
    {
      type: 'parameter',
      node: new TqlQuery([new TqlParameter('hello')]),
      expect: () => {
        expect(mocks.parameter).toHaveBeenCalledTimes(1);
      },
    },
    {
      type: 'fragment',
      node: new TqlFragment([new TqlFragment([new TqlTemplateString('hi')])]),
      expect: () => {
        expect(mocks.templateString).toHaveBeenCalledTimes(1);
      },
    },
    {
      type: 'query',
      node: new TqlQuery([new TqlFragment([new TqlTemplateString('hi')])]),
      expect: () => {
        expect(mocks.templateString).toHaveBeenCalledTimes(1);
      },
    },
  ])(
    'calls the correct method given a node type: $type',
    ({ node, expect }) => {
      build(instance, node);
      expect();
    },
  );

  it('throws when trying to nest queries in queries or fragments', () => {
    const nestedQueryInQuery = (): void => {
      // @ts-expect-error - This is against the rules, but someone could try
      build(instance, new TqlQuery([new TqlQuery()]));
    };
    const nestedQueryInFragment = (): void => {
      // @ts-expect-error - This is against the rules, but someone could try
      build(instance, new TqlFragment([new TqlQuery()]));
    };
    const assertIsCorrectError = (fn: () => void): void => {
      let error: Error | null = null;
      try {
        fn();
      } catch (e) {
        error = e as Error;
      }
      expect(error).toBeInstanceOf(TqlError);
      expect(error).toHaveProperty('code', 'illegal_query_recursion');
    };
    assertIsCorrectError(nestedQueryInQuery);
    assertIsCorrectError(nestedQueryInFragment);
  });

  it('throws if someone sneaks in a non-TQL-node', () => {
    // @ts-expect-error - Yes, this is impossible with TypeScript
    const q = new TqlQuery([new TqlTemplateString('hi'), 'hi']);
    let error: Error | null = null;
    try {
      build(instance, q);
    } catch (e) {
      error = e as Error;
    }
    expect(error).toBeInstanceOf(TqlError);
    expect(error).toHaveProperty('code', 'illegal_node_type_in_build');
  });
});
