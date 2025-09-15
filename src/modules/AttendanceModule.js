import { createWidget, removeWidget } from '../utils/dom.js';
import { debounce } from '../utils/helpers.js';

export class AttendanceModule {
	constructor({ eventBus, config }) {
		this.eventBus = eventBus;
		this.config = config;
		this.widget = null;
		this.isCollapsed = false;
		this.rangeStart = null;
		this.rangeEnd = null;
		this.updateAttendanceStats = debounce(
			this.updateAttendanceStats.bind(this),
			300,
		);
		this.navigationObserver = null;
		this.lastUrl = window.location.href;
		this.navigationCheckTimeout = null;
	}

	init() {
		this.setupEventListeners();
		this.applyConfigImmediately();
		if (this.isProgressPage()) this.initAttendanceStats();
		this.setupNavigationObserver();
	}

	setupEventListeners() {
		this.eventBus.on('config:updated', () => this.onConfigUpdated());
		this.eventBus.on('page:changed', () => this.onPageChanged());
	}

	onConfigUpdated() {
		this.applyConfigImmediately();
		if (this.isProgressPage()) {
			this.updateAttendanceStats();
		} else {
			removeWidget();
		}
	}

	onPageChanged() {
		if (this.isProgressPage()) {
			this.initAttendanceStats();
		} else {
			removeWidget();
		}
	}

	// Новый метод для немедленного применения конфигурации
	applyConfigImmediately() {
		this.setPageZoom();
	}

	setPageZoom() {
		// Убеждаемся, что значение имеет правильный формат
		let zoomValue = this.config.ZOOM_LEVEL;
		if (typeof zoomValue === 'number') {
			zoomValue = `${zoomValue}%`;
		} else if (typeof zoomValue === 'string' && !zoomValue.includes('%')) {
			zoomValue = `${zoomValue}%`;
		}

		document.documentElement.style.zoom = zoomValue;
	}

