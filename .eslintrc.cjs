// ESLint Configuration for Hotline Backend
// Enforces code quality and consistent style

module.exports = {
  env: {
    node: true,
    es2022: true,
    jest: true,
  },
  extends: ["eslint:recommended"],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  rules: {
    // Possible Errors
    "no-console": "warn",
    "no-unused-vars": ["error", { argsIgnorePattern: "^_|next|req|res" }],
    "no-undef": "error",

    // Best Practices
    "eqeqeq": ["error", "always"],
    "no-eval": "error",
    "no-implied-eval": "error",
    "no-return-await": "error",
    "require-await": "warn",
    
    // Variables
    "no-var": "error",
    "prefer-const": "error",
    
    // Stylistic (warnings only)
    "semi": ["warn", "always"],
    "quotes": ["warn", "double", { avoidEscape: true }],
    "comma-dangle": ["warn", "only-multiline"],
    "no-trailing-spaces": "warn",
    "indent": ["warn", 2, { SwitchCase: 1 }],
    
    // ES6+
    "arrow-spacing": "warn",
    "no-duplicate-imports": "error",
    "prefer-template": "warn",
  },
  ignorePatterns: [
    "node_modules/",
    "coverage/",
    "dist/",
    "*.test.js",
  ],
};
