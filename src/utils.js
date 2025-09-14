/**
 * Дебаунс-функция.
 * Ограничивает частоту вызова функции func до одного раза в wait мс.
 * @param {Function} func - функция, которую нужно ограничить
 * @param {number} wait - время ожидания в мс
 * @returns {Function} - обёрнутая функция
 */
export function debounce(func, wait) {
	let timeout;
	return function (...args) {
		clearTimeout(timeout);
		timeout = setTimeout(() => func.apply(this, args), wait);
	};
}

/**
 * Преобразует строку в формате YYYY-MM-DD в объект Date (местная дата, полуночь).
 * @param {string} dateStr - строка в формате YYYY-MM-DD
 * @returns {Date} - объект Date
 */
export function parseLocalDate(dateStr) {
	const [y, m, d] = dateStr.split('-').map(Number);
	return new Date(y, m - 1, d);
}

/**
 * Форматирует объект Date в строку YYYY-MM-DD.
 * @param {Date} date - объект Date
 * @returns {string} - строка в формате YYYY-MM-DD
 */
export function formatDate(date) {
	const yyyy = date.getFullYear();
	const mm = String(date.getMonth() + 1).padStart(2, '0');
	const dd = String(date.getDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}
