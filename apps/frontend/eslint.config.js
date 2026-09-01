const eslint = require('@eslint/js');
const angular = require('angular-eslint');
const jasmine = require('eslint-plugin-jasmine');
const globals = require('globals');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
    {
        ignores: ['dist/**', 'node_modules/**', 'src/app/api-clients/**']
    },
    {
        files: ['**/*.ts'],
        extends: [
            eslint.configs.recommended,
            ...tseslint.configs.recommended,
            ...angular.configs.tsRecommended
        ],
        processor: angular.processInlineTemplates,
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node
            },
            parserOptions: {
                project: ['./tsconfig.json'],
                tsconfigRootDir: __dirname
            }
        },
        rules: {
            '@angular-eslint/prefer-inject': 'off',
            '@angular-eslint/prefer-standalone': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                    varsIgnorePattern: '^_'
                }
            ],
            'class-methods-use-this': 'off',
            'no-console': 'off',
            'no-continue': 'off',
            'no-useless-assignment': 'off'
        }
    },
    {
        files: ['**/*.html'],
        extends: [...angular.configs.templateRecommended]
    },
    {
        files: ['src/**/*.spec.ts'],
        plugins: {
            jasmine
        },
        languageOptions: {
            globals: globals.jasmine
        },
        rules: {
            ...jasmine.configs.recommended.rules,
            '@typescript-eslint/no-unused-vars': 'off'
        }
    }
);
