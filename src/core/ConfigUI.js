export class ConfigUI {
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
