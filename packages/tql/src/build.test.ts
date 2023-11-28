import { build } from './build';
import { TqlError } from './error';
import type { TqlNodeType } from './nodes';
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

describe('build', () => {
  const actions = {
    identifiers: jest.fn(),
    list: jest.fn(),
    values: jest.fn(),
    set: jest.fn(),
    'template-string': jest.fn(),
    parameter: jest.fn(),
    fragment: jest.fn(),
    query: jest.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- this is technically possible to get right, but really hard and unimportant
  } satisfies { [key in TqlNodeType]: (node: any) => void };

  it.each([
    {
      type: 'identifiers',
      node: new TqlQuery([new TqlIdentifiers('hello')]),
      expect: () => {
        expect(actions.identifiers).toHaveBeenCalledTimes(1);
      },
    },
    {
      type: 'list',
      node: new TqlQuery([new TqlList(['hello', 'world'])]),
      expect: () => {
        expect(actions.list).toHaveBeenCalledTimes(1);
      },
    },
    {
      type: 'values',
      node: new TqlQuery([new TqlValues({ hello: 'world' })]),
      expect: () => {
        expect(actions.values).toHaveBeenCalledTimes(1);
      },
    },
    {
      type: 'set',
      node: new TqlQuery([new TqlSet({ hello: 'world' })]),
      expect: () => {
        expect(actions.set).toHaveBeenCalledTimes(1);
      },
    },
    {
      type: 'template-string',
      node: new TqlQuery([new TqlTemplateString('hello')]),
      expect: () => {
        expect(actions['template-string']).toHaveBeenCalledTimes(1);
      },
    },
    {
      type: 'parameter',
      node: new TqlQuery([new TqlParameter('hello')]),
      expect: () => {
        expect(actions.parameter).toHaveBeenCalledTimes(1);
      },
    },
    {
      type: 'fragment',
      node: new TqlFragment([new TqlFragment([])]),
      expect: () => {
        expect(actions.fragment).not.toHaveBeenCalledTimes(1);
      },
    },
    {
      type: 'query',
      node: new TqlQuery([]),
      expect: () => {
        expect(actions.query).not.toHaveBeenCalled();
      },
    },
  ])(
    'calls the correct method given a node type: $type',
    ({ node, expect }) => {
      // @ts-expect-error - Missing preprocess and postprocess, but not needed to test this
      build(actions, node);
      expect();
    },
  );

  it('throws when trying to nest queries in queries or fragments', () => {
    const nestedQueryInQuery = (): void => {
      // @ts-expect-error - Same as above
      build(actions, new TqlQuery([new TqlQuery()]));
    };
    const nestedQueryInFragment = (): void => {
      // @ts-expect-error - Same as above
      build(actions, new TqlFragment([new TqlQuery()]));
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
});
