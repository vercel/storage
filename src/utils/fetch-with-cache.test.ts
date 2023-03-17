import { cache } from './fetch-with-cache';

describe('cache', () => {
  it('should be an object', () => {
    expect(typeof cache).toEqual('object');
  });
});
