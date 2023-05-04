const { resolve } = require('node:path');

module.exports = {
  root: true,
  // This tells ESLint to load the config from the package `eslint-config-custom`
  extends: ['custom'],
  parserOptions: {
    project: [
      resolve(__dirname, './packages/*/tsconfig.json'),
      resolve(__dirname, './tooling/*/tsconfig.json'),
    ],
  },
};
