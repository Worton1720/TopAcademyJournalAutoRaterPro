// ==UserScript==
// @name      Top Academy Journal Auto Rater Pro
// @version      0.6.1
// @description      Автоматизация процессов journal
// @author      Rodion
// @match      https://journal.top-academy.ru/*
// @grant      GM_getValue
// @grant      GM_setValue
// @grant      GM_registerMenuCommand
// @grant      GM_addStyle
// @run-at      document-end
// ==/UserScript==

(function () {
	'use strict';

	const BROKEN_KEY_NAME = 'd86c828583c5c6160e8acfee88ba1590';

	// Проверяем, существует ли проблемный ключ
	if (localStorage.getItem(BROKEN_KEY_NAME) !== null) {
		console.log(
			`TAMPERMONKEY: Обнаружен и удален неисправный ключ: ${BROKEN_KEY_NAME}`
		);

		// Удаляем только этот один ключ
		localStorage.removeItem(BROKEN_KEY_NAME);
	}

	const DEFAULT_CONFIG = {
		ZOOM_LEVEL: '80%',
		PROGRESS_PAGE_REGEX: 'https://journal.top-academy.ru/.*/main/progress/.*',
		AUTO_RATE_ENABLED: true,
		AUTO_SUBMIT_ENABLED: true,
	};

	class ConfigManager {
		constructor() {
			this.config = { ...DEFAULT_CONFIG };
			this.listeners = new Set();
		}

		async loadConfig() {
			try {
				const userConfig = await GM_getValue('config', {});

				// Обеспечиваем корректный формат ZOOM_LEVEL
				let zoomLevel = userConfig.ZOOM_LEVEL || DEFAULT_CONFIG.ZOOM_LEVEL;
				if (typeof zoomLevel === 'number') {
					zoomLevel = `${zoomLevel}%`;
				} else if (typeof zoomLevel === 'string' && !zoomLevel.includes('%')) {
					zoomLevel = `${zoomLevel}%`;
				}

				this.config = {
					...DEFAULT_CONFIG,
					...userConfig,
					ZOOM_LEVEL: zoomLevel,
				};
				this.notifyListeners();
			} catch (error) {
				console.warn(
					'Ошибка загрузки конфигурации, используются значения по умолчанию.\nWarning: ' +
						error,
				);
				this.config = { ...DEFAULT_CONFIG };
				this.notifyListeners();
			}
		}

		async saveConfig(newConfig) {
			try {
				// Обеспечиваем корректный формат ZOOM_LEVEL
				let zoomLevel = newConfig.ZOOM_LEVEL || this.config.ZOOM_LEVEL;
				if (typeof zoomLevel === 'number') {
					zoomLevel = `${zoomLevel}%`;
				} else if (typeof zoomLevel === 'string' && !zoomLevel.includes('%')) {
					zoomLevel = `${zoomLevel}%`;
				}

				this.config = {
					...this.config,
					...newConfig,
					ZOOM_LEVEL: zoomLevel,
				};

				// Сохраняем как строку, чтобы избежать проблем с сериализацией RegExp
				const configToSave = { ...this.config };
				if (configToSave.PROGRESS_PAGE_REGEX instanceof RegExp) {
					configToSave.PROGRESS_PAGE_REGEX =
						configToSave.PROGRESS_PAGE_REGEX.toString();
				}

				await GM_setValue('config', configToSave);
				this.notifyListeners();
				return true;
			} catch (error) {
				console.error('Ошибка сохранения конфигурации:', error);
				return false;
			}
		}

		// Добавляем слушателей изменений конфигурации
		addChangeListener(listener) {
			this.listeners.add(listener);
			return () => this.listeners.delete(listener);
		}

		removeChangeListener(listener) {
			this.listeners.delete(listener);
		}

		notifyListeners() {
			this.listeners.forEach(listener => {
				try {
					listener(this.config);
				} catch (error) {
					console.error('Ошибка в слушателе конфигурации:', error);
				}
			});
		}

		registerMenuCommands(eventBus) {
			try {
				GM_registerMenuCommand('Настройки скрипта', () => {
					eventBus.emit('config:show-ui');
				});
				console.log('Меню-команда "Настройки скрипта" зарегистрирована');
			} catch (error) {
				console.error('Ошибка регистрации меню-команды:', error);
			}
		}
	}

	class EventBus {
		constructor() {
			this.events = new Map();
		}

		on(event, callback) {
			if (!this.events.has(event)) {
				this.events.set(event, new Set());
			}
			this.events.get(event).add(callback);
			return () => this.off(event, callback);
		}

		off(event, callback) {
			if (this.events.has(event)) {
				this.events.get(event).delete(callback);
			}
		}

		emit(event, data) {
			if (this.events.has(event)) {
				this.events.get(event).forEach(callback => {
					try {
						callback(data);
					} catch (error) {
						console.error(`Ошибка в обработчике события ${event}:`, error);
					}
				});
			}
		}

		cleanup() {
			this.events.clear();
		}
	}

	function createWidget() {
		console.log('[DOM] createWidget called');
		// Удаляем существующий виджет, если есть
		removeWidget();

		const widget = document.createElement('div');
		widget.id = 'attendance-stats-widget';
		widget.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        border: 2px solid #007bff;
        border-radius: 8px;
        padding: 15px;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        min-width: 280px;
        font-family: Arial, sans-serif;
        transition: all 0.3s ease;
    `;
		console.log('[DOM] Widget element created, appending to body...');

		widget.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h3 style="margin: 0; font-size: 16px; color: #007bff;">Статистика посещаемости</h3>
            <button id="toggle-stats" style="background: none; border: none; font-size: 16px; cursor: pointer;">⯆</button>
        </div>
        
        <div id="stats-content" style="margin-bottom: 15px;">
            Загрузка статистики...
        </div>
        
        <div style="margin-bottom: 10px;">
            <label style="display: block; margin-bottom: 5px; font-weight: bold;">Период:</label>
            <div style="display: flex; align-items: center; gap: 5px; margin-bottom: 10px;">
                <input type="date" id="date-from" style="flex: 1; padding: 5px; box-sizing: border-box;">
                <span style="font-weight: bold;">—</span>
                <input type="date" id="date-to" style="flex: 1; padding: 5px; box-sizing: border-box;">
            </div>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <button id="reset-stats" style="padding: 8px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">Сброс</button>
            <button id="refresh-stats" style="padding: 8px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Обновить</button>
        </div>
        
        <style>
            .progress-bar {
                width: 100%;
                height: 8px;
                background: #e9ecef;
                border-radius: 4px;
                margin-top: 5px;
                overflow: hidden;
            }
            
            .progress-bar-inner {
                height: 100%;
                background: #28a745;
                transition: width 0.3s ease;
            }
            
            .present { color: #28a745; }
            .lateness { color: #ffc107; }
            .absent { color: #dc3545; }
            
            #attendance-stats-widget.collapsed {
                height: 40px;
                overflow: hidden;
                min-width: auto;
                width: 200px;
            }
            
            #attendance-stats-widget.collapsed > *:not(:first-child) {
                display: none;
            }
        </style>
    `;

		document.body.appendChild(widget);
		console.log('[DOM] Widget appended to body, id:', widget.id);
		return widget;
	}

	function removeWidget() {
		const existingWidget = document.getElementById('attendance-stats-widget');
		if (existingWidget) {
			console.log('[DOM] Removing widget');
			console.trace('[DOM] Widget removal trace');
			existingWidget.remove();
		}
	}

	function isElementVisible(element) {
		if (!element) return false;

		const style = window.getComputedStyle(element);
		return (
			element.offsetWidth > 0 &&
			element.offsetHeight > 0 &&
			style.visibility !== 'hidden' &&
			style.display !== 'none' &&
			style.opacity !== '0'
		);
	}

	function isElementClickable(element) {
		if (!element) return false;

		const style = window.getComputedStyle(element);
		return (
			style.pointerEvents !== 'none' &&
			style.cursor === 'pointer' &&
			!element.hasAttribute('disabled')
		);
	}

	class AttendanceModule {
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

	class AutoRaterModule {
		constructor({ eventBus, config }) {
			this.eventBus = eventBus;
			this.config = config;
			this.observer = null;
			this.isProcessing = false;
			this.processedModals = new Set();
			this.pendingRetries = new Map();

			// Конфигурация модуля
			this.ratingSelector = '.bs-rating-star';
			this.activeClass = 'active';
			this.maxRating = 5;
			this.retryAttempts = 3;
			this.retryDelay = 1000;
			this.homeworkModalSelector = 'hw-upload-homework';
			this.modalCheckTimeout = null;
		}

		init() {
			if (!this.config.AUTO_RATE_ENABLED) return;

			this.setupEventListeners();
			this.setupMutationObserver();
		}

		setupEventListeners() {
			this.eventBus.on('config:updated', () => this.onConfigUpdated());
			this.eventBus.on('homework:modal-opened', modal =>
				this.onHomeworkModalOpened(modal),
			);
		}

		onConfigUpdated() {
			if (!this.config.AUTO_RATE_ENABLED) {
				this.cleanup();
			} else {
				this.setupMutationObserver();
			}
		}

		onHomeworkModalOpened(modal) {
			if (this.config.AUTO_RATE_ENABLED && !this.isProcessing) {
				this.processHomeworkModal(modal);
			}
		}

		setupMutationObserver() {
			this.cleanupObserver();

			this.observer = new MutationObserver(mutations => {
				// Быстрая проверка - только если добавлены узлы
				const hasAddedNodes = mutations.some(
					mutation => mutation.addedNodes.length > 0,
				);

				if (hasAddedNodes) {
					// Дебаунсим вызов для избежания множественных проверок
					clearTimeout(this.modalCheckTimeout);
					this.modalCheckTimeout = setTimeout(() => {
						this.detectHomeworkModal();
					}, 500);
				}
			});

			// Ограничиваем область наблюдения
			this.observer.observe(document.body, {
				childList: true,
				subtree: false, // Убрали глубокое наблюдение
			});
		}

		detectHomeworkModal() {
			const modal = document.querySelector(this.homeworkModalSelector);
			if (modal && !this.processedModals.has(modal)) {
				this.eventBus.emit('homework:modal-opened', modal);
			}
		}

		async processHomeworkModal(modal) {
			this.isProcessing = true;
			this.processedModals.add(modal);

			try {
				// Ждем полной загрузки модального окна
				await this.delay(1000);

				await this.fillTimeSpent();
				await this.rateMaximum();
				await this.selectPositiveTags();

				if (this.config.AUTO_SUBMIT_ENABLED) {
					// await this.submitHomework();
				}
			} catch (error) {
				console.error('Ошибка обработки домашнего задания:', error);
			} finally {
				this.isProcessing = false;
			}
		}

		/**
		 * Установка значения в input с эмуляцией событий для фреймворков (React/Vue)
		 */
		setInputValue(input, value) {
			// Получаем нативный setter для обхода React/Vue
			const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
				window.HTMLInputElement.prototype,
				'value',
			).set;

			// Устанавливаем значение через нативный setter
			nativeInputValueSetter.call(input, value);

			// Эмулируем события для фреймворков
			const events = [
				new Event('input', { bubbles: true }),
				new Event('change', { bubbles: true }),
				new Event('blur', { bubbles: true }),
			];

			events.forEach(event => input.dispatchEvent(event));
		}

		/**
		 * Заполнение времени выполнения ДЗ
		 */
		async fillTimeSpent() {
			return new Promise(resolve => {
				setTimeout(() => {
					const timeInputs = document.querySelectorAll(
						'.text-homework-time-spent-wrap input',
					);

					if (timeInputs.length >= 2) {
						// Заполняем часы (1-2 часа)
						const hours = Math.floor(Math.random() * 2) + 1;
						this.setInputValue(timeInputs[0], hours);

						// Заполняем минуты (15-45 минут)
						const minutes = Math.floor(Math.random() * 31) + 15;
						this.setInputValue(timeInputs[1], minutes);

						console.log(`⏰ Заполнено время выполнения ДЗ: ${hours}ч ${minutes}мин`);
					}
					resolve();
				}, 500);
			});
		}

		/**
		 * Выставление максимальной оценки (5 звёзд)
		 */
		async rateMaximum() {
			return new Promise(resolve => {
				setTimeout(() => {
					const ratingContainers = document.querySelectorAll('.emoji-evaluation');

					ratingContainers.forEach(container => {
						const containerId = this.generateContainerId(container);

						if (this.pendingRetries.has(containerId)) {
							return;
						}

						const stars = container.querySelectorAll(this.ratingSelector);

						if (stars.length === this.maxRating) {
							const lastStar = stars[this.maxRating - 1];

							if (!lastStar.classList.contains(this.activeClass)) {
								console.log('⭐ Кликаем на 5-ю звезду для оценки ДЗ');
								const clickSuccess = this.clickStar(lastStar);

								if (clickSuccess) {
									this.startRetryCycle(container, containerId, 0);
								}
							} else {
								console.log('✅ Оценка ДЗ уже выставлена на максимум');
							}
						}
					});
					resolve();
				}, 300);
			});
		}

		/**
		 * Выбор позитивных тегов для оценки
		 */
		async selectPositiveTags() {
			return new Promise(resolve => {
				setTimeout(() => {
					console.log('🔍 Ищем доступные теги...');
					const tagElements = document.querySelectorAll('.evaluation-tags-item');
					let selectedCount = 0;

					// Выводим все найденные теги для отладки
					tagElements.forEach((tagElement, index) => {
						const tagText = tagElement.querySelector('span')?.textContent;
						const isVisible = isElementVisible(tagElement);
						const isSelected = tagElement.classList.contains('selected');
						console.log(
							`Тег ${
							index + 1
						}: "${tagText}", видим: ${isVisible}, выбран: ${isSelected}`,
						);
					});

					const positiveTags = ['Все круто!', 'Все понятно!', 'Мне нравится'];

					tagElements.forEach(tagElement => {
						if (!isElementVisible(tagElement) || selectedCount >= 2) return;

						const tagText = tagElement.querySelector('span')?.textContent;
						console.log(`Проверяем тег: "${tagText}"`);

						if (tagText && positiveTags.includes(tagText)) {
							if (!tagElement.classList.contains('selected')) {
								try {
									tagElement.click();
									console.log(`✅ Выбран тег: "${tagText}"`);
									selectedCount++;
								} catch (error) {
									console.error('Ошибка при выборе тега:', error);
								}
							}
						}
					});

					if (selectedCount === 0) {
						console.log('⚠️ Не найдено подходящих тегов для выбора');
					}
					resolve();
				}, 800);
			});
		}

		/**
		 * Отправка домашнего задания
		 */
		async submitHomework() {
			return new Promise(resolve => {
				setTimeout(() => {
					const submitButton = document.querySelector('.btn-accept');
					if (submitButton && !submitButton.disabled) {
						console.log('📤 Отправляем домашнее задание');
						submitButton.click();
					} else if (submitButton && submitButton.disabled) {
						console.log(
							'⚠️ Кнопка отправки недоступна, проверьте заполнение полей',
						);
					}
					resolve();
				}, 1500);
			});
		}

		/**
		 * Запуск цикла перепроверки успешности оценки
		 */
		startRetryCycle(container, containerId, attempt) {
			if (attempt >= this.retryAttempts) {
				console.log('❌ Превышено максимальное количество попыток для оценки ДЗ');
				this.pendingRetries.delete(containerId);
				return;
			}

			console.log(
				`⏳ Перепроверка оценки ДЗ (попытка ${attempt + 1}/${
				this.retryAttempts
			})...`,
			);

			this.pendingRetries.set(
				containerId,
				setTimeout(() => {
					this.checkRatingSuccess(container, containerId, attempt);
				}, this.retryDelay),
			);
		}

		/**
		 * Проверка успешности выставления оценки
		 */
		checkRatingSuccess(container, containerId, attempt) {
			const stars = container.querySelectorAll(this.ratingSelector);

			if (stars.length === 0) {
				console.log('❌ Элементы оценки исчезли');
				this.pendingRetries.delete(containerId);
				return;
			}

			const lastStar = stars[this.maxRating - 1];

			if (lastStar.classList.contains(this.activeClass)) {
				console.log('✅ Оценка ДЗ успешно выставлена!');
				this.pendingRetries.delete(containerId);
			} else {
				console.log('❌ Оценка ДЗ не прошла, пробуем снова...');

				const clickSuccess = this.clickStar(lastStar);

				if (clickSuccess) {
					this.startRetryCycle(container, containerId, attempt + 1);
				} else {
					console.log('❌ Не удалось кликнуть на звезду');
					this.pendingRetries.delete(containerId);
				}
			}
		}

		/**
		 * Клик по звезде
		 */
		clickStar(starElement) {
			if (isElementVisible(starElement) && isElementClickable(starElement)) {
				try {
					const button = starElement.querySelector('button.rating-star');
					if (button) {
						button.click();
						return true;
					} else {
						starElement.click();
						return true;
					}
				} catch (error) {
					console.error('Ошибка при клике на звезду:', error);
					return false;
				}
			}
			return false;
		}

		/**
		 * Генерация уникального ID для контейнера оценки
		 */
		generateContainerId(container) {
			return Array.from(container.parentNode.children).indexOf(container);
		}

		/**
		 * Вспомогательная функция задержки
		 */
		delay(ms) {
			return new Promise(resolve => setTimeout(resolve, ms));
		}

		cleanup() {
			this.cleanupObserver();
			this.processedModals.clear();

			this.pendingRetries.forEach((timeoutId, containerId) => {
				clearTimeout(timeoutId);
				this.pendingRetries.delete(containerId);
			});

			clearTimeout(this.modalCheckTimeout);
		}

		cleanupObserver() {
			if (this.observer) {
				this.observer.disconnect();
				this.observer = null;
			}
		}
	}

	class ConfigUI {
		constructor(currentConfig, onSave) {
			this.currentConfig = { ...currentConfig };
			this.onSave = onSave;
			this.modal = null;
		}

		show() {
			if (this.modal) {
				this.modal.style.display = 'block';
				return;
			}

			this.createModal();
		}

		createModal() {
			// Создание модального окна
			this.modal = document.createElement('div');
			this.modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 10000;
            min-width: 400px;
            font-family: Arial, sans-serif;
        `;

			// Заголовок
			const title = document.createElement('h3');
			title.textContent = 'Настройки скрипта';
			title.style.marginTop = '0';

			// Форма настроек
			const form = document.createElement('div');

			// Настройка масштаба
			const zoomLabel = document.createElement('label');
			zoomLabel.textContent = 'Масштаб страницы (%):';
			zoomLabel.style.display = 'block';
			zoomLabel.style.marginBottom = '5px';

			const zoomInput = document.createElement('input');
			zoomInput.type = 'number';
			zoomInput.min = '10';
			zoomInput.max = '200';
			zoomInput.step = '5';
			zoomInput.value = this.parseZoomValue(this.currentConfig.ZOOM_LEVEL);
			zoomInput.style.width = '100%';
			zoomInput.style.padding = '8px';
			zoomInput.style.marginBottom = '15px';
			zoomInput.style.boxSizing = 'border-box';

			// Авто-оценка
			const autoRateLabel = document.createElement('label');
			autoRateLabel.style.display = 'flex';
			autoRateLabel.style.alignItems = 'center';
			autoRateLabel.style.marginBottom = '15px';

			const autoRateCheckbox = document.createElement('input');
			autoRateCheckbox.type = 'checkbox';
			autoRateCheckbox.checked = this.currentConfig.AUTO_RATE_ENABLED;
			autoRateCheckbox.style.marginRight = '10px';

			const autoRateText = document.createElement('span');
			autoRateText.textContent = 'Включить авто-оценку домашних заданий';

			autoRateLabel.appendChild(autoRateCheckbox);
			autoRateLabel.appendChild(autoRateText);

			// Кнопки
			const buttonsContainer = document.createElement('div');
			buttonsContainer.style.display = 'flex';
			buttonsContainer.style.justifyContent = 'space-between';
			buttonsContainer.style.marginTop = '20px';

			const saveButton = document.createElement('button');
			saveButton.textContent = 'Сохранить';
			saveButton.style.padding = '10px 20px';
			saveButton.style.background = '#007bff';
			saveButton.style.color = 'white';
			saveButton.style.border = 'none';
			saveButton.style.borderRadius = '4px';
			saveButton.style.cursor = 'pointer';

			const cancelButton = document.createElement('button');
			cancelButton.textContent = 'Отмена';
			cancelButton.style.padding = '10px 20px';
			cancelButton.style.background = '#6c757d';
			cancelButton.style.color = 'white';
			cancelButton.style.border = 'none';
			cancelButton.style.borderRadius = '4px';
			cancelButton.style.cursor = 'pointer';

			buttonsContainer.appendChild(saveButton);
			buttonsContainer.appendChild(cancelButton);

			// Сборка формы
			form.appendChild(zoomLabel);
			form.appendChild(zoomInput);
			form.appendChild(autoRateLabel);
			form.appendChild(buttonsContainer);

			this.modal.appendChild(title);
			this.modal.appendChild(form);

			// Затемнение фона
			const overlay = document.createElement('div');
			overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 9999;
        `;

			// Обработчики событий
			const closeModal = () => {
				document.body.removeChild(overlay);
				document.body.removeChild(this.modal);
				this.modal = null;
			};

			overlay.addEventListener('click', closeModal);
			cancelButton.addEventListener('click', closeModal);

			saveButton.addEventListener('click', () => {
				const zoomValue = zoomInput.value;
				if (zoomValue < 10 || zoomValue > 200) {
					alert('Масштаб должен быть от 10 до 200%');
					return;
				}

				const newConfig = {
					ZOOM_LEVEL: `${zoomValue}%`,
					AUTO_RATE_ENABLED: autoRateCheckbox.checked,
				};

				this.onSave(newConfig);
				closeModal();
			});

			// Добавление в DOM
			document.body.appendChild(overlay);
			document.body.appendChild(this.modal);
		}

		// Метод для извлечения числового значения из строки с процентами
		parseZoomValue(zoomString) {
			if (typeof zoomString === 'string') {
				const numericValue = parseInt(zoomString.replace('%', ''), 10);
				return isNaN(numericValue) ? 80 : numericValue;
			}
			return 80; // Значение по умолчанию
		}

		hide() {
			if (this.modal) {
				this.modal.style.display = 'none';
			}
		}
	}

	class UIModule {
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

	class App {
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

	(async () => {
		const app = new App();
		await app.init();

		// Очистка при закрытии страницы
		window.addEventListener('unload', () => app.cleanup());
	})();

})();
