import { createWidget, removeWidget } from '../utils/dom.js';

export class AttendanceModule {
	constructor({ eventBus, config }) {
		this.eventBus = eventBus;
		this.config = config;
		this.widget = null;
		this.isCollapsed = false;
		this.rangeStart = null;
		this.rangeEnd = null;
		// Don't debounce updateAttendanceStats to avoid race conditions with SPA navigation
		this.navigationObserver = null;
		this.lastUrl = window.location.href;
		this.navigationCheckTimeout = null;
		// Override values for manual editing
		this.overridePresent = null;
		this.overrideLateness = null;
		this.overrideAbsent = null;
	}

	init() {
		console.log('[AttendanceModule] Initializing...');
		this.setupEventListeners();
		this.applyConfigImmediately();
		const isProgress = this.isProgressPage();
		console.log('[AttendanceModule] Is progress page:', isProgress);
		if (isProgress) {
			console.log('[AttendanceModule] Calling initAttendanceStats...');
			this.initAttendanceStats();
		}
		this.setupNavigationObserver();
		console.log('[AttendanceModule] Initialization complete');
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
			if (this.widget && document.getElementById('attendance-stats-widget')) {
				removeWidget();
				this.widget = null;
			}
		}
	}

	onPageChanged() {
		console.log('[AttendanceModule] onPageChanged called');
		if (this.isProgressPage()) {
			console.log('[AttendanceModule] Page changed to progress page, initializing stats');
			this.initAttendanceStats();
		} else {
			console.log('[AttendanceModule] Page changed to non-progress page');
			if (this.widget && document.getElementById('attendance-stats-widget')) {
				console.log('[AttendanceModule] Removing widget due to page change');
				removeWidget();
				this.widget = null;
			}
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
		const currentUrl = window.location.href;
		console.log('[AttendanceModule] Checking URL:', currentUrl);
		console.log('[AttendanceModule] Regex pattern:', this.config.PROGRESS_PAGE_REGEX);

		// Защита от неправильного типа
		if (typeof this.config.PROGRESS_PAGE_REGEX === 'string') {
			try {
				const result = new RegExp(this.config.PROGRESS_PAGE_REGEX).test(currentUrl);
				console.log('[AttendanceModule] isProgressPage result:', result);
				return result;
			} catch (error) {
				console.error('Invalid regex pattern:', error);
				return false;
			}
		}

		if (this.config.PROGRESS_PAGE_REGEX instanceof RegExp) {
			const result = this.config.PROGRESS_PAGE_REGEX.test(currentUrl);
			console.log('[AttendanceModule] isProgressPage result:', result);
			return result;
		}

		// Fallback
		const result = /https:\/\/journal\.top-academy\.ru\/.*\/main\/progress\/.*/.test(currentUrl);
		console.log('[AttendanceModule] isProgressPage result (fallback):', result);
		return result;
	}

	initAttendanceStats() {
		console.log('[AttendanceModule] initAttendanceStats called');

		// Check if widget exists in DOM, not just in memory
		const widgetInDom = document.getElementById('attendance-stats-widget');

		if (!widgetInDom) {
			console.log('[AttendanceModule] Widget not in DOM, creating...');
			this.widget = createWidget();
			console.log('[AttendanceModule] Widget created:', this.widget);
			this.setDefaultDateRange();
			this.setupWidgetControls();
			this.setupRangeSelection();
			this.setupDateInputListeners();
		} else {
			console.log('[AttendanceModule] Widget already exists in DOM');
			this.widget = widgetInDom; // Update reference
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
			// Clear override values
			this.overridePresent = null;
			this.overrideLateness = null;
			this.overrideAbsent = null;
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

	setupStatsInputListeners() {
		if (!this.widget) return;

		const presentInput = this.widget.querySelector('#override-present');
		const latenessInput = this.widget.querySelector('#override-lateness');
		const absentInput = this.widget.querySelector('#override-absent');

		if (!presentInput || !latenessInput || !absentInput) return;

		const handleStatsChange = () => {
			// Store override values
			const presentValue = parseInt(presentInput.value, 10);
			const latenessValue = parseInt(latenessInput.value, 10);
			const absentValue = parseInt(absentInput.value, 10);

			this.overridePresent = isNaN(presentValue) ? null : presentValue;
			this.overrideLateness = isNaN(latenessValue) ? null : latenessValue;
			this.overrideAbsent = isNaN(absentValue) ? null : absentValue;

			// Recalculate and update display
			this.updateStatsDisplay();
		};

		presentInput.addEventListener('input', handleStatsChange);
		latenessInput.addEventListener('input', handleStatsChange);
		absentInput.addEventListener('input', handleStatsChange);
	}

	updateStatsDisplay() {
		if (!this.widget) return;

		const stats = this.calculateStats();
		const statsContent = this.widget.querySelector('#stats-content');

		if (statsContent) {
			// Update total lessons
			const totalSpan = this.widget.querySelector('#total-lessons');
			if (totalSpan) {
				totalSpan.textContent = stats.total;
			}

			// Update percentage
			const percentageSpan = this.widget.querySelector('#percentage-value');
			if (percentageSpan) {
				percentageSpan.textContent = `${stats.percentage}%`;
			}

			// Update progress bar
			const progressBar = this.widget.querySelector('.progress-bar-inner');
			if (progressBar) {
				progressBar.style.width = `${stats.percentage}%`;
			}
		}
	}

	updateAttendanceStats() {
		console.log('[AttendanceModule] updateAttendanceStats called');

		// Check if we should show the widget
		const shouldShow = this.isProgressPage();

		if (!shouldShow) {
			console.log('[AttendanceModule] Not on progress page');
			// Only remove if widget exists - don't interfere during navigation
			if (this.widget && document.getElementById('attendance-stats-widget')) {
				console.log('[AttendanceModule] Removing widget');
				removeWidget();
				this.widget = null;
			}
			return;
		}

		// We're on the progress page, create/update widget
		if (!this.widget) {
			console.log('[AttendanceModule] Widget does not exist, creating...');
			this.widget = createWidget();
		}

		const stats = this.calculateStats();
		console.log('[AttendanceModule] Stats calculated:', stats);

		if (this.widget) {
			console.log('[AttendanceModule] Updating widget content');
			this.widget.querySelector('#stats-content').innerHTML = `
                <div style="margin-bottom: 5px;">Всего занятий: <b id="total-lessons">${stats.total}</b></div>
                <div style="display: flex; align-items: center; margin-bottom: 3px;">
                    <span class="present" style="flex: 1;">Присутствия:</span>
                    <input type="number" id="override-present" min="0" value="${stats.present}"
                           style="width: 60px; padding: 2px 5px; border: 1px solid #28a745; border-radius: 3px;">
                </div>
                <div style="display: flex; align-items: center; margin-bottom: 3px;">
                    <span class="lateness" style="flex: 1;">Опоздания:</span>
                    <input type="number" id="override-lateness" min="0" value="${stats.lateness}"
                           style="width: 60px; padding: 2px 5px; border: 1px solid #ffc107; border-radius: 3px;">
                </div>
                <div style="display: flex; align-items: center; margin-bottom: 8px;">
                    <span class="absent" style="flex: 1;">Пропуски:</span>
                    <input type="number" id="override-absent" min="0" value="${stats.absent}"
                           style="width: 60px; padding: 2px 5px; border: 1px solid #dc3545; border-radius: 3px;">
                </div>
                Посещаемость: <b id="percentage-value">${stats.percentage}%</b>
                <div class="progress-bar"><div class="progress-bar-inner" style="width:${stats.percentage}%;"></div></div>
            `;

			// Setup input listeners after creating the inputs
			this.setupStatsInputListeners();
			console.log('[AttendanceModule] Widget content updated');
		}

		this.highlightRange();
	}

	calculateStats() {
		this.normalizeRange(); // Нормализуем перед расчётом
		const dateFrom = this.rangeStart;
		const dateTo = this.rangeEnd;
		if (!dateFrom || !dateTo) {
			return { total: 0, present: 0, lateness: 0, absent: 0, percentage: 0 };
		}

		// If we have override values, use them
		if (
			this.overridePresent !== null ||
			this.overrideLateness !== null ||
			this.overrideAbsent !== null
		) {
			const present = this.overridePresent ?? 0;
			const lateness = this.overrideLateness ?? 0;
			const absent = this.overrideAbsent ?? 0;
			const total = present + lateness + absent;
			const percentage =
				total > 0 ? (((present + lateness) / total) * 100).toFixed(1) : 0;
			return { total, present, lateness, absent, percentage };
		}

		// Otherwise calculate from DOM
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
