import { createWidget, removeWidget } from './attendance-widget.js';
import { debounce, parseLocalDate } from './utils.js';

export class AttendanceStats {
	constructor(CONFIG) {
		/**
		 * @param {Object} CONFIG - конфигурация
		 */
		this.CONFIG = CONFIG;
		this.widget = null;
		this.isCollapsed = false;
		this.rangeStart = null;
		this.rangeEnd = null;

		/**
		 * @param {number} ms - время ожидания
		 */
		this.updateAttendanceStats = debounce(
			this.updateAttendanceStats.bind(this),
			300
		);

		this.init();
	}

	init() {
		/**
		 * Установка масштаба страницы
		 */
		this.setPageZoom();
		if (this.isProgressPage()) this.initAttendanceStats();
		this.setupNavigationObserver();
	}

	isProgressPage() {
		/**
		 * Проверка, является ли страница страницей прогресса
		 */
		return this.CONFIG.PROGRESS_PAGE_REGEX.test(window.location.href);
	}

	setPageZoom() {
		/**
		 * Установка масштаба страницы
		 */
		document.documentElement.style.zoom = this.CONFIG.ZOOM_LEVEL;
	}

	initAttendanceStats() {
		if (!this.widget) {
			this.widget = createWidget();
			this.setDefaultDateRange();
			this.setupWidgetControls();
			this.setupRangeSelection();
			this.setupDateInputListeners();
		}
		this.updateAttendanceStats();
	}

	/**
	 * Установка диапазона с начала месяца до сегодня
	 */
	setDefaultDateRange() {
		const now = new Date();
		const yyyy = now.getFullYear();
		const mm = String(now.getMonth() + 1).padStart(2, '0');
		const dd = String(now.getDate()).padStart(2, '0');

		// Устанавливаем начало дня для rangeStart
		this.rangeStart = new Date(yyyy, now.getMonth(), 1);
		this.rangeStart.setHours(0, 0, 0, 0);

		// Устанавливаем конец дня для rangeEnd
		this.rangeEnd = new Date(yyyy, now.getMonth(), now.getDate());
		this.rangeEnd.setHours(23, 59, 59, 999);

		this.widget.querySelector('#date-from').value = `${yyyy}-${mm}-01`;
		this.widget.querySelector('#date-to').value = `${yyyy}-${mm}-${dd}`;
	}

	/**
	 * Установка контролов для виджета
	 */
	setupWidgetControls() {
		const resetBtn = this.widget.querySelector('#reset-stats');
		const refreshBtn = this.widget.querySelector('#refresh-stats');
		const toggleBtn = this.widget.querySelector('#toggle-stats');
		const header = this.widget.querySelector('strong');
		const body = this.widget.querySelector('.stats-body');

		// Сброс диапазона
		resetBtn.addEventListener('click', () => {
			this.setDefaultDateRange();
			this.clearHighlights();
			this.updateAttendanceStats();
		});

		// Обновление и подсветка
		refreshBtn.addEventListener('click', () => {
			this.updateAttendanceStats();
			this.highlightRange();
		});

		// Свертывание/разворачивание
		toggleBtn.addEventListener('click', () => {
			this.isCollapsed = !this.isCollapsed;
			if (this.isCollapsed) {
				this.widget.classList.add('collapsed');
				toggleBtn.textContent = '⯈';
			} else {
				this.widget.classList.remove('collapsed');
				toggleBtn.textContent = '⯆';
			}
		});
	}

	/**
	 * Обработчики для полей ввода дат
	 */
	setupDateInputListeners() {
		const dateFromInput = this.widget.querySelector('#date-from');
		const dateToInput = this.widget.querySelector('#date-to');

		dateFromInput.addEventListener('change', e => {
			if (e.target.value) {
				const date = new Date(e.target.value);
				date.setHours(0, 0, 0, 0); // Устанавливаем начало дня
				this.rangeStart = date;
				this.updateAttendanceStats();
			}
		});

		dateToInput.addEventListener('change', e => {
			if (e.target.value) {
				const date = new Date(e.target.value);
				date.setHours(23, 59, 59, 999); // Устанавливаем конец дня
				this.rangeEnd = date;
				this.updateAttendanceStats();
			}
		});
	}

