const DEFAULT_CONFIG = {
	ZOOM_LEVEL: '80%',
	PROGRESS_PAGE_REGEX: 'https://journal.top-academy.ru/.*/main/progress/.*',
	AUTO_RATE_ENABLED: true,
	AUTO_SUBMIT_ENABLED: true,
};

export class ConfigManager {
	constructor() {
		this.config = { ...DEFAULT_CONFIG };
		this.listeners = new Set();
	}

	async loadConfig() {
		try {
			const userConfig = await GM_getValue('config', {});

			// Обеспечиваем корректный формат ZOOM_LEVEL
			let zoomLevel = userConfig.ZOOM_LEVEL || DEFAULT_CONFIG.ZOOM_LEVEL;
			if (typeof zoomLevel === 'number') {
				zoomLevel = `${zoomLevel}%`;
			} else if (typeof zoomLevel === 'string' && !zoomLevel.includes('%')) {
				zoomLevel = `${zoomLevel}%`;
			}

			this.config = {
				...DEFAULT_CONFIG,
				...userConfig,
				ZOOM_LEVEL: zoomLevel,
			};
			this.notifyListeners();
		} catch (error) {
			console.warn(
				'Ошибка загрузки конфигурации, используются значения по умолчанию.\nWarning: ' +
					error,
			);
			this.config = { ...DEFAULT_CONFIG };
			this.notifyListeners();
		}
	}

	async saveConfig(newConfig) {
		try {
			// Обеспечиваем корректный формат ZOOM_LEVEL
			let zoomLevel = newConfig.ZOOM_LEVEL || this.config.ZOOM_LEVEL;
			if (typeof zoomLevel === 'number') {
				zoomLevel = `${zoomLevel}%`;
			} else if (typeof zoomLevel === 'string' && !zoomLevel.includes('%')) {
				zoomLevel = `${zoomLevel}%`;
			}

			this.config = {
				...this.config,
				...newConfig,
				ZOOM_LEVEL: zoomLevel,
			};

			// Сохраняем как строку, чтобы избежать проблем с сериализацией RegExp
			const configToSave = { ...this.config };
			if (configToSave.PROGRESS_PAGE_REGEX instanceof RegExp) {
				configToSave.PROGRESS_PAGE_REGEX =
					configToSave.PROGRESS_PAGE_REGEX.toString();
			}

			await GM_setValue('config', configToSave);
			this.notifyListeners();
			return true;
		} catch (error) {
			console.error('Ошибка сохранения конфигурации:', error);
			return false;
		}
	}

	// Добавляем слушателей изменений конфигурации
	addChangeListener(listener) {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	removeChangeListener(listener) {
		this.listeners.delete(listener);
	}

	notifyListeners() {
		this.listeners.forEach(listener => {
			try {
				listener(this.config);
			} catch (error) {
				console.error('Ошибка в слушателе конфигурации:', error);
			}
		});
	}

	registerMenuCommands(eventBus) {
		try {
			GM_registerMenuCommand('Настройки скрипта', () => {
				eventBus.emit('config:show-ui');
			});
			console.log('Меню-команда "Настройки скрипта" зарегистрирована');
		} catch (error) {
			console.error('Ошибка регистрации меню-команды:', error);
		}
	}
}
