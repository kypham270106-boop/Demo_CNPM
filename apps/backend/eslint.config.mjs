import tseslint from 'typescript-eslint';

export default [
  { ignores: ['dist/**', 'coverage/**', '.audit-local/**', '.local-db/**'] },
  ...tseslint.configs.recommended,
];
