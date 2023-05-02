module.exports = {
  root: true,
  extends: [
    require.resolve('@vercel/style-guide/eslint/node'),
    require.resolve('@vercel/style-guide/eslint/react'),
    require.resolve('@vercel/style-guide/eslint/next'),
    require.resolve('@vercel/style-guide/eslint/typescript'),
  ],
  parserOptions: {
    project: './tsconfig.json',
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
      },
    },
    {
      files: ['**/*.test.*'],
      extends: [require.resolve('@vercel/style-guide/eslint/jest')],
    },
  ],
  ignorePatterns: ['node_modules/', '.next/', 'coverage/', 'dist/', 'public/'],
};
