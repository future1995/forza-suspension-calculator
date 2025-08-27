document.addEventListener('DOMContentLoaded', function() {
    // --- Получаем ссылки на ключевые элементы UI ---
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
    
    // --- Логика переключения темы ---
    themeToggle.addEventListener('change', function() {
        document.body.classList.toggle('dark-mode', this.checked);
        localStorage.setItem('theme', this.checked ? 'dark' : 'light');
    });
    if (localStorage.getItem('theme') === 'dark' || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches && !localStorage.getItem('theme'))) {
        themeToggle.checked = true;
        document.body.classList.add('dark-mode');
    }

    // --- Логика интерфейса для свапа привода ---
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

    // --- ГЛАВНАЯ ЛОГИКА РАСЧЕТА ---
    calculateBtn.addEventListener('click', function() {
        if (!validateAllInputs()) {
            return;
        }
        
        const inputs = getFormValues();
        
        let { frontSpring, rearSpring } = calculateSpringsByFrequency(inputs);
        
        if (inputs.hasFrontAero) frontSpring *= 1.15;
        if (inputs.hasRearAero) rearSpring *= 1.15;

        frontSpring *= inputs.stiffnessMultiplier;
        rearSpring *= inputs.stiffnessMultiplier;

        const finalFrontSpring = clamp(frontSpring, inputs.frontSpringMin, inputs.frontSpringMax);
        const finalRearSpring = clamp(rearSpring, inputs.rearSpringMin, inputs.rearSpringMax);

        const { frontRebound, rearRebound, frontCompression, rearCompression } = calculateDampers(finalFrontSpring, finalRearSpring, inputs.suspensionType);
        const { frontARB, rearARB } = calculateARBs(finalFrontSpring, finalRearSpring, inputs.balance, inputs.effectiveDriveType);
        
        resultsContainer.style.display = 'block';
        displayResults({ 
            frontSpring: finalFrontSpring, 
            rearSpring: finalRearSpring, 
            frontRebound, rearRebound, frontCompression, rearCompression, 
            frontARB, rearARB
        });
    });
    
    // ИСПРАВЛЕНИЕ: Эта функция была переписана для надежного считывания данных
	function getFormValues() {
		const isSwapped = document.getElementById('drive-type-swap-checkbox').checked;
		const currentDriveType = isSwapped 
			? document.getElementById('swap-drive-type').value 
			: document.getElementById('stock-drive-type').value;

		return {
			weight: parseFloat(document.getElementById('weight').value),
			balance: parseFloat(document.getElementById('balance').value) / 100,
			// --- НОВАЯ СТРОКА ---
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
			// Параметры для Офф-роуд подвески в Forza Horizon 4
			params = {
				DIVISOR: 15.0,
				COMPRESSION_RATIO: 0.6,
				MIN_VAL: 1.0,
				MAX_VAL: 10.0
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
		
		const compressionMinVal = (suspensionType === 'offroad-fh4') ? params.MIN_VAL : params.MIN_VAL / 2;
		
		const frontCompression = clamp(frontRebound * params.COMPRESSION_RATIO, compressionMinVal, params.MAX_VAL);
		const rearCompression = clamp(rearRebound * params.COMPRESSION_RATIO, compressionMinVal, params.MAX_VAL);
		
		return { frontRebound, rearRebound, frontCompression, rearCompression };
	}

    function calculateARBs(frontSpring, rearSpring, balance, driveType) {
        const arbRange = { min: 1, max: 65 };
        let frontBias = 1.0, rearBias = 1.0;
        
        switch(driveType) {
            case 'fwd': frontBias = 1.25; rearBias = 0.75; break;
            case 'rwd': frontBias = 0.85; rearBias = 1.15; break;
        }

        const baseFront = frontSpring * 0.155 * (balance / 0.5) * frontBias;
        const baseRear = rearSpring * 0.155 * ((1 - balance) / 0.5) * rearBias;

        return {
            frontARB: clamp(baseFront, arbRange.min, arbRange.max),
            rearARB: clamp(baseRear, arbRange.min, arbRange.max)
        };
    }
    
    function displayResults(data) {
        document.getElementById('res-front-spring').textContent = `${data.frontSpring.toFixed(1)} кгс/мм`;
        document.getElementById('res-rear-spring').textContent = `${data.rearSpring.toFixed(1)} кгс/мм`;
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
        if (!validateField('weight', 'Введите вес')) isValid = false;
        if (!validateField('balance', '1-99', 1, 99)) isValid = false;
        if (!validateRange('front-spring-min', 'front-spring-max', 'front-spring-error')) isValid = false;
        if (!validateRange('rear-spring-min', 'rear-spring-max', 'rear-spring-error')) isValid = false;
        return isValid;
    }

    function validateField(id, message, minVal = 0, maxVal = Infinity) {
        const element = document.getElementById(id);
        const errorElement = document.getElementById(`${id}-error`);
        const value = parseFloat(element.value);
        if (!element.value || isNaN(value) || value <= minVal || value >= maxVal) {
            errorElement.textContent = message;
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
        let isValid = true;

        minEl.style.borderColor = '';
        maxEl.style.borderColor = '';

        if (!minEl.value || isNaN(min) || min <= 0) {
            errorEl.textContent = 'Введите мин. значение';
            minEl.style.borderColor = '#ff4d4d';
            isValid = false;
        }

        if (!maxEl.value || isNaN(max) || max <= 0) {
            errorEl.textContent = 'Введите макс. значение';
            maxEl.style.borderColor = '#ff4d4d';
            isValid = false;
        }
        
        if (isValid && min >= max) {
            errorEl.textContent = 'Макс. > мин.';
            minEl.style.borderColor = '#ff4d4d';
            maxEl.style.borderColor = '#ff4d4d';
            isValid = false;
        }
        
        if (isValid) {
            errorEl.textContent = '';
        }
        return isValid;
    }

    // Initial setup
    updateSwapOptions();
});