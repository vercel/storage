import { isTemplateStringsArray } from './utils';

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
