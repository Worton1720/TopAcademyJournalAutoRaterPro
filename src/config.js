export const DEFAULT_CONFIG = {
	ZOOM_LEVEL: '80%',
	PROGRESS_PAGE_REGEX: 'https://journal.top-academy.ru/.*/main/progress/.*',
};

// Функция для загрузки конфигурации
export async function loadConfig() {
	const userConfig = await GM_getValue('config', DEFAULT_CONFIG);

	let regexStr = DEFAULT_CONFIG.PROGRESS_PAGE_REGEX;

	if (typeof userConfig.PROGRESS_PAGE_REGEX === 'string') {
		regexStr = userConfig.PROGRESS_PAGE_REGEX;
	} else if (
		userConfig.PROGRESS_PAGE_REGEX &&
		typeof userConfig.PROGRESS_PAGE_REGEX.source === 'string'
	) {
		// если сохранили объект { source, flags }
		regexStr = userConfig.PROGRESS_PAGE_REGEX.source;
	}

	try {
		userConfig.PROGRESS_PAGE_REGEX = new RegExp(regexStr);
	} catch {
		console.warn('Невалидный Regex, используем дефолт');
		userConfig.PROGRESS_PAGE_REGEX = new RegExp(
			DEFAULT_CONFIG.PROGRESS_PAGE_REGEX
		);
	}

	return userConfig;
}

// Функция для сохранения конфигурации
export async function saveConfig(newConfig) {
	const cfg = { ...newConfig };
	if (cfg.PROGRESS_PAGE_REGEX instanceof RegExp) {
		cfg.PROGRESS_PAGE_REGEX = cfg.PROGRESS_PAGE_REGEX.source;
	}
	await GM_setValue('config', cfg);
}

// Функция для регистрации меню настроек
export function registerConfigMenu(callback) {
	GM_registerMenuCommand('Настройки скрипта', callback);
}
