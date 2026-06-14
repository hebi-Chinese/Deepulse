import config from '@deepulse/configs/eslint'

export default [
  ...config,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Next.js layout 和 page 必须默认导出（框架要求）
    files: ['app/**/layout.tsx', 'app/**/page.tsx', 'app/**/error.tsx', 'app/**/loading.tsx'],
    rules: {
      'import/no-default-export': 'off',
    },
  },
]
