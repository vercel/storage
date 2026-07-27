/**
 * Input-schema guards and approval wiring. These are pure-validation tests --
 * no HTTP is involved, and nothing here should ever reach the network.
 */

import {
  copyTool,
  createFolderTool,
  delTool,
  getTool,
  headTool,
  listTool,
  putTool,
  renameTool,
} from './harness';

/** `approval` is optional on a tool definition, so read it structurally. */
function approvalOf(tool: unknown): unknown {
  return (tool as { approval?: unknown }).approval;
}

interface ParseIssue {
  path: PropertyKey[];
  message: string;
}

interface ParseResult {
  success: boolean;
  data?: unknown;
  error?: { issues: ParseIssue[] };
}

/**
 * `inputSchema` is surfaced by eve's types as a standard-schema value, which
 * hides zod's `safeParse`. The runtime object is the zod schema the tool
 * declared, so reach through the standard-schema facade to call it.
 */
function safeParse(schema: unknown, input: unknown): ParseResult {
  return (schema as { safeParse: (value: unknown) => ParseResult }).safeParse(
    input,
  );
}

const BLOB_URL = 'https://storeid.public.blob.vercel-storage.com/foo.txt';
const OTHER_BLOB_URL = 'https://storeid.public.blob.vercel-storage.com/bar.txt';

describe('del inputSchema', () => {
  it('rejects ifMatch combined with more than one target', () => {
    const result = safeParse(delTool.inputSchema, {
      urlOrPathname: [BLOB_URL, OTHER_BLOB_URL],
      ifMatch: '"abc123"',
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toHaveLength(1);
    expect(result.error?.issues[0]?.path).toEqual(['ifMatch']);
    expect(result.error?.issues[0]?.message).toBe(
      'ifMatch can only be used when deleting a single blob. Pass exactly one urlOrPathname, or omit ifMatch.',
    );
  });

  it('accepts ifMatch with exactly one target', () => {
    const result = safeParse(delTool.inputSchema, {
      urlOrPathname: [BLOB_URL],
      ifMatch: '"abc123"',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      urlOrPathname: [BLOB_URL],
      ifMatch: '"abc123"',
    });
  });

  it('accepts many targets when ifMatch is omitted', () => {
    const result = safeParse(delTool.inputSchema, {
      urlOrPathname: [BLOB_URL, OTHER_BLOB_URL, 'baz.txt'],
    });

    expect(result.success).toBe(true);
  });

  it('still rejects an empty target list', () => {
    expect(safeParse(delTool.inputSchema, { urlOrPathname: [] }).success).toBe(
      false,
    );
  });
});

describe('put inputSchema', () => {
  const base = {
    pathname: 'foo.txt',
    body: 'hello',
    access: 'public' as const,
  };

  it('rejects ifMatch combined with allowOverwrite: false', () => {
    const result = safeParse(putTool.inputSchema, {
      ...base,
      ifMatch: '"abc123"',
      allowOverwrite: false,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toHaveLength(1);
    expect(result.error?.issues[0]?.path).toEqual(['allowOverwrite']);
    expect(result.error?.issues[0]?.message).toBe(
      'ifMatch performs a conditional overwrite, so it cannot be combined with allowOverwrite: false. Omit allowOverwrite, or set it to true.',
    );
  });

  it('accepts ifMatch with allowOverwrite: true', () => {
    expect(
      safeParse(putTool.inputSchema, {
        ...base,
        ifMatch: '"abc123"',
        allowOverwrite: true,
      }).success,
    ).toBe(true);
  });

  it('accepts ifMatch when allowOverwrite is omitted', () => {
    expect(
      safeParse(putTool.inputSchema, { ...base, ifMatch: '"abc123"' }).success,
    ).toBe(true);
  });

  it('accepts allowOverwrite: false when ifMatch is omitted', () => {
    expect(
      safeParse(putTool.inputSchema, { ...base, allowOverwrite: false })
        .success,
    ).toBe(true);
  });
});

describe('approval wiring', () => {
  // Destructive tools must ask. This is a deliberate product decision, so pin
  // it: widening or dropping it should not slip through unnoticed.
  it.each([
    ['del', delTool],
    ['rename', renameTool],
  ])('%s requires user approval', (_name, tool) => {
    const approval = approvalOf(tool);

    expect(approval).toBeDefined();
    expect(typeof approval).toBe('function');
    // `always()` from eve/tools/approval resolves to 'user-approval'.
    expect((approval as (ctx: unknown) => unknown)({})).toBe('user-approval');
  });

  it.each([
    ['put', putTool],
    ['copy', copyTool],
    ['get', getTool],
    ['head', headTool],
    ['list', listTool],
    ['create_folder', createFolderTool],
  ])('%s does not require approval', (_name, tool) => {
    expect(approvalOf(tool)).toBeUndefined();
  });
});