	isProgressPage() {
		// Защита от неправильного типа
		if (typeof this.config.PROGRESS_PAGE_REGEX === 'string') {
			try {
				return new RegExp(this.config.PROGRESS_PAGE_REGEX).test(
					window.location.href,
				);
			} catch (error) {
				console.error('Invalid regex pattern:', error);
				return false;
			}
		}

		if (this.config.PROGRESS_PAGE_REGEX instanceof RegExp) {
			return this.config.PROGRESS_PAGE_REGEX.test(window.location.href);
		}

		// Fallback
		return /https:\/\/journal\.top-academy\.ru\/.*\/main\/progress\/.*/.test(
			window.location.href,
		);
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

	setDefaultDateRange() {
		const now = new Date();
		const yyyy = now.getFullYear();

		this.rangeStart = new Date(yyyy, now.getMonth(), 1);
		this.rangeStart.setHours(0, 0, 0, 0);

		this.rangeEnd = new Date(yyyy, now.getMonth(), now.getDate());
		this.rangeEnd.setHours(23, 59, 59, 999);

		this.syncDateInputs();
	}

	setupWidgetControls() {
		if (!this.widget) return;

		const resetBtn = this.widget.querySelector('#reset-stats');
		const refreshBtn = this.widget.querySelector('#refresh-stats');
		const toggleBtn = this.widget.querySelector('#toggle-stats');

		resetBtn.addEventListener('click', () => {
			this.setDefaultDateRange();
			this.clearHighlights();
			this.updateAttendanceStats();
		});

		refreshBtn.addEventListener('click', () => {
			this.updateAttendanceStats();
			this.highlightRange();
		});

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

	setupDateInputListeners() {
		if (!this.widget) return;

		const dateFromInput = this.widget.querySelector('#date-from');
		const dateToInput = this.widget.querySelector('#date-to');

		const handleDateChange = () => {
			const fromValue = dateFromInput.value;
			const toValue = dateToInput.value;

			if (fromValue) {
				const date = new Date(fromValue);
				date.setHours(0, 0, 0, 0);
				this.rangeStart = date;
			} else {
				this.rangeStart = null;
			}

			if (toValue) {
				const date = new Date(toValue);
				date.setHours(23, 59, 59, 999);
				this.rangeEnd = date;
			} else {
				this.rangeEnd = null;
			}

			// Убрали нормализацию - применяем как есть
			this.updateAttendanceStats();
		};

		dateFromInput.addEventListener('change', handleDateChange);
		dateToInput.addEventListener('change', handleDateChange);
	}

	updateAttendanceStats() {
		if (!this.isProgressPage()) {
			removeWidget();
			return;
		}

		requestAnimationFrame(() => {
			if (!this.widget) this.widget = createWidget();

			const stats = this.calculateStats();

			if (this.widget) {
				this.widget.querySelector('#stats-content').innerHTML = `
                Всего занятий: ${stats.total}<br>
                <span class="present">Присутствия: ${stats.present}</span><br>
                <span class="lateness">Опоздания: ${stats.lateness}</span><br>
                <span class="absent">Пропуски: ${stats.absent}</span><br>
                Посещаемость: <b>${stats.percentage}%</b>
                <div class="progress-bar"><div class="progress-bar-inner" style="width:${stats.percentage}%;"></div></div>
            `;
			}

			requestAnimationFrame(() => this.highlightRange());
		});
	}

	calculateStats() {
		this.normalizeRange(); // Нормализуем перед расчётом
		const dateFrom = this.rangeStart;
		const dateTo = this.rangeEnd;
		if (!dateFrom || !dateTo) {
			return { total: 0, present: 0, lateness: 0, absent: 0, percentage: 0 };
		}
		const lessons = document.querySelectorAll(
			'.lessons, .lessons.lateness, .lessons.pass',
		);
		let total = 0,
			lateness = 0,
			absent = 0;
		for (let i = 0; i < lessons.length; i++) {
			const lesson = lessons[i];
			const dateText = lesson.querySelector('.date')?.textContent.trim();
			if (!dateText) continue;
			const [d, m, y] = dateText.split('.').map(Number);
			const ld = new Date(y, m - 1, d);
			ld.setHours(12, 0, 0, 0); // Нормализация времени урока
			const afterStart = ld >= dateFrom;
			const beforeEnd = ld <= dateTo;
			if (afterStart && beforeEnd) {
				total++;
				if (lesson.classList.contains('lateness')) lateness++;
				if (lesson.classList.contains('pass')) absent++;
			}
		}
		const present = total - (absent + lateness);
		const percentage =
			total > 0 ? (((present + lateness) / total) * 100).toFixed(1) : 0;
		return { total, present, lateness, absent, percentage };
	}

	syncDateInputs() {
		if (!this.widget) return;

		const dateFromInput = this.widget.querySelector('#date-from');
		const dateToInput = this.widget.querySelector('#date-to');

		if (this.rangeStart) {
			const fromDate = new Date(this.rangeStart);
			dateFromInput.value = fromDate.toISOString().split('T')[0];
		} else {
			dateFromInput.value = '';
		}

		if (this.rangeEnd) {
			const toDate = new Date(this.rangeEnd);
			dateToInput.value = toDate.toISOString().split('T')[0];
		} else {
			dateToInput.value = '';
		}
	}

	setupRangeSelection() {
		document.body.addEventListener(
			'click',
			e => {
				const lesson = e.target.closest(
					'.lessons, .lessons.lateness, .lessons.pass',
				);
				if (!lesson) return;
				const dateEl = lesson.querySelector('.date');
				if (!dateEl) return;
				const [day, month, year] = dateEl.textContent
					.trim()
					.split('.')
					.map(Number);
				const lessonDate = new Date(year, month - 1, day);
				lessonDate.setHours(12, 0, 0, 0); // Нормализация времени урока
				e.preventDefault(); // Предотвращаем дефолтное поведение сайта
				e.stopPropagation(); // Останавливаем всплытие
				console.log(
					'Клик обнаружен:',
					e.shiftKey ? 'Shift + ЛКМ' : 'ЛКМ',
					lessonDate.toDateString(),
				); // Отладка
				if (e.shiftKey) {
					// Shift + клик: конечная дата
					this.rangeEnd = lessonDate;
					console.log('Установлена rangeEnd:', this.rangeEnd.toDateString());
				} else {
					// Обычный клик: начальная дата, сброс end
					this.rangeStart = lessonDate;
					this.rangeEnd = null;
					console.log(
						'Установлена rangeStart:',
						this.rangeStart.toDateString(),
						'rangeEnd сброшена',
					);
				}
				this.normalizeRange(); // Нормализуем диапазон
				this.syncDateInputs(); // Синхронизируем поля ввода
				this.updateAttendanceStats(); // Обновляем статистику
				this.highlightRange(); // Обновляем выделение
			},
			true,
		); // true для capture phase
	}

	normalizeRange() {
		if (!this.rangeStart) {
			// Если начальная дата не выбрана, сбрасываем всё
			this.rangeStart = null;
			this.rangeEnd = null;
			return;
		}
		if (!this.rangeEnd) {
			// Если конечная дата не выбрана, используем rangeStart (один день)
			this.rangeEnd = new Date(this.rangeStart);
			this.rangeEnd.setHours(23, 59, 59, 999);
		} else if (this.rangeEnd < this.rangeStart) {
			// Если rangeEnd раньше rangeStart, меняем их местами
			const temp = this.rangeStart;
			this.rangeStart = new Date(this.rangeEnd);
			this.rangeStart.setHours(0, 0, 0, 0);
			this.rangeEnd = new Date(temp);
			this.rangeEnd.setHours(23, 59, 59, 999);
		} else {
			// Убедимся, что время нормализовано
			this.rangeStart.setHours(0, 0, 0, 0);
			this.rangeEnd.setHours(23, 59, 59, 999);
		}
	}

	highlightRange() {
		this.clearHighlights();
		this.normalizeRange(); // Нормализуем перед подсветкой
		const dateFrom = this.rangeStart;
		const dateTo = this.rangeEnd;
		if (!dateFrom || !dateTo) return;
		requestAnimationFrame(async () => {
			const lessons = document.querySelectorAll(
				'.lessons, .lessons.lateness, .lessons.pass',
			);
			for (let i = 0; i < lessons.length; i++) {
				const lesson = lessons[i];
				const dateEl = lesson.querySelector('.date');
				if (!dateEl) continue;
				const dateText = dateEl.textContent.trim();
				if (!dateText) continue;
				const [d, m, y] = dateText.split('.').map(Number);
				const dt = new Date(y, m - 1, d);
				dt.setHours(12, 0, 0, 0); // Нормализация
				const isInRange = dt >= dateFrom && dt <= dateTo;
				if (isInRange) {
					if (
						dt.getTime() === dateFrom.getTime() ||
						dt.getTime() === dateTo.getTime()
					) {
						lesson.style.border = '2px solid #ff6b00'; // Оранжевый для границ
					} else {
						lesson.style.border = '2px solid green'; // Зелёный для внутренних
					}
					lesson.style.boxSizing = 'border-box';
					if (i % 10 === 0) {
						await new Promise(resolve => requestAnimationFrame(resolve));
					}
				}
			}
		});
	}

	clearHighlights() {
		document
			.querySelectorAll('.lessons, .lessons.lateness, .lessons.pass')
			.forEach(lesson => {
				lesson.style.border = '';
			});
	}

	setupNavigationObserver() {
		const checkUrlChange = () => {
			const currentUrl = window.location.href;
			if (currentUrl !== this.lastUrl) {
				this.lastUrl = currentUrl;
				this.eventBus.emit('page:changed');
			}
		};

		this.navigationObserver = new MutationObserver(mutations => {
			const hasSignificantChange = mutations.some(
				mutation =>
					mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0,
			);

			if (hasSignificantChange) {
				clearTimeout(this.navigationCheckTimeout);
				this.navigationCheckTimeout = setTimeout(checkUrlChange, 300);
			}
		});

		const limitedObserverTarget = document.body;
		if (limitedObserverTarget) {
			this.navigationObserver.observe(limitedObserverTarget, {
				childList: true,
				subtree: false,
			});
		}

		window.addEventListener('popstate', () => {
			clearTimeout(this.navigationCheckTimeout);
			this.navigationCheckTimeout = setTimeout(checkUrlChange, 100);
		});

		setInterval(checkUrlChange, 2000);
	}

	cleanup() {
		removeWidget();
		this.eventBus.off('config:updated', () => this.onConfigUpdated());
		this.eventBus.off('page:changed', () => this.onPageChanged());

		if (this.navigationObserver) {
			this.navigationObserver.disconnect();
		}

		clearTimeout(this.navigationCheckTimeout);
	}
}
