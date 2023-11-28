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
