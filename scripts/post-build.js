/* eslint-disable no-console */
import fs from 'node:fs/promises';

// ensures index.node.d.ts and index.edge.d.ts are completely equal,
// then creates a single index.d.ts file for both.
async function main() {
  // runs with cwd at root, so "." refers to the root directory
  const nodeTypesPath = './dist/index.node.d.ts';
  const edgeTypesPath = './dist/index.edge.d.ts';
  const commonTypesPath = './dist/index.d.ts';
  const prefix = 'scripts/post-build.js: ';

  const [nodeTypesContent, edgeTypesContent] = await Promise.all([
    fs.readFile(nodeTypesPath, 'utf-8'),
    fs.readFile(edgeTypesPath, 'utf-8'),
  ]).catch((error) => {
    console.error(
      `${prefix} Could not read either ${nodeTypesPath} or ${edgeTypesPath}`,
    );
    console.error(error);
    process.exit(1);
  });

  if (nodeTypesContent !== edgeTypesContent) {
    console.error(
      `${prefix} Exported types of node and edge bundles differ. They must be an exact match.`,
    );
    process.exit(1);
  }

  // create index.d.ts to represent both imports
  await fs.writeFile(commonTypesPath, nodeTypesContent);
}

main().catch(console.error);
/* eslint-enable no-console */
