const DEFAULT_CONFIG = {
	ZOOM_LEVEL: '80%',
	PROGRESS_PAGE_REGEX: 'https://journal.top-academy.ru/.*/main/progress/.*',
	AUTO_RATE_ENABLED: true,
	AUTO_SUBMIT_ENABLED: true,
};

export class ConfigManager {
	constructor() {
		this.config = { ...DEFAULT_CONFIG };
	}

	async loadConfig() {
		try {
			const userConfig = await GM_getValue('config', {});
			this.config = { ...DEFAULT_CONFIG, ...userConfig };
			this.normalizeConfig();
		} catch (error) {
			console.warn(
				'Ошибка загрузки конфигурации, используются значения по умолчанию'
			);
			this.config = { ...DEFAULT_CONFIG };
		}
	}

	async saveConfig(newConfig) {
		try {
			this.config = { ...this.config, ...newConfig };
			this.normalizeConfig();
			await GM_setValue('config', this.config);
			return true;
		} catch (error) {
			console.error('Ошибка сохранения конфигурации:', error);
			return false;
		}
	}

	normalizeConfig() {
		// Нормализация regex
		if (typeof this.config.PROGRESS_PAGE_REGEX === 'string') {
			try {
				this.config.PROGRESS_PAGE_REGEX = new RegExp(
					this.config.PROGRESS_PAGE_REGEX
				);
			} catch {
				this.config.PROGRESS_PAGE_REGEX = new RegExp(
					DEFAULT_CONFIG.PROGRESS_PAGE_REGEX
				);
			}
		}
	}

	registerMenuCommands(eventBus) {
		GM_registerMenuCommand('Настройки скрипта', () => {
			eventBus.emit('config:show-ui');
		});
	}
}
