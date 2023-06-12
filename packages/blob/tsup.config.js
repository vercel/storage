import { defineConfig } from 'tsup';

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  entry: ['src/index.ts', 'src/client.ts'],
  format: ['esm', 'cjs'],
  splitting: false,
  sourcemap: false,
  minify: true,
  clean: true,
  skipNodeModulesBundle: true,
  dts: true,
  external: ['node_modules'],
});
