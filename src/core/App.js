import { ConfigManager } from './ConfigManager.js';
import { EventBus } from './EventBus.js';
import { AttendanceModule } from '../modules/AttendanceModule.js';
import { AutoRaterModule } from '../modules/AutoRaterModule.js';
import { UIModule } from '../modules/UIModule.js';

export class App {
	constructor() {
		this.eventBus = new EventBus();
		this.configManager = new ConfigManager();
		this.modules = new Map();
		this.isInitialized = false;
	}

	async init() {
		if (this.isInitialized) return;

		try {
			// Проверка доступности GM функций
			if (typeof GM_registerMenuCommand === 'undefined') {
				console.warn('GM функции недоступны. Меню не будет создано.');
			}

			// Загрузка конфигурации
			await this.configManager.loadConfig();

			// Инициализация модулей
			this.initModules();

			this.isInitialized = true;
			this.eventBus.emit('app:initialized');
		} catch (error) {
			console.error('Ошибка инициализации приложения:', error);
		}
	}

	initModules() {
		// Модуль статистики посещаемости
		this.modules.set(
			'attendance',
			new AttendanceModule({
				eventBus: this.eventBus,
				config: this.configManager.config,
			}),
		);

		// Модуль авто-оценки
		this.modules.set(
			'autoRater',
			new AutoRaterModule({
				eventBus: this.eventBus,
				config: this.configManager.config,
			}),
		);

		// Модуль UI
		this.modules.set(
			'ui',
			new UIModule({
				eventBus: this.eventBus,
				configManager: this.configManager,
			}),
		);

		// Инициализация всех модулей
		this.modules.forEach(module => module.init());
	}

	getModule(name) {
		return this.modules.get(name);
	}

	cleanup() {
		this.modules.forEach(module => module.cleanup());
		this.eventBus.cleanup();
	}
}
