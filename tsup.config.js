import fs from 'node:fs/promises';
import { defineConfig } from 'tsup';

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  entry: ['src/index.node.ts', 'src/index.edge.ts'],
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
  // We only need to do this for the node bundles, since the workaround is only
  // used there. It is not used in edge bundles, so they don't need to apply it.
  //
  // This should now make the library usable without any warnings at all.
  onSuccess: async () => {
    // replace in node cjs & esm bundles
    const esmNodePath = './dist/index.node.js';
    const cjsNodePath = './dist/index.node.cjs';

    const [esmNodeContent, cjsNodeContent] = await Promise.all([
      fs.readFile(esmNodePath, 'utf-8'),
      fs.readFile(cjsNodePath, 'utf-8'),
    ]);

    await Promise.all([
      // replace in node esm bundle
      fs.writeFile(
        esmNodePath,
        esmNodeContent.replace('import(', 'import(/* webpackIgnore: true */'),
      ),

      // replace in node cjs bundle
      fs.writeFile(
        cjsNodePath,
        cjsNodeContent.replace('require(', 'require(/* webpackIgnore: true */'),
      ),
    ]);
  },
});
