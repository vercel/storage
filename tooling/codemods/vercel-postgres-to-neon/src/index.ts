import { type API, type FileInfo } from 'jscodeshift';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type, import/no-default-export -- ignore
export default function transform(file: FileInfo, api: API) {
  try {
    const j = api.jscodeshift;
    const root = j(file.source);

    // Find and replace the Vercel Postgres import with Neon Database import
    const vercelPostgresImport = root
      .find(j.ImportDeclaration)
      .filter((path) => path.node.source.value === '@vercel/postgres');

    if (!vercelPostgresImport.size()) {
      throw new UnprocessableFileError('File does not import @vercel/postgres');
    }

    const hasSqlImport = vercelPostgresImport.some((path) =>
      Boolean(path.node.specifiers?.some((spec) => spec.local?.name === 'sql')),
    );

    if (!hasSqlImport) {
      throw new UnprocessableFileError(
        'File does not import sql from @vercel/postgres',
      );
    }

    vercelPostgresImport.forEach((path) => {
      if (path.node.specifiers?.some((spec) => spec.local?.name === 'sql')) {
        if (path.node.specifiers.length === 1) {
          const vercelComments = path.node.comments;
          path.node.source = j.literal('@neondatabase/serverless');
          path.node.specifiers = [j.importSpecifier(j.identifier('neon'))];
          path.node.comments = vercelComments || null;
        } else {
          path.node.specifiers = path.node.specifiers.filter(
            (spec) => spec.local?.name !== 'sql',
          );
        }
      }
    });

    // Add the new import for @neondatabase/serverless if missing
    const neonImport = root
      .find(j.ImportDeclaration)
      .filter((path) => path.node.source.value === '@neondatabase/serverless');

    if (!neonImport.size()) {
      const newNeonImport = j.importDeclaration(
        [j.importSpecifier(j.identifier('neon'))],
        j.literal('@neondatabase/serverless'),
      );

      const vercelImport = root
        .find(j.ImportDeclaration)
        .filter((path) => path.node.source.value === '@vercel/postgres');

      if (vercelImport.size()) {
        vercelImport.insertAfter(newNeonImport);
      } else {
        const lastImport = root.find(j.ImportDeclaration).at(-2);
        if (lastImport.size()) {
          lastImport.insertAfter(newNeonImport);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- ignore
          root.get().node.program.body.unshift(newNeonImport);
        }
      }
    }

    // Add `const sql = neon(process.env.POSTGRES_URL);` after the imports
    const newSqlDeclaration = j.variableDeclaration('const', [
      j.variableDeclarator(
        j.identifier('sql'),
        j.callExpression(j.identifier('neon'), [
          j.memberExpression(
            j.identifier('process'),
            j.identifier('env.POSTGRES_URL'),
          ),
        ]),
      ),
    ]);

    const lastImport = root.find(j.ImportDeclaration).at(-1);
    if (lastImport.size()) {
      lastImport.insertAfter(newSqlDeclaration);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- ignore
      root.get().node.program.body.unshift(newSqlDeclaration);
    }

    return root.toSource();
  } catch (err) {
    if (err instanceof UnprocessableFileError) {
      // eslint-disable-next-line no-console -- ignore
      console.warn(`Could not process file '${file.path}': ${err.message}`);

      return file.source;
    }

    throw err;
  }
}

class UnprocessableFileError extends Error {}
