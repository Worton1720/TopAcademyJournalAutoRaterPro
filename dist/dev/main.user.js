// ==UserScript==
// @name      Top Academy Journal Auto Rater Pro
// @version      0.4
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
	};

	/**
	 * Функция для загрузки конфигурации
	 * @return {Object} конфигурация
	 */
	async function loadConfig() {
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
	async function saveConfig(newConfig) {
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
	function registerConfigMenu(callback) {
		GM_registerMenuCommand('Настройки скрипта', callback);
	}

	class ConfigUI {
		constructor(config, onSaveCallback) {
			this.config = { ...config };
			this.onSaveCallback = onSaveCallback;
			this.modal = null;
			this.overlay = null;

			// Список параметров для редактирования
			this.fields = [
				{
					key: 'ZOOM_LEVEL',
					label: 'Уровень масштаба страницы (например: 80%)',
					type: 'text',
					placeholder: '80%',
					validate: value => value.trim() !== '' || 'Поле не должно быть пустым',
				},
				// Добавлять новые параметры сюда
				// {
				//     key: 'ANOTHER_PARAM',
				//     label: 'Описание параметра',
				//     type: 'text' | 'number' | 'checkbox' | 'select',
				//     placeholder: '...',
				//     validate: value => true | 'Ошибка',
				// },
			];
		}

		show() {
			// Если модал уже открыт — фокусируемся и выходим
			if (document.getElementById('ta-config-modal')) {
				document
					.getElementById('ta-config-modal')
					.querySelector('input,textarea,button')
					.focus();
				return;
			}

			this.createModal();
		}

		createModal() {
			// Overlay
			this.overlay = document.createElement('div');
			this.overlay.id = 'ta-config-modal';
			Object.assign(this.overlay.style, {
				position: 'fixed',
				inset: '0',
				background: 'rgba(0,0,0,0.5)',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				zIndex: 99999,
			});

			// Modal
			this.modal = document.createElement('div');
			Object.assign(this.modal.style, {
				width: '520px',
				maxWidth: '95%',
				background: '#fff',
				borderRadius: '8px',
				padding: '16px',
				boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
				fontFamily: 'Arial, sans-serif',
				color: '#111',
			});

			// Header
			this.modal.innerHTML = `
			<h2 style="margin:0 0 8px 0; font-size:18px;">Настройки скрипта</h2>
			<div style="margin-bottom:10px; color:#555; font-size:13px;">
				Измените настройки и нажмите «Сохранить».
			</div>
		`;

			// Container для полей
			const fieldsContainer = document.createElement('div');
			fieldsContainer.style.marginTop = '8px';
			this.modal.appendChild(fieldsContainer);

			// Создание полей динамически
			this.fields.forEach(field => {
				const label = document.createElement('label');
				label.style.display = 'block';
				label.style.marginTop = '8px';
				label.style.fontWeight = '600';
				label.style.fontSize = '13px';
				label.textContent = field.label;

				const input = document.createElement('input');
				input.type = field.type || 'text';
				input.placeholder = field.placeholder || '';
				input.value = this.config[field.key] || '';
				input.dataset.key = field.key;
				Object.assign(input.style, {
					width: '100%',
					padding: '8px',
					marginTop: '6px',
					boxSizing: 'border-box',
				});

				label.appendChild(input);
				fieldsContainer.appendChild(label);
			});

			// Buttons
			const buttonsDiv = document.createElement('div');
			Object.assign(buttonsDiv.style, {
				marginTop: '12px',
				display: 'flex',
				gap: '8px',
				justifyContent: 'flex-end',
			});
			buttonsDiv.innerHTML = `
			<button id="ta-cfg-defaults" style="padding:6px 10px; cursor:pointer;">Восстановить по умолчанию</button>
			<button id="ta-cfg-cancel" style="padding:6px 10px; cursor:pointer;">Отмена</button>
			<button id="ta-cfg-save" style="padding:6px 12px; background:#2b6cb0; color:#fff; border:none; border-radius:4px; cursor:pointer;">Сохранить</button>
		`;
			this.modal.appendChild(buttonsDiv);

			const errorDiv = document.createElement('div');
			errorDiv.id = 'ta-cfg-error';
			errorDiv.style.cssText =
				'margin-top:10px; color:#b00020; display:none; font-size:13px;';
			this.modal.appendChild(errorDiv);

			this.overlay.appendChild(this.modal);
			document.body.appendChild(this.overlay);

			this.setupEvents(errorDiv);
		}

		setupEvents(errorDiv) {
			this.modal.querySelector('input[data-key="ZOOM_LEVEL"]');
			const saveBtn = this.modal.querySelector('#ta-cfg-save');
			const cancelBtn = this.modal.querySelector('#ta-cfg-cancel');
			const defaultsBtn = this.modal.querySelector('#ta-cfg-defaults');

			const setError = msg => {
				if (msg) {
					errorDiv.style.display = 'block';
					errorDiv.textContent = msg;
				} else {
					errorDiv.style.display = 'none';
					errorDiv.textContent = '';
				}
			};

			const closeModal = () => {
				if (this.overlay && this.overlay.parentNode)
					this.overlay.parentNode.removeChild(this.overlay);
			};

			defaultsBtn.addEventListener('click', () => {
				this.fields.forEach(field => {
					const input = this.modal.querySelector(
						`input[data-key="${field.key}"]`
					);
					input.value = field.placeholder || '';
				});
				setError(null);
			});

			cancelBtn.addEventListener('click', closeModal);

			saveBtn.addEventListener('click', async () => {
				setError(null);

				const newConfig = {};
				for (const field of this.fields) {
					const input = this.modal.querySelector(
						`input[data-key="${field.key}"]`
					);
					const val = input.value.trim();
					if (field.validate) {
						const valid = field.validate(val);
						if (valid !== true) {
							setError(valid);
							return;
						}
					}
					newConfig[field.key] = val;
				}

				try {
					if (typeof this.onSaveCallback === 'function') {
						await this.onSaveCallback(newConfig);
					}
					closeModal();
				} catch (err) {
					setError('Не удалось сохранить настройки: ' + (err.message || err));
				}
			});

			// Overlay click and ESC
			this.overlay.addEventListener('click', e => {
				if (e.target === this.overlay) closeModal();
			});

			const onKey = e => {
				if (e.key === 'Escape') closeModal();
			};
			window.addEventListener('keydown', onKey);
		}
	}

	// Подключаем стили через GM_addStyle (работает в Tampermonkey/Greasemonkey)
	GM_addStyle(`
  /* контейнер для всей статистики */
  #attendance-stats {
    position: fixed;
    top: 10%;
    right: 10px;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    width: 240px;
    padding: 12px;
    z-index: 9999;
    transition: all 0.3s ease;
  }

  /* скрытый контейнер */
  #attendance-stats.collapsed {
    width: 40px;
    height: 40px;
    overflow: hidden;
    padding: 6px;
  }

  /* заголовок */
  #attendance-stats header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-weight: 600;
    font-size: 15px;
  }

  /* кнопка */
  #attendance-stats button {
    border: none;
    background: #e5e7eb;
    border-radius: 6px;
    padding: 4px 8px;
    margin-top: 6px;
    cursor: pointer;
    transition: background 0.2s;
    font-size: 13px;
  }
  #attendance-stats button:hover {
    background: #d1d5db;
  }

  /* кнопка "Свернуть/развернуть" */
  #attendance-stats #toggle-stats {
    background: none;
    font-size: 16px;
    padding: 0;
    margin: 0;
  }

  /* метки */
  #attendance-stats label {
    display: block;
    margin-top: 6px;
    font-size: 13px;
  }

  /* поля ввода даты */
  #attendance-stats input[type="date"] {
    width: 100%;
    padding: 6px;
    border: 1px solid #ccc;
    border-radius: 6px;
    margin-top: 4px;
    font-size: 13px;
  }

  /* цвета присутствия */
  #attendance-stats .present { color: #16a34a; }
  #attendance-stats .lateness { color: #d97706; }
  #attendance-stats .absent { color: #dc2626; }

  /* прогресс-бар */
  #attendance-stats .progress-bar {
    margin-top: 6px;
    height: 8px;
    border-radius: 4px;
    background: #e5e7eb;
    overflow: hidden;
  }
  #attendance-stats .progress-bar-inner {
    height: 100%;
    background: #16a34a;
    width: 0%;
    transition: width 0.4s ease;
  }
	/* скрытый контейнер */
	#attendance-stats.collapsed .stats-body {
		display: none;
	}
	#attendance-stats.collapsed header span {
		display: none; /* скрываем текст "📊 Статистика", остаётся только кнопка */
	}
`);

	function createWidget() {
		let _widget = document.getElementById('attendance-stats');
		if (_widget) return _widget;

		const widget = document.createElement('div');
		widget.id = 'attendance-stats';

		widget.innerHTML = `
<header>
  <span>📊 Статистика</span>
  <button id="toggle-stats" title="Свернуть/развернуть">⯆</button>
</header>
<div class="stats-body" style="margin-top:8px;">
  <label>С: <input type="date" id="date-from"></label>
  <label>По: <input type="date" id="date-to"></label>
  <div style="margin-top:8px; display:flex; gap:6px;">
    <button id="reset-stats">Сбросить</button>
    <button id="refresh-stats" title="Обновить">↻</button>
  </div>
  <div id="stats-content" style="margin-top:10px; line-height:1.4;">
    Всего занятий: 0<br>
    <span class="present">Присутствия: 0</span><br>
    <span class="lateness">Опоздания: 0</span><br>
    <span class="absent">Пропуски: 0</span><br>
    Посещаемость: <b>0%</b>
    <div class="progress-bar"><div class="progress-bar-inner"></div></div>
  </div>
</div>
`;

		document.body.appendChild(widget);
		return widget;
	}

	function removeWidget() {
		const widget = document.getElementById('attendance-stats');
		if (widget && widget.parentNode) widget.parentNode.removeChild(widget);
	}

	/**
	 * Дебаунс-функция.
	 * Ограничивает частоту вызова функции func до одного раза в wait мс.
	 * @param {Function} func - функция, которую нужно ограничить
	 * @param {number} wait - время ожидания в мс
	 * @returns {Function} - обёрнутая функция
	 */
	function debounce(func, wait) {
		let timeout;
		return function (...args) {
			clearTimeout(timeout);
			timeout = setTimeout(() => func.apply(this, args), wait);
		};
	}

	class AttendanceStats {
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
			this.widget.querySelector('strong');
			this.widget.querySelector('.stats-body');

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

	class AutoRater {
		constructor() {
			this.ratingSelector = '.bs-rating-star';
			this.activeClass = 'active';
			this.maxRating = 5;
			this.observer = null;
			this.retryAttempts = 3;
			this.retryDelay = 1000;
			this.pendingRetries = new Map();
			this.homeworkModalSelector = 'hw-upload-homework';
			this.isProcessing = false; // ← Добавляем флаг
			this.processedModals = new Set(); // ← Для отслеживания обработанных модалок
			this.init();
		}

		init() {
			this.setupMutationObserver();
		}

		/**
		 * Проверка, открыто ли модальное окно загрузки ДЗ
		 */
		isHomeworkModalOpen() {
			return document.querySelector(this.homeworkModalSelector) !== null;
		}

		/**
		 * Наблюдатель за изменениями DOM
		 */
		setupMutationObserver() {
			this.observer = new MutationObserver(mutations => {
				mutations.forEach(mutation => {
					if (mutation.addedNodes.length > 0 && !this.isProcessing) {
						const modal = document.querySelector(this.homeworkModalSelector);
						if (modal && !this.processedModals.has(modal)) {
							console.log('Обнаружено модальное окно загрузки ДЗ');
							this.isProcessing = true;
							this.processedModals.add(modal);

							setTimeout(() => {
								this.processHomework();
								this.isProcessing = false;
							}, 1000);
						}
					}
				});
			});

			this.observer.observe(document.body, {
				childList: true,
				subtree: true,
			});
		}

		/**
		 * Полная обработка домашнего задания
		 */
		processHomework() {
			console.log('🚀 Начинаем автоматизацию загрузки ДЗ');

			// 1. Заполняем время выполнения
			this.fillTimeSpent();

			// 2. Выставляем максимальную оценку
			this.rateMaximum();

			// 3. Выбираем позитивные теги
			this.selectPositiveTags();
		}

		/**
		 * Заполнение времени выполнения ДЗ
		 */
		fillTimeSpent() {
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
		}

		/**
		 * Выставление максимальной оценки (5 звёзд) с циклом перепроверки
		 */
		rateMaximum() {
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
		}

		/**
		 * Выбор позитивных тегов для оценки
		 */
		selectPositiveTags() {
			console.log('🔍 Ищем доступные теги...');
			const tagElements = document.querySelectorAll('.evaluation-tags-item');

			// Выводим все найденные теги для отладки
			tagElements.forEach((tagElement, index) => {
				const tagText = tagElement.querySelector('span')?.textContent;
				const isVisible = this.isElementVisible(tagElement);
				const isSelected = tagElement.classList.contains('selected');
				console.log(
					`Тег ${
					index + 1
				}: "${tagText}", видим: ${isVisible}, выбран: ${isSelected}`
				);
			});

			const positiveTags = ['Все круто!', 'Все понятно!', 'Мне нравится'];
			let selectedCount = 0;

			tagElements.forEach(tagElement => {
				if (!this.isElementVisible(tagElement)) return;

				const tagText = tagElement.querySelector('span')?.textContent;
				console.log(`Проверяем тег: "${tagText}"`);

				if (tagText && positiveTags.includes(tagText)) {
					if (!tagElement.classList.contains('selected') && selectedCount < 2) {
						try {
							tagElement.click();
							console.log(`✅ Выбран тег: "${tagText}"`);
							selectedCount++;
							return;
						} catch (error) {
							console.error('Ошибка при выборе тега:', error);
						}
					}
				}
			});

			if (selectedCount === 0) {
				console.log('⚠️ Не найдено подходящих тегов для выбора');
			}
		}

		/**
		 * Генерация уникального ID для контейнера оценки
		 */
		generateContainerId(container) {
			return Array.from(container.parentNode.children).indexOf(container);
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
			if (
				this.isElementVisible(starElement) &&
				this.isElementClickable(starElement)
			) {
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
		 * Проверка видимости элемента
		 */
		isElementVisible(element) {
			return (
				element &&
				element.offsetWidth > 0 &&
				element.offsetHeight > 0 &&
				window.getComputedStyle(element).visibility !== 'hidden' &&
				window.getComputedStyle(element).display !== 'none'
			);
		}

		/**
		 * Проверка кликабельности элемента
		 */
		isElementClickable(element) {
			const style = window.getComputedStyle(element);
			return (
				style.pointerEvents !== 'none' &&
				style.cursor === 'pointer' &&
				!element.hasAttribute('disabled')
			);
		}

		/**
		 * Очистка
		 */
		cleanup() {
			if (this.observer) {
				this.observer.disconnect();
			}

			this.pendingRetries.forEach((timeoutId, containerId) => {
				clearTimeout(timeoutId);
				this.pendingRetries.delete(containerId);
			});
		}
	}

	// функция для загрузки конфигурации
	(async () => {
		const CONFIG = await loadConfig();
		const stats = new AttendanceStats(CONFIG);
		const rater = new AutoRater();

		// функция для регистрации меню конфигурации
		registerConfigMenu(() => {
			const configUI = new ConfigUI(CONFIG, async newCfg => {
				// сохраняем конфигурацию
				await saveConfig(newCfg);

				// обновляем статистику
				stats.updateAttendanceStats();
			});

			// отображаем меню конфигурации
			configUI.show();
		});

		// обработчик события закрытия страницы
		window.addEventListener('unload', () => {
			stats.cleanup();
			rater.cleanup();
		});
	})();

	// Комментарии
	// - функция для загрузки конфигурации
	// - создаем экземпляр класса AttendanceStats
	// - регистрируем меню конфигурации
	// - отображаем меню конфигурации
	// - сохраняем конфигурацию
	// - обновляем статистику
	// - обработчик события закрытия страницы

})();
