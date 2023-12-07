import { TqlError } from './error';
import {
  TqlIdentifiers,
  TqlList,
  TqlNode,
  TqlParameter,
  TqlQuery,
  TqlFragment,
  TqlTemplateString,
  TqlValues,
} from './nodes';

describe('nodes', () => {
  it.each([
    {
      type: 'identifiers',
      Ctor: TqlIdentifiers,
      instance: new TqlIdentifiers(['foo', 'bar']),
    },
    {
      type: 'list',
      Ctor: TqlList,
      instance: new TqlList([1, 2, 3]),
    },
    {
      type: 'parameter',
      Ctor: TqlParameter,
      instance: new TqlParameter(1),
    },
    {
      type: 'templateString',
      Ctor: TqlTemplateString,
      instance: new TqlTemplateString('foo'),
    },
    {
      type: 'values',
      Ctor: TqlValues,
      instance: new TqlValues([{ foo: 'bar' }]),
    },
    {
      type: 'query',
      Ctor: TqlQuery,
      instance: new TqlQuery([]),
    },
    {
      type: 'fragment',
      Ctor: TqlFragment,
      instance: new TqlFragment([]),
    },
  ])(
    'should pass instanceof checks for each node type',
    ({ type, Ctor, instance }) => {
      expect(instance.type).toBe(type);
      expect(instance).toBeInstanceOf(Ctor);
      expect(instance).toBeInstanceOf(TqlNode);
    },
  );
});

// eslint-disable-next-line jest/prefer-lowercase-title -- This is a class name
describe('TqlFragment', () => {
  it('joins other fragments using itself as a delimiter', () => {
    const delimiter = new TqlFragment([new TqlTemplateString('\n')]);
    const fragmentsToJoin = [
      new TqlFragment([new TqlTemplateString('SELECT *')]),
      new TqlFragment([new TqlTemplateString('FROM users')]),
      new TqlFragment([
        new TqlTemplateString('WHERE user_id = '),
        new TqlParameter(1234),
        new TqlTemplateString(';'),
      ]),
    ];
    const result = delimiter.join(...fragmentsToJoin);
    expect(result).toEqual(
      new TqlFragment([
        new TqlTemplateString('SELECT *'),
        new TqlTemplateString('\n'),
        new TqlTemplateString('FROM users'),
        new TqlTemplateString('\n'),
        new TqlTemplateString('WHERE user_id = '),
        new TqlParameter(1234),
        new TqlTemplateString(';'),
      ]),
    );
  });

  it('throws when it finds an imposter', () => {
    const delimiter = new TqlFragment([new TqlTemplateString('\n')]);
    const fragmentsToJoin = [
      new TqlFragment([new TqlTemplateString('SELECT *')]),
      new TqlFragment([new TqlTemplateString('FROM users')]),
      '; DROP TABLE users;--',
      new TqlFragment([
        new TqlTemplateString('WHERE user_id = '),
        new TqlParameter(1234),
        new TqlTemplateString(';'),
      ]),
    ] as TqlFragment[];
    let error: Error | null = null;
    try {
      delimiter.join(...fragmentsToJoin);
    } catch (e) {
      error = e as Error;
    }
    expect(error).toBeInstanceOf(TqlError);
    expect(error).toHaveProperty('code', 'illegal_non_fragment_join');
  });
});
