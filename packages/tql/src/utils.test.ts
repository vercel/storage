import { createQueryBuilder, isTemplateStringsArray } from './utils';

function getTemplateStringsArray(
  strings: TemplateStringsArray,
  ..._values: unknown[]
): TemplateStringsArray {
  return strings;
}

describe('isTemplateStringsArray', () => {
  it('should return true for a TemplateStringsArray', () => {
    const templateStringsArray = getTemplateStringsArray`hi ${'mom'}, hi ${'dad'}`;
    expect(isTemplateStringsArray(templateStringsArray)).toBe(true);
  });
  it('should return false for a non-TemplateStringsArray', () => {
    expect(isTemplateStringsArray('foo')).toBe(false);
    expect(isTemplateStringsArray(1)).toBe(false);
    expect(isTemplateStringsArray(true)).toBe(false);
    expect(isTemplateStringsArray({})).toBe(false);
    expect(isTemplateStringsArray({ raw: 'hi' })).toBe(false);
    expect(isTemplateStringsArray([])).toBe(false);
    expect(isTemplateStringsArray(null)).toBe(false);
    expect(isTemplateStringsArray(undefined)).toBe(false);
  });
});

describe('createQueryBuilder', () => {
  it('appends to the query string', () => {
    const qb = createQueryBuilder();
    const result = qb.appendToQuery('hi');
    expect(qb.query).toBe('hi');
    expect(result).toBe(2);
  });
  it('appends to the parameters array', () => {
    const qb = createQueryBuilder();
    const result = qb.appendToParams('hi');
    expect(qb.params).toEqual(['hi']);
    expect(result).toBe(1);
  });
  it('reacts to additional changes', () => {
    const qb = createQueryBuilder();
    const result = qb.appendToParams('hi');
    expect(qb.params).toEqual(['hi']);
    expect(result).toBe(1);
    const secondResult = qb.appendToParams('world');
    expect(qb.params).toEqual(['hi', 'world']);
    expect(secondResult).toBe(2);
  });
});
