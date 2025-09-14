import { App } from './core/App.js';

(async () => {
	const app = new App();
	await app.init();

	// Очистка при закрытии страницы
	window.addEventListener('unload', () => app.cleanup());
})();
