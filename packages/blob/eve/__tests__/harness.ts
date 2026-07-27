/**
 * Test harness for the `@vercel/blob/eve` extension.
 *
 * The extension source is authored for the eve bundler: it uses explicit `.js`
 * specifiers on relative imports and pulls the eve runtime in from an
 * ESM-only package. Jest's CJS pipeline can do neither out of the box, and the
 * package's `jest.config.cjs` is shared with `src/`, so both gaps are bridged
 * here instead:
 *
 *  1. `.js` specifiers are re-pointed at the real TypeScript sources with
 *     virtual mocks. Nothing is stubbed -- the factories return the genuine
 *     modules, so tests exercise the real Blob SDK over mocked HTTP.
 *  2. The three `eve/*` entry points the extension imports are replaced with
 *     faithful ports of eve 0.27's runtime behaviour (see each factory).
 *
 * `jest.mock` is hoisted above the imports below by ts-jest, so importing this
 * module is enough to register everything. Tests should import tools *from
 * here* rather than reaching into `../tools/*` directly, which keeps the mocks
 * guaranteed to be registered first.
 */

import type { ToolContext } from 'eve/tools';
import { MockAgent, setGlobalDispatcher } from 'undici';

// --- eve runtime shims ------------------------------------------------------

// Mirrors `defineTool`: returns the definition object untouched (the real one
// only stamps non-enumerable brand symbols onto it).
jest.mock('eve/tools', () => ({
  defineTool: (definition: unknown) => definition,
}));

// Mirrors `eve/tools/approval`: each helper returns the decision callback the
// runtime invokes before a tool call.
jest.mock('eve/tools/approval', () => ({
  always: () => () => 'user-approval',
  never: () => () => 'not-applicable',
  once:
    () =>
    ({
      approvedTools,
      toolName,
    }: {
      approvedTools: Set<string>;
      toolName: string;
    }) =>
      approvedTools.has(toolName) ? 'not-applicable' : 'user-approval',
}));

// Mirrors `defineExtension`'s unmounted path: with no mount call, `config`
// validates `{}` against the declared schema and returns the parsed value.
// Every field on the Blob extension's schema is optional, so this yields `{}`
// and the SDK falls back to `BLOB_READ_WRITE_TOKEN` from the environment.
jest.mock('eve/extension', () => ({
  defineExtension: (definition: { config?: unknown } | undefined) => {
    const schema = definition?.config as
      | {
          '~standard': {
            validate: (
              value: unknown,
            ) =>
              | { value?: unknown; issues?: readonly { message: string }[] }
              | Promise<unknown>;
          };
        }
      | undefined;

    return {
      schema,
      get config(): Record<string, unknown> {
        if (schema === undefined) return {};

        const result = schema['~standard'].validate({});
        if (result instanceof Promise) {
          throw new Error(
            'Extension config must validate synchronously; the config schema uses async validation, which is not supported at mount.',
          );
        }
        if (result.issues !== undefined) {
          throw new Error(
            `Invalid extension config: ${result.issues.map((issue) => issue.message).join('; ')}`,
          );
        }

        return result.value as Record<string, unknown>;
      },
    };
  },
}));

// --- `.js` specifier bridges ------------------------------------------------

jest.mock('../extension.js', () => require('../extension'), { virtual: true });
jest.mock('../lib/options.js', () => require('../lib/options'), {
  virtual: true,
});
jest.mock('../../src/api.js', () => require('../../src/api'), {
  virtual: true,
});
jest.mock('../../src/copy.js', () => require('../../src/copy'), {
  virtual: true,
});
jest.mock(
  '../../src/create-folder.js',
  () => require('../../src/create-folder'),
  {
    virtual: true,
  },
);
jest.mock('../../src/del.js', () => require('../../src/del'), {
  virtual: true,
});
jest.mock('../../src/get.js', () => require('../../src/get'), {
  virtual: true,
});
jest.mock('../../src/head.js', () => require('../../src/head'), {
  virtual: true,
});
jest.mock('../../src/index.js', () => require('../../src/index'), {
  virtual: true,
});
jest.mock('../../src/list.js', () => require('../../src/list'), {
  virtual: true,
});
jest.mock('../../src/rename.js', () => require('../../src/rename'), {
  virtual: true,
});

// --- tools under test -------------------------------------------------------

export { default as copyTool } from '../tools/copy';
export { default as createFolderTool } from '../tools/create_folder';
export { default as delTool } from '../tools/del';
export { default as getTool } from '../tools/get';
export { default as headTool } from '../tools/head';
export { default as listTool } from '../tools/list';
export { default as putTool } from '../tools/put';
export { default as renameTool } from '../tools/rename';

// --- shared test utilities --------------------------------------------------

/** The API host every non-`get` command talks to. */
export const BLOB_API_URL_AGENT = 'https://vercel.com';

/**
 * Store host used for direct `get` downloads. Deliberately lowercase: undici
 * normalises request hostnames, so a mixed-case origin would never match.
 */
export const BLOB_STORE_BASE_URL =
  'https://storeid.public.blob.vercel-storage.com';

export const READ_WRITE_TOKEN =
  'vercel_blob_rw_12345fakeStoreId_30FakeRandomCharacters12345678';

/**
 * `execute` only ever reads `ctx.abortSignal`, but `ToolContext` also requires
 * `session`, `callId`, `toolName`, `getSandbox` and `getSkill`. Rather than
 * fabricating those, cast a minimal object -- once, here.
 */
export function toolContext(abortSignal?: AbortSignal): ToolContext {
  return {
    abortSignal: abortSignal ?? new AbortController().signal,
  } as unknown as ToolContext;
}

/**
 * Installs a fresh undici `MockAgent` as the global dispatcher and resets the
 * Blob environment variables, matching `src/index.node.test.ts`.
 */
export function setupMockAgent(): MockAgent {
  delete process.env.BLOB_STORE_ID;
  delete process.env.VERCEL_OIDC_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = READ_WRITE_TOKEN;
  process.env.VERCEL_BLOB_RETRIES = '0';

  const mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);

  return mockAgent;
}
