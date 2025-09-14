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

export function createWidget() {
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

export function removeWidget() {
	const widget = document.getElementById('attendance-stats');
	if (widget && widget.parentNode) widget.parentNode.removeChild(widget);
}
