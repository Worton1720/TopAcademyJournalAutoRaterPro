// ==UserScript==
// @name         Top Academy Journal Auto Rater Pro
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Автоматизация оценки, навигации и подсчёта посещаемости (только на странице прогресса)
// @author       Rodion
// @match        https://journal.top-academy.ru/*
// @grant        none
// @updateURL    https://raw.githubusercontent.com/Worton1720/TopAcademyJournalAutoRaterPro/main/index.js
// @downloadURL  https://raw.githubusercontent.com/Worton1720/TopAcademyJournalAutoRaterPro/main/index.js
// ==/UserScript==

(function () {
	'use strict';

	/** Конфигурация скрипта */
	const CONFIG = {
		ZOOM_LEVEL: '80%',
		TARGET_RATING: 5,
		NEXT_BUTTON_TEXTS: ['Далее', 'Отправить'],
		OBSERVER_CONFIG: {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['style', 'class'],
		},
		CHECK_INTERVAL: 1000,
		CLICK_DELAY: 100,
		PROGRESS_PAGE_REGEX:
			/https:\/\/journal\.top-academy\.ru\/.*\/main\/progress\/.*/,
	};

	/** Основной класс автоматизатора */
	class AutoRater {
		constructor() {
			this.isProcessing = false;
			this.observer = null;
			this.intervalId = null;
			this.widget = null;
			this.isCollapsed = false;

			// Переменные для хранения границ выбранного диапазона
			this.rangeStart = null;
			this.rangeEnd = null;

			// После инициализации виджета и статистики
			this.setupRangeSelection();

			this.init();
		}

		/** Инициализация скрипта */
		init() {
			this.setPageZoom();
			this.setupObservers();
			this.initialCheck();

			// Инициализация статистики только на странице прогресса
			if (this.isProgressPage()) {
				this.initAttendanceStats();
			}

			// Отслеживание изменений URL для SPA
			this.setupNavigationObserver();
		}

		/** Настройка «кликабельного» выбора диапазона */
		setupRangeSelection() {
			document.body.addEventListener('click', e => {
				// Ищем обёртку «пары»
				const lesson = e.target.closest(
					'.lessons, .lessons.lateness, .lessons.pass'
				);
				if (!lesson) return;

				// Получаем дату пары
				const dateEl = lesson.querySelector('.date');
				if (!dateEl) return;
				const [day, month, year] = dateEl.textContent
					.trim()
					.split('.')
					.map(Number);
				const lessonDate = new Date(year, month - 1, day);

				if (e.shiftKey) {
					// Срабатывает при Shift+LKM — вторая точка
					this.rangeEnd = lessonDate;
				} else {
					// Простое LKM — первая точка
					this.rangeStart = lessonDate;
					this.rangeEnd = null;
				}

				// Если обе точки выбраны и стоят в неверном порядке — меняем местами
				if (this.rangeStart && this.rangeEnd) {
					if (this.rangeStart > this.rangeEnd) {
						[this.rangeStart, this.rangeEnd] = [this.rangeEnd, this.rangeStart];
					}
				}

				// Обновляем поля в виджете и статистику
				this.applyRangeToWidget();
				this.updateAttendanceStats();

				// Подсвечиваем выбранный диапазон на странице
				this.highlightRange();
			});
		}

		/** Заполняет date-инпуты в виджете по выбранному диапазону */
		applyRangeToWidget() {
			if (!this.widget) return;
			const format = d => {
				const y = d.getFullYear();
				const m = String(d.getMonth() + 1).padStart(2, '0');
				const day = String(d.getDate()).padStart(2, '0');
				return `${y}-${m}-${day}`;
			};
			const fromInput = this.widget.querySelector('#date-from');
			const toInput = this.widget.querySelector('#date-to');
			if (this.rangeStart) fromInput.value = format(this.rangeStart);
			if (this.rangeEnd) toInput.value = format(this.rangeEnd);
		}

		/** Добавляет/удаляет метки «start», «in», «end» у уроков */
		highlightRange() {
			// Убираем старые метки
			document.querySelectorAll('.range-badge').forEach(b => b.remove());

			if (!(this.rangeStart && this.rangeEnd)) return;

			// Собираем все уроки, попадающие в диапазон
			const lessons = Array.from(
				document.querySelectorAll('.lessons, .lessons.lateness, .lessons.pass')
			)
				.map(lesson => {
					const dateEl = lesson.querySelector('.date');
					if (!dateEl) return null;
					const [d, m, y] = dateEl.textContent.trim().split('.').map(Number);
					const dt = new Date(y, m - 1, d);
					return { lesson, dt };
				})
				.filter(
					item => item && item.dt >= this.rangeStart && item.dt <= this.rangeEnd
				);

			// Для каждого отмечаем, что это — start, in или end
			lessons.forEach(({ lesson, dt }) => {
				let label;
				if (dt.getTime() === this.rangeStart.getTime()) {
					label = 'start';
				} else if (dt.getTime() === this.rangeEnd.getTime()) {
					label = 'end';
				} else {
					label = 'in';
				}

				// Создаём бейдж
				lesson.style.position = lesson.style.position || 'relative';
				const badge = document.createElement('div');
				badge.className = 'range-badge';
				badge.textContent = label;
				Object.assign(badge.style, {
					position: 'absolute',
					bottom: '2px',
					left: '2px',
					backgroundColor: 'rgba(0, 128, 0, 0.7)',
					color: '#fff',
					padding: '2px 4px',
					fontSize: '10px',
					borderRadius: '3px',
					pointerEvents: 'none',
				});
				lesson.appendChild(badge);
			});
		}

		/** Проверка, что текущая страница - страница прогресса */
		isProgressPage() {
			return CONFIG.PROGRESS_PAGE_REGEX.test(window.location.href);
		}

		/** Инициализация статистики посещаемости */
		initAttendanceStats() {
			this.createAttendanceWidget();
			this.updateAttendanceStats = this.debounce(
				this.updateAttendanceStats.bind(this),
				300
			);
			// this.setupAttendanceObserver();
			this.updateAttendanceStats(); // Первоначальное обновление
		}

		/** Настройка наблюдателя для посещаемости */
		setupAttendanceObserver() {
			const targetNode =
				document.querySelector('#attendance-anchor') || document.body;
			new MutationObserver(() => {
				this.updateAttendanceStats(); // Обновляем статистику при изменениях
			}).observe(targetNode, { childList: true, subtree: true });
		}

		/** Проверка и обновление виджета */
		checkAndUpdateWidget() {
			if (this.isProgressPage()) {
				if (!this.widget) {
					this.createAttendanceWidget();
				}
				this.updateAttendanceStats();
			} else {
				this.removeAttendanceWidget();
			}
		}

		/** Создание виджета посещаемости */
		createAttendanceWidget() {
			if (document.getElementById('attendance-stats')) return;

			this.widget = document.createElement('div');
			this.widget.id = 'attendance-stats';
			Object.assign(this.widget.style, {
				position: 'fixed',
				top: '10%',
				right: '10px',
				backgroundColor: '#fff',
				padding: '10px',
				border: '1px solid #ccc',
				borderRadius: '5px',
				zIndex: '9999',
				boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
				fontSize: '14px',
				width: '220px', // фиксированная ширина в развернутом состоянии
				transition: 'width 0.2s, padding 0.2s',
			});

			this.widget.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between;">
            <strong>📊 Статистика</strong>
            <button id="toggle-stats"
                    title="Свернуть/развернуть"
                    style="background:none; border:none; cursor:pointer; font-size:14px; line-height:1; padding:0;">
                ⯆
            </button>
        </div>
        <div class="stats-body" style="margin-top:8px;">
            <label>С: <input type="date" id="date-from"></label><br>
            <label>По: <input type="date" id="date-to"></label><br>
            <button id="reset-stats" style="margin-top:6px;">Сбросить</button>
            <button id="refresh-stats" title="Обновить"
                    style="margin-top:6px; margin-left:4px; font-size:12px; line-height:1; padding:2px 4px; cursor:pointer;">
                ↻
            </button>
            <div id="stats-content" style="margin-top:8px">
                Всего занятий: 0<br>
                Присутствия: 0<br>
                Опоздания: 0<br>
                Пропуски: 0<br>
                Посещаемость: <b>0%</b>
            </div>
        </div>
    `;
			document.body.appendChild(this.widget);

			// Установка диапазона по умолчанию: с начала месяца до сегодня
			const now = new Date();
			const yyyy = now.getFullYear();
			const mm = String(now.getMonth() + 1).padStart(2, '0');
			const dd = String(now.getDate()).padStart(2, '0');
			const todayStr = `${yyyy}-${mm}-${dd}`;
			const firstOfMonthStr = `${yyyy}-${mm}-01`;

			this.widget.querySelector('#date-from').value = firstOfMonthStr;
			this.widget.querySelector('#date-to').value = todayStr;

			// Кешируем элементы для переключения состояния
			const btn = this.widget.querySelector('#toggle-stats');
			const headerLabel = this.widget.querySelector('strong');
			const body = this.widget.querySelector('.stats-body');

			// Обработчик сворачивания/разворачивания
			btn.addEventListener('click', () => {
				this.isCollapsed = !this.isCollapsed;

				if (this.isCollapsed) {
					headerLabel.style.display = 'none';
					body.style.display = 'none';
					this.widget.style.width = 'auto';
					this.widget.style.padding = '4px';
					btn.textContent = '⯈';
				} else {
					headerLabel.style.display = '';
					body.style.display = '';
					this.widget.style.width = '220px';
					this.widget.style.padding = '10px';
					btn.textContent = '⯆';
				}
			});

			// Обработчики остальной логики
			this.widget
				.querySelector('#date-from')
				.addEventListener('change', () => this.updateAttendanceStats());
			this.widget
				.querySelector('#date-to')
				.addEventListener('change', () => this.updateAttendanceStats());
			this.widget
				.querySelector('#reset-stats')
				.addEventListener('click', () => {
					this.widget.querySelector('#date-from').value = firstOfMonthStr;
					this.widget.querySelector('#date-to').value = todayStr;
					this.rangeStart = null;
					this.rangeEnd = null;
					document.querySelectorAll('.range-badge').forEach(b => b.remove());
					this.updateAttendanceStats();
				});
			this.widget
				.querySelector('#refresh-stats')
				.addEventListener('click', () => {
					this.updateAttendanceStats();
					this.highlightRange();
				});
		}

		/** Удаление виджета посещаемости */
		removeAttendanceWidget() {
			if (this.widget && this.widget.parentNode) {
				this.widget.parentNode.removeChild(this.widget);
				this.widget = null;
			}
		}

		/** Обновление статистики посещаемости */
		updateAttendanceStats() {
			if (!this.isProgressPage()) {
				this.removeAttendanceWidget();
				return;
			}

			if (!this.widget) {
				this.createAttendanceWidget();
			}

			// Получаем значения дат
			const dateFromInput = this.widget.querySelector('#date-from').value;
			const dateToInput = this.widget.querySelector('#date-to').value;
			// Парсим YYYY-MM-DD как местную полуночь
			const parseLocalDate = s => {
				const [y, m, d] = s.split('-').map(Number);
				return new Date(y, m - 1, d);
			};
			const dateFrom = dateFromInput ? parseLocalDate(dateFromInput) : null;
			const dateTo = dateToInput ? parseLocalDate(dateToInput) : null;
			if (dateTo) dateTo.setHours(23, 59, 59, 999);

			// Собираем все занятия
			let lessons = document.querySelectorAll(
				'.lessons, .lessons.lateness, .lessons.pass'
			);

			// Фильтруем по диапазону дат, если он указан
			lessons = Array.from(lessons).filter(lesson => {
				const dateText = lesson.querySelector('.date')?.textContent.trim();
				if (!dateText) return false;
				const [d, m, y] = dateText.split('.').map(Number);
				const ld = new Date(y, m - 1, d);
				return (!dateFrom || ld >= dateFrom) && (!dateTo || ld <= dateTo);
			});

			// Подсчёт статистики
			const total = lessons.length;
			const lateness = lessons.filter(lesson =>
				lesson.classList.contains('lateness')
			).length;
			const present =
				lateness +
				lessons.filter(
					lesson =>
						!lesson.classList.contains('pass') &&
						!lesson.classList.contains('lateness')
				).length;
			const absent = lessons.filter(lesson =>
				lesson.classList.contains('pass')
			).length;

			const attendancePercentage =
				total > 0 ? ((present / total) * 100).toFixed(1) : 0;

			// Обновляем содержимое виджета
			if (this.widget) {
				const statsContent = this.widget.querySelector('#stats-content');
				statsContent.innerHTML = `
                  Всего занятий: ${total}<br>
                  Присутствия: ${present}<br>
                  Опоздания: ${lateness}<br>
                  Пропуски: ${absent}<br>
                  Посещаемость: <b>${attendancePercentage}%</b>
              `;
			}
		}

		/** Дебаунс для оптимизации */
		debounce(func, wait) {
			let timeout;
			return (...args) => {
				clearTimeout(timeout);
				timeout = setTimeout(() => func.apply(this, args), wait);
			};
		}

		/** Установка масштаба страницы */
		setPageZoom() {
			document.documentElement.style.zoom = CONFIG.ZOOM_LEVEL;
		}

		/** Настройка наблюдателя за навигацией */
		setupNavigationObserver() {
			let lastUrl = window.location.href;
			new MutationObserver(() => {
				const currentUrl = window.location.href;
				if (currentUrl !== lastUrl) {
					lastUrl = currentUrl;
					this.checkAndUpdateWidget();
				}
			}).observe(document.body, { childList: true, subtree: true });

			// Отслеживание изменений через popstate
			window.addEventListener('popstate', () => {
				this.checkAndUpdateWidget();
			});
		}

		/** Настройка наблюдателей */
		setupObservers() {
			this.observer = new MutationObserver(() => this.handleModal());
			this.observer.observe(document.body, CONFIG.OBSERVER_CONFIG);
			this.intervalId = setInterval(
				() => this.handleModal(),
				CONFIG.CHECK_INTERVAL
			);
		}

		/** Первоначальная проверка */
		initialCheck() {
			this.handleModal();
		}

		/** Основной обработчик модальных окон */
		handleModal() {
			if (this.shouldSkipProcessing()) return;
			this.isProcessing = true;

			try {
				if (this.processRating()) {
					this.scheduleNextButtonClick();
				} else if (this.isRatingAlreadySet()) {
					this.clickNextButton();
				}
			} finally {
				this.isProcessing = false;
			}
		}

		/** Проверка условий для пропуска обработки */
		shouldSkipProcessing() {
			return this.isProcessing || !this.isModalVisible();
		}

		/** Проверка видимости модального окна */
		isModalVisible() {
			const modal = document.querySelector('modal-container');
			return modal && modal.style.display !== 'none';
		}

		/** Обработка рейтинга */
		processRating() {
			const ratingElement = this.findRatingElement();
			if (!ratingElement) return false;

			this.clickRating(ratingElement);
			return true;
		}

		/** Поиск элемента рейтинга */
		findRatingElement() {
			return document.querySelector(
				`span.bs-rating-star[title="${CONFIG.TARGET_RATING}"]:not(.active)`
			);
		}

		/** Клик по звёздочке рейтинга */
		clickRating(element) {
			const button = element.querySelector('button.rating-star');
			if (button) {
				button.click();
				console.log(`Нажата ${CONFIG.TARGET_RATING}-звёздочная оценка`);
			}
		}

		/** Проверка установленного рейтинга */
		isRatingAlreadySet() {
			return !!document.querySelector(
				`span.bs-rating-star[title="${CONFIG.TARGET_RATING}"].active`
			);
		}

		/** Запланировать клик по кнопке "Далее" */
		scheduleNextButtonClick() {
			setTimeout(() => this.clickNextButton(), CONFIG.CLICK_DELAY);
		}

		/** Попытка нажатия кнопки продолжения */
		clickNextButton() {
			const button = this.findNextButton();
			if (button) {
				button.click();
				console.log(`Нажата кнопка "${button.textContent.trim()}"`);
				return true;
			}
			return false;
		}

		/** Поиск кнопки продолжения */
		findNextButton() {
			return Array.from(
				document.querySelectorAll('button.btn.btn-default')
			).find(btn => CONFIG.NEXT_BUTTON_TEXTS.includes(btn.textContent.trim()));
		}

		/** Очистка ресурсов */
		cleanup() {
			if (this.observer) this.observer.disconnect();
			if (this.intervalId) clearInterval(this.intervalId);
			this.removeAttendanceWidget();
		}
	}

	// Запуск скрипта
	const autoRater = new AutoRater();

	// Очистка при выгрузке страницы
	window.addEventListener('unload', () => {
		autoRater.cleanup();
	});
})();
