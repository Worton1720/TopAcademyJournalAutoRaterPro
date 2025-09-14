export class AutoRater {
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
