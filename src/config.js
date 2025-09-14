export const DEFAULT_CONFIG = {
	ZOOM_LEVEL: '80%',
	PROGRESS_PAGE_REGEX: 'https://journal.top-academy.ru/.*/main/progress/.*',
};

/**
 * Функция для загрузки конфигурации
 * @return {Object} конфигурация
 */
export async function loadConfig() {
	const userConfig = await GM_getValue('config', DEFAULT_CONFIG);

	// Если пользователь установил свой Regex, то используем его
	let regexStr = DEFAULT_CONFIG.PROGRESS_PAGE_REGEX;

	if (typeof userConfig.PROGRESS_PAGE_REGEX === 'string') {
		regexStr = userConfig.PROGRESS_PAGE_REGEX;
	} else if (
		userConfig.PROGRESS_PAGE_REGEX &&
		typeof userConfig.PROGRESS_PAGE_REGEX.source === 'string'
	) {
		// Если пользователь сохранил объект { source, flags },
		// то используем его source
		regexStr = userConfig.PROGRESS_PAGE_REGEX.source;
	}

	try {
		// Преобразуем строку в объект RegExp
		userConfig.PROGRESS_PAGE_REGEX = new RegExp(regexStr);
	} catch {
		console.warn('Невалидный Regex, используем дефолт');
		// Если пользовательский Regex не валиден, то используем дефолт
		userConfig.PROGRESS_PAGE_REGEX = new RegExp(
			DEFAULT_CONFIG.PROGRESS_PAGE_REGEX
		);
	}

	return userConfig;
}

/**
 * Функция для сохранения конфигурации
 * @param {Object} newConfig - новая конфигурация
 */
export async function saveConfig(newConfig) {
	const cfg = { ...newConfig };
	if (cfg.PROGRESS_PAGE_REGEX instanceof RegExp) {
		// Если конфигурация содержит объект RegExp,
		// то преобразуем его source в строку
		cfg.PROGRESS_PAGE_REGEX = cfg.PROGRESS_PAGE_REGEX.source;
	}
	await GM_setValue('config', cfg);
}

/**
 * Функция для регистрации меню настроек
 * @param {Function} callback - функция, которая будет вызвана при нажатии на пункт меню
 */
export function registerConfigMenu(callback) {
	GM_registerMenuCommand('Настройки скрипта', callback);
}
