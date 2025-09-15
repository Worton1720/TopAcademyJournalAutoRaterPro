import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// __dirname для ES-модуля
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Генерация заголовка UserScript
function userScriptHeader() {
	return {
		name: 'userscript-header',
		generateBundle(options, bundle) {
			const metaPath = path.resolve(__dirname, 'usermeta.json');
			const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
			let header = '// ==UserScript==\n';
			for (const key of Object.keys(meta)) {
				const value = meta[key];
				if (Array.isArray(value)) {
					value.forEach(v => (header += `// @${key}      ${v}\n`));
				} else {
					header += `// @${key}      ${value}\n`;
				}
			}
			header += '// ==/UserScript==\n\n';

			for (const file of Object.values(bundle)) {
				file.code = header + file.code;
			}
		},
	};
}

// Базовые плагины
const basePlugins = [resolve(), commonjs(), userScriptHeader()];

export default [
	// Неминифицированная версия (dev)
	{
		input: 'src/main.js',
		output: {
			file: 'dist/dev/main.user.js',
			format: 'iife',
			sourcemap: false,
		},
		plugins: basePlugins,
	},
	// Минифицированная версия (prod)
	{
		input: 'src/main.js',
		output: {
			file: 'dist/prod/main.user.js',
			format: 'iife',
			sourcemap: false,
		},
		plugins: [...basePlugins, terser()],
	},
];
