import { loadConfig, saveConfig, registerConfigMenu } from './config.js';
import { ConfigUI } from './config-ui.js';
import { AttendanceStats } from './attendance-stats.js';
import { AutoRater } from './auto-rater.js';

// функция для загрузки конфигурации
(async () => {
	const CONFIG = await loadConfig();
	const stats = new AttendanceStats(CONFIG);
	const rater = new AutoRater();

	// функция для регистрации меню конфигурации
	registerConfigMenu(() => {
		const configUI = new ConfigUI(CONFIG, async newCfg => {
			// сохраняем конфигурацию
			await saveConfig(newCfg);

			// обновляем статистику
			stats.updateAttendanceStats();
		});

		// отображаем меню конфигурации
		configUI.show();
	});

	// обработчик события закрытия страницы
	window.addEventListener('unload', () => {
		stats.cleanup();
		rater.cleanup();
	});
})();

// Комментарии
// - функция для загрузки конфигурации
// - создаем экземпляр класса AttendanceStats
// - регистрируем меню конфигурации
// - отображаем меню конфигурации
// - сохраняем конфигурацию
// - обновляем статистику
// - обработчик события закрытия страницы
