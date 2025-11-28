import { defineConfig } from 'tsup';

export default [
  defineConfig({
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    splitting: true,
    sourcemap: true,
    minify: false,
    clean: true,
    skipNodeModulesBundle: true,
    dts: true,
    external: ['node_modules'],
  }),
  // Separate configs so we don't get split types
  defineConfig({
    entry: ['src/index.next-js.ts'],
    format: ['esm', 'cjs'],
    splitting: true,
    sourcemap: true,
    minify: false,
    clean: true,
    skipNodeModulesBundle: true,
    dts: true,
    external: ['node_modules'],
  }),
  // postinstall script
  defineConfig({
    entry: ['scripts/postinstall.ts'],
    format: 'esm',
    splitting: true,
    sourcemap: true,
    minify: false,
    clean: true,
    skipNodeModulesBundle: true,
    dts: true,
    external: ['node_modules'],
  }),
];
