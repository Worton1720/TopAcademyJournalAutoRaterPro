// ==UserScript==
// @name      Top Academy Journal Auto Rater Pro
// @version      0.5
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

	const DEFAULT_CONFIG = {
		ZOOM_LEVEL: '80%',
		PROGRESS_PAGE_REGEX: 'https://journal.top-academy.ru/.*/main/progress/.*',
		AUTO_RATE_ENABLED: true,
		AUTO_SUBMIT_ENABLED: true,
	};

	class ConfigManager {
		constructor() {
			this.config = { ...DEFAULT_CONFIG };
		}

		async loadConfig() {
			try {
				const userConfig = await GM_getValue('config', {});
				this.config = { ...DEFAULT_CONFIG, ...userConfig };
				this.normalizeConfig();
			} catch (error) {
				console.warn(
					'Ошибка загрузки конфигурации, используются значения по умолчанию'
				);
				this.config = { ...DEFAULT_CONFIG };
			}
		}

		async saveConfig(newConfig) {
			try {
				this.config = { ...this.config, ...newConfig };
				this.normalizeConfig();
				await GM_setValue('config', this.config);
				return true;
			} catch (error) {
				console.error('Ошибка сохранения конфигурации:', error);
				return false;
			}
		}

		normalizeConfig() {
			// Нормализация regex
			if (typeof this.config.PROGRESS_PAGE_REGEX === 'string') {
				try {
					this.config.PROGRESS_PAGE_REGEX = new RegExp(
						this.config.PROGRESS_PAGE_REGEX
					);
				} catch {
					this.config.PROGRESS_PAGE_REGEX = new RegExp(
						DEFAULT_CONFIG.PROGRESS_PAGE_REGEX
					);
				}
			}
		}

		registerMenuCommands(eventBus) {
			GM_registerMenuCommand('Настройки скрипта', () => {
				eventBus.emit('config:show-ui');
			});
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
		return widget;
	}

	function removeWidget() {
		const existingWidget = document.getElementById('attendance-stats-widget');
		if (existingWidget) {
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

	function debounce(func, wait) {
		let timeout;
		return function (...args) {
			clearTimeout(timeout);
			timeout = setTimeout(() => func.apply(this, args), wait);
		};
	}

	class AttendanceModule {
		constructor({ eventBus, config }) {
			this.eventBus = eventBus;
			this.config = config;
			this.widget = null;
			this.isCollapsed = false;
			this.rangeStart = null;
			this.rangeEnd = null;
			this.updateAttendanceStats = debounce(
				this.updateAttendanceStats.bind(this),
				300
			);
			this.navigationObserver = null;
			this.lastUrl = window.location.href;
			this.navigationCheckTimeout = null;
		}

		init() {
			this.setupEventListeners();
			this.setPageZoom();
			if (this.isProgressPage()) this.initAttendanceStats();
			this.setupNavigationObserver();
		}

		setupEventListeners() {
			this.eventBus.on('config:updated', () => this.onConfigUpdated());
			this.eventBus.on('page:changed', () => this.onPageChanged());
		}

		onConfigUpdated() {
			this.setPageZoom();
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

		setPageZoom() {
			document.documentElement.style.zoom = this.config.ZOOM_LEVEL;
		}

		isProgressPage() {
			return this.config.PROGRESS_PAGE_REGEX.test(window.location.href);
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
			String(now.getMonth() + 1).padStart(2, '0');
			String(now.getDate()).padStart(2, '0');

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

				// Нормализуем диапазон (чтобы start всегда был ≤ end)
				this.normalizeDateRange();
				this.updateAttendanceStats();
			};

			dateFromInput.addEventListener('change', handleDateChange);
			dateToInput.addEventListener('change', handleDateChange);
		}

		// Нормализация диапазона дат
		normalizeDateRange() {
			if (this.rangeStart && this.rangeEnd && this.rangeStart > this.rangeEnd) {
				[this.rangeStart, this.rangeEnd] = [this.rangeEnd, this.rangeStart];
				this.syncDateInputs();
			}
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
			const dateFrom = this.rangeStart;
			const dateTo = this.rangeEnd;

			const lessons = document.querySelectorAll(
				'.lessons, .lessons.lateness, .lessons.pass'
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
				ld.setHours(12, 0, 0, 0);

				const afterStart = !dateFrom || ld >= dateFrom;
				const beforeEnd = !dateTo || ld <= dateTo;

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
				lessonDate.setHours(12, 0, 0, 0);

				if (e.shiftKey) {
					// При Shift+клик устанавливаем конечную дату
					this.rangeEnd = lessonDate;
				} else {
					// При обычном клике устанавливаем начальную дату
					this.rangeStart = lessonDate;
					this.rangeEnd = lessonDate; // Сбрасываем конечную дату
				}

				// Нормализуем диапазон
				this.normalizeDateRange();
				this.updateAttendanceStats();
			});
		}

		highlightRange() {
			this.clearHighlights();
			if (!(this.rangeStart && this.rangeEnd)) return;

			requestAnimationFrame(async () => {
				const lessons = document.querySelectorAll(
					'.lessons, .lessons.lateness, .lessons.pass'
				);

				for (let i = 0; i < lessons.length; i++) {
					const lesson = lessons[i];
					const dateEl = lesson.querySelector('.date');
					if (!dateEl) continue;

					const dateText = dateEl.textContent.trim();
					if (!dateText) continue;

					const [d, m, y] = dateText.split('.').map(Number);
					const dt = new Date(y, m - 1, d);
					dt.setHours(12, 0, 0, 0);

					if (dt >= this.rangeStart && dt <= this.rangeEnd) {
						// Разные стили для граничных дат
						if (
							dt.getTime() === this.rangeStart.getTime() ||
							dt.getTime() === this.rangeEnd.getTime()
						) {
							lesson.style.border = '2px solid #ff6b00'; // Оранжевый для границ
						} else {
							lesson.style.border = '2px solid green'; // Зеленый для внутренних дат
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
						mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0
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
				this.onHomeworkModalOpened(modal)
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
					mutation => mutation.addedNodes.length > 0
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
		 * Заполнение времени выполнения ДЗ
		 */
		async fillTimeSpent() {
			return new Promise(resolve => {
				setTimeout(() => {
					const timeInputs = document.querySelectorAll(
						'.text-homework-time-spent-wrap input'
					);

					if (timeInputs.length >= 2) {
						// Заполняем часы (1-2 часа)
						timeInputs[0].value = Math.floor(Math.random() * 2) + 1;

						// Заполняем минуты (15-45 минут)
						timeInputs[1].value = Math.floor(Math.random() * 31) + 15;

						console.log('⏰ Заполнено время выполнения ДЗ');
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
						}: "${tagText}", видим: ${isVisible}, выбран: ${isSelected}`
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
							'⚠️ Кнопка отправки недоступна, проверьте заполнение полей'
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
				console.log(`❌ Превышено максимальное количество попыток для оценки ДЗ`);
				this.pendingRetries.delete(containerId);
				return;
			}

			console.log(
				`⏳ Перепроверка оценки ДЗ (попытка ${attempt + 1}/${
				this.retryAttempts
			})...`
			);

			this.pendingRetries.set(
				containerId,
				setTimeout(() => {
					this.checkRatingSuccess(container, containerId, attempt);
				}, this.retryDelay)
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

	class UIModule {
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
				// Ждем загрузки DOM
				if (document.readyState === 'loading') {
					await new Promise(resolve =>
						document.addEventListener('DOMContentLoaded', resolve)
					);
				}

				// Загрузка конфигурации
				await this.configManager.loadConfig();

				// Откладываем инициализацию модулей на следующий кадр
				requestAnimationFrame(() => {
					this.initModules();
					this.isInitialized = true;
					this.eventBus.emit('app:initialized');
				});
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
				})
			);

			// Модуль авто-оценки
			this.modules.set(
				'autoRater',
				new AutoRaterModule({
					eventBus: this.eventBus,
					config: this.configManager.config,
				})
			);

			// Модуль UI
			this.modules.set(
				'ui',
				new UIModule({
					eventBus: this.eventBus,
					configManager: this.configManager,
				})
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
