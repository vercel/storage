import { IdenticalColumnValidator } from './values-object-validator';

// eslint-disable-next-line jest/prefer-lowercase-title -- it's a class name
describe('IdenticalColumnValidator', () => {
  it('should not throw when provided multiple records with the same keys, even in different orders', () => {
    const validator = new IdenticalColumnValidator();
    expect(() => {
      validator.validate({ one: 1, two: 2, three: 3 });
      validator.validate({ three: 3, one: 1, two: 2 });
      validator.validate({ two: 2, three: 3, one: 1 });
    }).not.toThrow();
  });
  it('should throw when passed a record with no keys', () => {
    const validator = new IdenticalColumnValidator();
    expect(() => {
      validator.validate({});
    }).toThrow('tql: The records passed to `values` must not be empty.');
  });
  it('should throw when passed a record with more keys than the first record', () => {
    const validator = new IdenticalColumnValidator();
    expect(() => {
      validator.validate({ one: 1, two: 2, three: 3 });
      validator.validate({ one: 1, two: 2, three: 3, four: 4 });
    }).toThrow(
      `tql: The records passed to \`values\` were invalid. Each record must have the same columns as all other records. Based on the first record's columns:
 - one
 - two
 - three

These columns are extra:
 - four`,
    );
  });
  it('should throw when passed a record with fewer keys than the first record', () => {
    const validator = new IdenticalColumnValidator();
    expect(() => {
      validator.validate({ one: 1, two: 2, three: 3 });
      validator.validate({ one: 1, two: 2 });
    }).toThrow(
      `tql: The records passed to \`values\` were invalid. Each record must have the same columns as all other records. Based on the first record's columns:
 - one
 - two
 - three

These columns are missing:
 - three`,
    );
  });
  it('should throw when passed a record with different keys than the first record', () => {
    const validator = new IdenticalColumnValidator();
    expect(() => {
      validator.validate({ one: 1, two: 2, three: 3 });
      validator.validate({ one: 1, two: 2, four: 4 });
    }).toThrow(
      `tql: The records passed to \`values\` were invalid. Each record must have the same columns as all other records. Based on the first record's columns:
 - one
 - two
 - three

These columns are missing:
 - three

These columns are extra:
 - four`,
    );
  });
});
