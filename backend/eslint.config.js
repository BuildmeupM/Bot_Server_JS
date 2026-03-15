const js = require('@eslint/js');
const prettier = require('eslint-config-prettier');

module.exports = [
    js.configs.recommended,
    prettier,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                require: 'readonly',
                module: 'readonly',
                exports: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                process: 'readonly',
                console: 'readonly',
                Buffer: 'readonly',
                setTimeout: 'readonly',
                setInterval: 'readonly',
                clearTimeout: 'readonly',
                clearInterval: 'readonly',
                URL: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_|^e$|^err$' }],
            'no-console': 'off',
            'prefer-const': 'warn',
            'no-var': 'error',
            'no-empty': ['error', { allowEmptyCatch: true }],
        },
    },
    // Playwright automation files use browser globals inside page.evaluate()
    {
        files: ['routes/bot-automation/peak-automation-flow.js'],
        languageOptions: {
            globals: {
                document: 'readonly',
                window: 'readonly',
                MouseEvent: 'readonly',
            },
        },
    },
    {
        ignores: ['node_modules/', 'uploads/', 'migrations/'],
    },
];
