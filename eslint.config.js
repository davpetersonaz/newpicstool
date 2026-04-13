//eslint.config.js
import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import prettier from 'eslint-config-prettier';

export default [
    js.configs.recommended,
    importPlugin.flatConfigs.recommended,
    prettier,
    {
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                process: 'readonly',
                console: 'readonly',
                __dirname: 'readonly',
            },
        },
        rules: {
            'no-console': ['warn', { allow: ['error', 'warn'] }],
            'import/no-named-as-default-member': 'off', 
            'no-unused-vars': 'warn',
            'semi': ['error', 'always'],
            'quotes': ['warn', 'single'],
            'indent': ['warn', 'tab'],
            'no-undef': 'error',
            'no-empty': 'off',
            'no-var': 'warn',
            'prefer-const': 'warn',

            // Import sorting rules
            'import/order': ['warn', {
                groups: [
                    'builtin',
                    'external',
                    'internal',
                    'parent',
                    'sibling',
                    'index'
                ],
                'newlines-between': 'always',
                alphabetize: {
                    order: 'asc',
                    caseInsensitive: true
                }
            }],
            'import/newline-after-import': 'warn',
        },
    },
    {
        ignores: ['node_modules/', 'public/images/', 'src/generated/']
    }
];