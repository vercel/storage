import fs from 'node:fs/promises';
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
  // We use the join() trick in index.ts to avoid this warning of the Edge Runtime
  //   A Node.js module is loaded ('fs/promises' at line 1) which is not supported in the Edge Runtime.
  //
  // However, this leads to a new warning, as the join() s a dynamic require:
  //   Critical dependency: the request of a dependency is an expression
  //
  // So we silence that warning by adding a /* webpackIgnore: true */
  // comment onto the completed build output.
  //
  // This should now make the library usable without any warnings at all.
  onSuccess: async () => {
    // replace in esm bundle
    const esmPath = './dist/index.js';
    const cjsPath = './dist/index.cjs';

    const [esmContent, cjsContent] = await Promise.all([
      fs.readFile(esmPath, 'utf-8'),
      fs.readFile(cjsPath, 'utf-8'),
    ]);

    await Promise.all([
      // replace in esm bundle
      fs.writeFile(
        esmPath,
        esmContent.replace('import(', 'import(/* webpackIgnore: true */'),
      ),

      // replace in cjs bundle
      fs.writeFile(
        cjsPath,
        cjsContent.replace('require(', 'require(/* webpackIgnore: true */'),
      ),
    ]);
  },
});