	/**
	 * Обновление статистики
	 */
	updateAttendanceStats() {
		if (!this.isProgressPage()) {
			removeWidget();
			return;
		}
		if (!this.widget) this.widget = createWidget();

		this.syncDateInputs();

		const dateFrom = this.rangeStart;
		const dateTo = this.rangeEnd ? new Date(this.rangeEnd) : null;
		if (dateTo) dateTo.setHours(23, 59, 59, 999);

		// Берём все уроки с любыми статусами
		let lessons = Array.from(
			document.querySelectorAll('.lessons, .lessons.lateness, .lessons.pass')
		);

		// Фильтруем по диапазону (включаем start и end)
		const filteredLessons = lessons.filter(lesson => {
			const dateText = lesson.querySelector('.date')?.textContent.trim();
			if (!dateText) return false;
			const [d, m, y] = dateText.split('.').map(Number);
			const ld = new Date(y, m - 1, d);
			ld.setHours(12, 0, 0, 0); // Устанавливаем середину дня для точного сравнения

			// Правильное сравнение дат с учетом времени
			const afterStart = !dateFrom || ld >= dateFrom;
			const beforeEnd = !dateTo || ld <= dateTo;

			return afterStart && beforeEnd;
		});

		const total = filteredLessons.length;
		const lateness = filteredLessons.filter(l =>
			l.classList.contains('lateness')
		).length;
		const absent = filteredLessons.filter(l =>
			l.classList.contains('pass')
		).length;
		const present =
			Math.max(0, filteredLessons.filter(l => !l.classList.contains('pass')).length - lateness);
		const perc = total > 0 ? ((present / total) * 100).toFixed(1) : 0;

		this.widget.querySelector('#stats-content').innerHTML = `
		Всего занятий: ${total}<br>
		<span class="present">Присутствия: ${present}</span><br>
		<span class="lateness">Опоздания: ${lateness}</span><br>
		<span class="absent">Пропуски: ${absent}</span><br>
		Посещаемость: <b>${perc}%</b>
		<div class="progress-bar"><div class="progress-bar-inner" style="width:${perc}%;"></div></div>
	`;
		console.log('Selected date range:', dateFrom, dateTo);

		this.highlightRange();
	}

	/**
	 * Синхронизация полей ввода с текущим диапазоном
	 */
	syncDateInputs() {
		const dateFromInput = this.widget.querySelector('#date-from');
		const dateToInput = this.widget.querySelector('#date-to');

		if (this.rangeStart) {
			const fromDate = new Date(this.rangeStart);
			dateFromInput.value = fromDate.toISOString().split('T')[0];
		}

		if (this.rangeEnd) {
			const toDate = new Date(this.rangeEnd);
			dateToInput.value = toDate.toISOString().split('T')[0];
		}
	}

	/**
	 * Установка контролов для выбора диапазона
	 */
	setupRangeSelection() {
		document.body.addEventListener('click', e => {
			const lesson = e.target.closest(
				'.lessons, .lessons.lateness, .lessons.pass'
			);
			if (!lesson) return;

			const dateEl = lesson.querySelector('.date');
			if (!dateEl) return;
			const [day, month, year] = dateEl.textContent
				.trim()
				.split('.')
				.map(Number);
			const lessonDate = new Date(year, month - 1, day);
			lessonDate.setHours(12, 0, 0, 0); // Устанавливаем середину дня

			if (e.shiftKey) {
				if (!this.rangeStart) {
					this.rangeStart = lessonDate;
				} else {
					this.rangeEnd = lessonDate;
				}
			} else {
				this.rangeStart = lessonDate;
				this.rangeEnd = lessonDate;
			}

			// Переставляем если rangeStart > rangeEnd
			if (this.rangeStart && this.rangeEnd && this.rangeStart > this.rangeEnd) {
				[this.rangeStart, this.rangeEnd] = [this.rangeEnd, this.rangeStart];
			}

			// Синхронизируем поля ввода после изменения диапазона
			this.syncDateInputs();
			this.updateAttendanceStats();
		});
	}

	/**
	 * Подсветка выбранного диапазона
	 */
	highlightRange() {
		this.clearHighlights();
		if (!(this.rangeStart && this.rangeEnd)) return;

		const lessons = Array.from(
			document.querySelectorAll('.lessons, .lessons.lateness, .lessons.pass')
		)
			.map(lesson => {
				const dateEl = lesson.querySelector('.date');
				if (!dateEl) return null;
				const [d, m, y] = dateEl.textContent.trim().split('.').map(Number);
				const dt = new Date(y, m - 1, d);
				dt.setHours(12, 0, 0, 0); // Устанавливаем середину дня
				return { lesson, dt };
			})
			.filter(
				item => item && item.dt >= this.rangeStart && item.dt <= this.rangeEnd
			);

		lessons.forEach(({ lesson }) => {
			// удаляем старые метки
			lesson.style.boxShadow = '';
			lesson.style.border = '';
			lesson.style.position = lesson.style.position || 'relative';

			// добавляем зелёную рамку
			lesson.style.boxSizing = 'border-box';
			lesson.style.border = '2px solid green';
		});
	}

	/**
	 * Очистка старых меток
	 */
	clearHighlights() {
		document
			.querySelectorAll('.lessons, .lessons.lateness, .lessons.pass')
			.forEach(lesson => {
				lesson.style.border = '';
			});
	}

	/**
	 * Установка наблюдателя за изменением структуры документа
	 */
	setupNavigationObserver() {
		let lastUrl = window.location.href;
		new MutationObserver(() => {
			const currentUrl = window.location.href;
			if (currentUrl !== lastUrl) {
				lastUrl = currentUrl;
				if (this.isProgressPage()) this.initAttendanceStats();
				else removeWidget();
			}
		}).observe(document.body, { childList: true, subtree: true });

		// Обновление при popstate (назад/вперёд)
		window.addEventListener('popstate', () => {
			if (this.isProgressPage()) this.initAttendanceStats();
			else removeWidget();
		});
	}

	/**
	 * Очистка при закрытии скрипта
	 */
	cleanup() {
		removeWidget();
	}
}
