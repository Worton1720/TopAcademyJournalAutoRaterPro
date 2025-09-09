export class ConfigUI {
	constructor(config, onSaveCallback) {
		this.config = { ...config };
		this.onSaveCallback = onSaveCallback;
		this.modal = null;
		this.overlay = null;

		// Список параметров для редактирования
		this.fields = [
			{
				key: 'ZOOM_LEVEL',
				label: 'Масштаб страницы (например: 80%)',
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
		const zoomInput = this.modal.querySelector('input[data-key="ZOOM_LEVEL"]');
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
			this.fields.forEach(f => {
				const input = this.modal.querySelector(`input[data-key="${f.key}"]`);
				input.value = f.placeholder || '';
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
