import { TqlError } from './error';

// eslint-disable-next-line jest/prefer-lowercase-title -- it's a class man, calm down
describe('TqlError', () => {
  it('should throw with a formatted message', () => {
    expect(() => {
      throw new TqlError('dialect_method_not_implemented', 'foo');
    }).toThrow('The dialect you are using does not implement this method: foo');
  });
  it('should pass instance checks', () => {
    const err = new TqlError('dialect_method_not_implemented', 'foo');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TqlError);
  });
});

// @ts-expect-error - Should error if too many arguments are provided given an error code
// eslint-disable-next-line no-new -- this is a typescript test, not a side effect
new TqlError('illegal_query_recursion', 'abc', 'abc');

// @ts-expect-error - Should error if too few arguments are provided given an error code
// eslint-disable-next-line no-new -- this is a typescript test, not a side effect
new TqlError('dialect_method_not_implemented');

// @ts-expect-error - Should error if an argument of the wrong type is provided given an error code
// eslint-disable-next-line no-new -- this is a typescript test, not a side effect
new TqlError('dialect_method_not_implemented', 1);
