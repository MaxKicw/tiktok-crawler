module.exports = {
  parser: '@babel/eslint-parser', // Use Babel parser for modern syntax
  parserOptions: {
    requireConfigFile: false, // This allows you to use the parser without a Babel config file
    ecmaVersion: 2020, // or 2021, or 'latest' for the most recent features
    sourceType: 'module', // Allows for the use of imports
  },
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: ['eslint:recommended'],
};
