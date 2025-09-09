/**
 * Дебаунс-функция.
 * Ограничивает частоту вызова функции func до одного раза в wait мс.
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
 */
export function parseLocalDate(dateStr) {
	const [y, m, d] = dateStr.split('-').map(Number);
	return new Date(y, m - 1, d);
}

/**
 * Форматирует объект Date в строку YYYY-MM-DD.
 */
export function formatDate(date) {
	const yyyy = date.getFullYear();
	const mm = String(date.getMonth() + 1).padStart(2, '0');
	const dd = String(date.getDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
}
