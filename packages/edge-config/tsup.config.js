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
    // TODO workaround since the repo itself also runs postinstall, at which
    // point the dist folder does not exist yet. So we need to commit the file
    // for the repo itself
    outDir: 'dist-postinstall',
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
