import { isElementVisible, isElementClickable } from '../utils/dom.js';

export class AutoRaterModule {
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
