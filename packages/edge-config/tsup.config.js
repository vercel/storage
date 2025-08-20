import { defineConfig } from 'tsup';

// eslint-disable-next-line import/no-default-export -- [@vercel/style-guide@5 migration]
export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    splitting: true,
    sourcemap: true,
    minify: false,
    clean: true,
    skipNodeModulesBundle: true,
    dts: true,
    external: ['node_modules'],
  },
  {
    entry: ['src/cli.ts'],
    format: ['esm'],
    splitting: true,
    sourcemap: true,
    minify: false,
    clean: true,
    skipNodeModulesBundle: true,
    dts: true,
    external: ['node_modules'],
  },
]);
