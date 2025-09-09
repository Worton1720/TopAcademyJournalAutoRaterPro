import { loadConfig, saveConfig, registerConfigMenu } from './config.js';
import { ConfigUI } from './config-ui.js';
import { AttendanceStats } from './attendance-stats.js';

(async () => {
	const CONFIG = await loadConfig();
	const stats = new AttendanceStats(CONFIG);

	registerConfigMenu(() => {
		const configUI = new ConfigUI(CONFIG, async newCfg => {
			// сохраняем конфиг
			await saveConfig(newCfg);

			stats.updateAttendanceStats();
		});

		configUI.show();
	});

	window.addEventListener('unload', () => stats.cleanup());
})();
