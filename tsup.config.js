import fs from 'node:fs';
import { defineConfig } from 'tsup';

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  splitting: true,
  sourcemap: false,
  minify: true,
  clean: true,
  skipNodeModulesBundle: true,
  dts: true,
  external: ['node_modules'],
  onSuccess: () => {
    const path = './dist/index.js';
    const content = fs.readFileSync(path, 'utf-8');
    fs.writeFileSync(
      path,
      content.replace('import(', 'import(/* webpackIgnore: true */'),
    );
  },
});
