import assert from 'node:assert';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it } from 'vitest';
import jscodeshift, { type API } from 'jscodeshift';
import transform from '../src';

const buildApi = (parser: string | undefined): API => ({
  j: parser ? jscodeshift.withParser(parser) : jscodeshift,
  jscodeshift: parser ? jscodeshift.withParser(parser) : jscodeshift,
  stats: () => {
    // eslint-disable-next-line no-console -- acceptable log
    console.error(
      'The stats function was called, which is not supported on purpose',
    );
  },
  report: () => {
    // eslint-disable-next-line no-console -- acceptable log
    console.error(
      'The report function was called, which is not supported on purpose',
    );
  },
});

describe('vercel-postgres-to-neon', () => {
  it.each(['example-1', 'example-2', 'example-3', 'example-4', 'example-5'])(
    '%s works',
    async (exampleName) => {
      const INPUT = await readFile(
        join(__dirname, '..', `__testfixtures__/${exampleName}.input.ts`),
        'utf-8',
      );
      const OUTPUT = await readFile(
        join(__dirname, '..', `__testfixtures__/${exampleName}.output.ts`),
        'utf-8',
      );

      const actualOutput = transform(
        {
          path: 'index.js',
          source: INPUT,
        },
        buildApi('tsx'),
      );

      assert.deepEqual(
        actualOutput.replace(/W/gm, ''),
        OUTPUT.replace(/W/gm, ''),
      );
    },
  );
});
