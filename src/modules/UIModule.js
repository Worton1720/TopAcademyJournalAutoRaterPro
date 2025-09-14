export class UIModule {
	constructor({ eventBus, configManager }) {
		this.eventBus = eventBus;
		this.configManager = configManager;
		this.configUI = null;
	}

	init() {
		this.setupEventListeners();
		this.configManager.registerMenuCommands(this.eventBus);
	}

	setupEventListeners() {
		this.eventBus.on('config:show-ui', () => this.showConfigUI());
	}

	showConfigUI() {
		if (this.configUI) {
			this.configUI.show();
			return;
		}

		// Убрали динамический импорт, используем прямой
		this.configUI = new ConfigUI(this.configManager.config, async newConfig => {
			const success = await this.configManager.saveConfig(newConfig);
			if (success) {
				this.eventBus.emit('config:updated');
			}
		});
		this.configUI.show();
	}

	cleanup() {
		this.eventBus.off('config:show-ui', () => this.showConfigUI());
	}
}
