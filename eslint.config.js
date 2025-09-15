import js from '@eslint/js';
import globals from 'globals';

export default [
	js.configs.recommended,
	{
		files: ['src/**/*.js'],
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: 'module',
			globals: {
				...globals.browser,
				GM_getValue: 'readonly',
				GM_setValue: 'readonly',
				GM_registerMenuCommand: 'readonly',
				GM_addStyle: 'readonly',
			},
		},
		rules: {
			// Базовые правила
			// 'no-console': ['warn', { allow: ['warn', 'error'] }],
			'no-console': 'off',
			'no-unused-vars': 'warn',
			'no-debugger': 'error',

			// Стилистические правила
			indent: ['error', 'tab'], // ← исправлено с 'ndent' на 'indent'
			quotes: ['error', 'single'],
			semi: ['error', 'always'],
			'comma-dangle': ['error', 'always-multiline'],
		},
	},
	{
		ignores: ['dist/**', 'node_modules/**'],
	},
];
