document.addEventListener('DOMContentLoaded', function() {
    const swapCheckboxEl = document.getElementById('drive-type-swap-checkbox');
    const swapGroupEl = document.getElementById('swap-drive-type-group');
    const stockDriveEl = document.getElementById('stock-drive-type');
    const swapDriveEl = document.getElementById('swap-drive-type');
    const calculateBtn = document.getElementById('calculate-btn');
    const themeToggle = document.getElementById('theme-toggle');
    const resultsContainer = document.getElementById('results-container');

    const driveOptions = {
        rwd: 'Rear',
        awd: '4WD',
        fwd: 'Front'
    };
    
    themeToggle.addEventListener('change', function() {
        document.body.classList.toggle('dark-mode', this.checked);
        localStorage.setItem('theme', this.checked ? 'dark' : 'light');
    });
    if (localStorage.getItem('theme') === 'dark' || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches && !localStorage.getItem('theme'))) {
        themeToggle.checked = true;
        document.body.classList.add('dark-mode');
    }

    swapCheckboxEl.addEventListener('change', function() {
        swapGroupEl.style.display = this.checked ? 'block' : 'none';
        if(this.checked) {
            updateSwapOptions();
        }
    });
    stockDriveEl.addEventListener('change', updateSwapOptions);

    function updateSwapOptions() {
        const stockValue = stockDriveEl.value;
        swapDriveEl.innerHTML = '';
        for (const key in driveOptions) {
            if (key !== stockValue) {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = driveOptions[key];
                swapDriveEl.appendChild(option);
            }
        }
    }

    calculateBtn.addEventListener('click', function() {
        if (!validateAllInputs()) {
            return;
        }
        
        const inputs = getFormValues();
        
        let { frontSpring, rearSpring } = calculateSpringsByFrequency(inputs);
        
        if (inputs.hasFrontAero) frontSpring *= 1.15;
        if (inputs.hasRearAero) rearSpring *= 1.17;

        frontSpring *= inputs.stiffnessMultiplier;
        rearSpring *= inputs.stiffnessMultiplier;

        const finalFrontSpring = clamp(frontSpring, inputs.frontSpringMin, inputs.frontSpringMax);
        const finalRearSpring = clamp(rearSpring, inputs.rearSpringMin, inputs.rearSpringMax);

        const { frontRebound, rearRebound, frontCompression, rearCompression } = calculateDampers(finalFrontSpring, finalRearSpring, inputs.suspensionType);
        const { frontARB, rearARB } = calculateARBs(finalFrontSpring, finalRearSpring, inputs);
        
        resultsContainer.style.display = 'block';
        displayResults({ 
            frontSpring: finalFrontSpring, 
            rearSpring: finalRearSpring, 
            frontRebound, rearRebound, frontCompression, rearCompression, 
            frontARB, rearARB
        });
    });
    
	function getFormValues() {
		const isSwapped = document.getElementById('drive-type-swap-checkbox').checked;
		const currentDriveType = isSwapped 
			? document.getElementById('swap-drive-type').value 
			: document.getElementById('stock-drive-type').value;

		return {
			weight: parseFloat(document.getElementById('weight').value),
			balance: parseFloat(document.getElementById('balance').value) / 100,
			suspensionType: document.querySelector('input[name="suspension"]:checked').value,
			effectiveDriveType: currentDriveType,
			frontSpringMin: parseFloat(document.getElementById('front-spring-min').value),
			frontSpringMax: parseFloat(document.getElementById('front-spring-max').value),
			rearSpringMin: parseFloat(document.getElementById('rear-spring-min').value),
			rearSpringMax: parseFloat(document.getElementById('rear-spring-max').value),
			hasFrontAero: document.getElementById('front-aero').checked,
			hasRearAero: document.getElementById('rear-aero').checked,
			frontFreq: parseFloat(document.getElementById('front-freq').value),
			rearBias: parseFloat(document.getElementById('rear-bias').value),
			stiffnessMultiplier: parseFloat(document.getElementById('stiffness-multiplier').value),
		};
	}
    
    function calculateSpringsByFrequency({ weight, balance, frontFreq, rearBias }) {
        const frontSprungMass = (weight * balance) / 2;
        const rearSprungMass = (weight * (1 - balance)) / 2;
        const rearFreq = frontFreq * (1 + (rearBias / 100));
        const frontSpring = (frontSprungMass * Math.pow(2 * Math.PI * frontFreq, 2)) / 1000;
        const rearSpring = (rearSprungMass * Math.pow(2 * Math.PI * rearFreq, 2)) / 1000;
        return { frontSpring, rearSpring };
    }


	
	function calculateDampers(frontSpringKg, rearSpringKg, suspensionType) {
		let params;

		if (suspensionType === 'offroad-fh4') {
			params = {
				DIVISOR: 15.0,
				COMPRESSION_RATIO: 0.6,
				MIN_VAL: 1.0,
				MAX_VAL: 10.0
			};
		} else if (suspensionType === 'racing-fh4') {
			params = {
				DIVISOR: 16.5,
				COMPRESSION_RATIO: 0.7,
				MIN_VAL: 3.0,
				MAX_VAL: 20.0
			};
		} else { 
			params = {
				DIVISOR: 17.5,
				COMPRESSION_RATIO: 0.7,
				MIN_VAL: 1.0,
				MAX_VAL: 20.0
			};
		}

		const frontRebound = clamp(frontSpringKg / params.DIVISOR, params.MIN_VAL, params.MAX_VAL);
		const rearRebound = clamp(rearSpringKg / params.DIVISOR, params.MIN_VAL, params.MAX_VAL);
		
		const compressionMinVal = (suspensionType === 'race') ? params.MIN_VAL / 2 : params.MIN_VAL;
		
		const frontCompression = clamp(frontRebound * params.COMPRESSION_RATIO, compressionMinVal, params.MAX_VAL);
		const rearCompression = clamp(rearRebound * params.COMPRESSION_RATIO, compressionMinVal, params.MAX_VAL);
		
		return { frontRebound, rearRebound, frontCompression, rearCompression };
	}

    function calculateARBs(frontSpring, rearSpring, inputs) {
        const arbRange = { min: 1, max: 65 };

        // Вспомогательная функция для расчета нейтрального значения ARB
        const calculateNeutralARB = (spring, minSpring, maxSpring) => {
            // Предотвращение деления на ноль
            if (maxSpring <= minSpring) {
                return (arbRange.min + arbRange.max) / 2; // Возвращаем среднее значение в качестве запасного варианта
            }
            // Расчет, в каком проценте от доступного диапазона находится жесткость пружины
            const stiffnessRatio = (spring - minSpring) / (maxSpring - minSpring);
            // Применение этого процента к диапазону ARB
            return (arbRange.max - arbRange.min) * stiffnessRatio + arbRange.min;
        };

        // Рассчитываем нейтральные базовые значения для переда и зада
        let frontARB = calculateNeutralARB(frontSpring, inputs.frontSpringMin, inputs.frontSpringMax);
        let rearARB = calculateNeutralARB(rearSpring, inputs.rearSpringMin, inputs.rearSpringMax);

        // Применяем общепринятые смещения для коррекции управляемости
        switch(inputs.effectiveDriveType) {
            case 'fwd':
                // Для FWD делаем зад жестче, чтобы бороться с андерстиром
                rearARB = frontARB * 1.5;
                break;
            case 'rwd':
                // Для RWD делаем перед немного жестче заднего для стабильности на выходе
                frontARB = rearARB * 1.1;
                break;
            case 'awd_stock':
                // Для стокового AWD нужна умеренная коррекция андерстира
                rearARB = frontARB * 1.4;
                break;
            case 'awd_swapped':
                // Для свапнутого AWD нужна агрессивная коррекция андерстира
                rearARB = frontARB * 1.9;
                break;
        }

        // Возвращаем значения, ограниченные диапазоном игры
        return {
            frontARB: clamp(frontARB, arbRange.min, arbRange.max),
            rearARB: clamp(rearARB, arbRange.min, arbRange.max)
        };
    }
    
    function displayResults(data) {
        document.getElementById('res-front-spring').textContent = `${data.frontSpring.toFixed(1)} KGF/MM`;
        document.getElementById('res-rear-spring').textContent = `${data.rearSpring.toFixed(1)} KGF/MM`;
        document.getElementById('res-front-rebound').textContent = data.frontRebound.toFixed(1);
        document.getElementById('res-rear-rebound').textContent = data.rearRebound.toFixed(1);
        document.getElementById('res-front-compression').textContent = data.frontCompression.toFixed(1);
        document.getElementById('res-rear-compression').textContent = data.rearCompression.toFixed(1);
        document.getElementById('res-front-arb').textContent = data.frontARB.toFixed(1);
        document.getElementById('res-rear-arb').textContent = data.rearARB.toFixed(1);
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }
    
    function validateAllInputs() {
        let isValid = true;
        document.querySelectorAll('.error').forEach(el => el.textContent = '');

        // Валидация основных полей
        if (!validateField('weight', '100-5000', 100, 5000)) isValid = false;
        if (!validateField('balance', '1-99', 1, 99)) isValid = false;

        // Валидация полей Frequency Tuning
        if (!validateField('front-freq', '1.0-6.0', 1.0, 6.0)) isValid = false;
        if (!validateField('rear-bias', '-100 - +100', -100, 100)) isValid = false;
        if (!validateField('stiffness-multiplier', '0.1-10', 0.1, 10)) isValid = false;

        // Валидация диапазонов пружин
        if (!validateRange('front-spring-min', 'front-spring-max', 'front-spring-error')) isValid = false;
        if (!validateRange('rear-spring-min', 'rear-spring-max', 'rear-spring-error')) isValid = false;

        return isValid;
    }

    function validateField(id, message, minVal = -Infinity, maxVal = Infinity) {
        const element = document.getElementById(id);
        const errorElement = document.getElementById(`${id}-error`);
        const value = parseFloat(element.value);

        if (element.value === '') { // Проверка на пустое поле
            errorElement.textContent = 'Enter value';
            element.style.borderColor = '#ff4d4d';
            return false;
        }

        if (isNaN(value) || value < minVal || value > maxVal) {
            errorElement.textContent = `Range: ${message}`;
            element.style.borderColor = '#ff4d4d';
            return false;
        }

        element.style.borderColor = '';
        return true;
    }

    function validateRange(minId, maxId, errorId) {
        const minEl = document.getElementById(minId);
        const maxEl = document.getElementById(maxId);
        const errorEl = document.getElementById(errorId);
        const min = parseFloat(minEl.value);
        const max = parseFloat(maxEl.value);
        const minRange = 0;
        const maxRange = 5000;
        let isValid = true;

        minEl.style.borderColor = '';
        maxEl.style.borderColor = '';

        if (!minEl.value || isNaN(min) || min < minRange || min > maxRange) {
            errorEl.textContent = 'Enter min value (0-5000)';
            minEl.style.borderColor = '#ff4d4d';
            isValid = false;
        }

        if (!maxEl.value || isNaN(max) || max < minRange || max > maxRange) {
            // Чтобы не дублировать сообщение, показываем его только если мин. поле в порядке
            if (isValid) errorEl.textContent = 'Enter max value (0-5000)';
            maxEl.style.borderColor = '#ff4d4d';
            isValid = false;
        }

        if (isValid && min >= max) {
            errorEl.textContent = 'max > min';
            minEl.style.borderColor = '#ff4d4d';
            maxEl.style.borderColor = '#ff4d4d';
            isValid = false;
        }

        if (isValid) {
            errorEl.textContent = '';
        }
        return isValid;
    }

    updateSwapOptions();
});