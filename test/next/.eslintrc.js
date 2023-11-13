module.exports = {
  root: true,
  extends: [
    require.resolve('@vercel/style-guide/eslint/node'),
    require.resolve('@vercel/style-guide/eslint/react'),
    require.resolve('@vercel/style-guide/eslint/next'),
    require.resolve('@vercel/style-guide/eslint/typescript'),
  ],
  parserOptions: {
    project: ['./tsconfig.json'],
    tsconfigRootDir: __dirname,
  },
  overrides: [
    {
      files: [
        'src/pages/**',
        'next.config.js',
        'src/app/**/{head,layout,page,}.tsx',
      ],
      rules: {
        'import/no-default-export': 'off',
        '@next/next/no-html-link-for-pages': 'off',
      },
    },
    {
      files: ['**/*.test.*'],
      extends: [require.resolve('@vercel/style-guide/eslint/jest')],
    },
    {
      files: ['**/*.tsx', '**/*.ts'],
      rules: {
        '@typescript-eslint/no-misused-promises': [
          2,
          {
            checksVoidReturn: false,
          },
        ],
      },
    },
  ],
  ignorePatterns: ['node_modules/', '.next/', 'coverage/', 'dist/', 'public/'],
};
