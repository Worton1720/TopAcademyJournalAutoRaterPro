import { ConfigUI } from '../core/ConfigUI.js';

export class UIModule {
	constructor({ eventBus, configManager }) {
		this.eventBus = eventBus;
		this.configManager = configManager;
		this.configUI = null;
	}

	init() {
		this.setupEventListeners();
		// Убедитесь, что этот метод вызывается
		this.configManager.registerMenuCommands(this.eventBus);
	}

	setupEventListeners() {
		this.eventBus.on('config:show-ui', () => this.showConfigUI());
	}

	showConfigUI() {
		try {
			if (this.configUI) {
				this.configUI.show();
				return;
			}

			// Убрали динамический импорт, используем прямой
			this.configUI = new ConfigUI(
				this.configManager.config,
				async newConfig => {
					const success = await this.configManager.saveConfig(newConfig);
					if (success) {
						this.eventBus.emit('config:updated');
					}
				},
			);
			this.configUI.show();
		} catch (error) {
			console.error('Failed to load ConfigUI module:', error);
		}
	}

	cleanup() {
		this.eventBus.off('config:show-ui', () => this.showConfigUI());
	}
}
