// This file is meant to ensure the common logic works in both enviornments.
//
// It runs tests in both envs:
// - @edge-runtime/jest-environment
// - node
// and tests both entry points
// - index.node
// - index.edge
import fetchMock from 'jest-fetch-mock';
import * as node from './index.node';
import * as edge from './index.edge';

const connectionString = process.env.EDGE_CONFIG;
// const baseUrl = 'https://edge-config.vercel.com/ecfg-1';

// eslint-disable-next-line jest/require-top-level-describe
beforeEach(() => {
  fetchMock.resetMocks();
});

describe('package exports', () => {
  it('should have the same exports in both runtimes', () => {
    expect(Object.keys(node)).toEqual(Object.keys(edge));
  });
});

// test both package.json exports (for node & edge) separately
describe.each([
  ['node', node],
  ['edge', edge],
])('%s', (packageName, pkg) => {
  describe('default Edge Config', () => {
    describe('test conditions', () => {
      it('should have an env var called EDGE_CONFIG', () => {
        expect(connectionString).toEqual(
          'https://edge-config.vercel.com/ecfg-1?token=token-1',
        );
      });
    });
  });

  describe('parseConnectionString', () => {
    it('should return null when an invalid Connection String is given', () => {
      expect(pkg.parseConnectionString('foo')).toBeNull();
    });

    it('should return null when the given Connection String has no token', () => {
      expect(
        pkg.parseConnectionString(
          'https://edge-config.vercel.com/ecfg_cljia81u2q1gappdgptj881dwwtc',
        ),
      ).toBeNull();
    });

    it('should return the id and token when a valid Connection String is given', () => {
      expect(
        pkg.parseConnectionString(
          'https://edge-config.vercel.com/ecfg_cljia81u2q1gappdgptj881dwwtc?token=00000000-0000-0000-0000-000000000000',
        ),
      ).toEqual({
        id: 'ecfg_cljia81u2q1gappdgptj881dwwtc',
        token: '00000000-0000-0000-0000-000000000000',
      });
    });
  });
});
