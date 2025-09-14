export function createWidget() {
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

export function removeWidget() {
	const existingWidget = document.getElementById('attendance-stats-widget');
	if (existingWidget) {
		existingWidget.remove();
	}
}

export function isElementVisible(element) {
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

export function isElementClickable(element) {
	if (!element) return false;

	const style = window.getComputedStyle(element);
	return (
		style.pointerEvents !== 'none' &&
		style.cursor === 'pointer' &&
		!element.hasAttribute('disabled')
	);
}
