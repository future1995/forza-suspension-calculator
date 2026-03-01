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

    function safeParseFloat(str) {
        if (typeof str !== 'string') {
            str = String(str);
        }
        const normalized = str.replace(',', '.');
        const cleaned = normalized.replace(/[^\d.-]/g, '');
        const result = parseFloat(cleaned);
        return isNaN(result) ? 0 : result;
    }

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
            weight: safeParseFloat(document.getElementById('weight').value),
            balance: safeParseFloat(document.getElementById('balance').value) / 100,
            suspensionType: document.querySelector('input[name="suspension"]:checked').value,
            effectiveDriveType: currentDriveType,
            frontSpringMin: safeParseFloat(document.getElementById('front-spring-min').value),
            frontSpringMax: safeParseFloat(document.getElementById('front-spring-max').value),
            rearSpringMin: safeParseFloat(document.getElementById('rear-spring-min').value),
            rearSpringMax: safeParseFloat(document.getElementById('rear-spring-max').value),
            hasFrontAero: document.getElementById('front-aero').checked,
            hasRearAero: document.getElementById('rear-aero').checked,
            frontFreq: safeParseFloat(document.getElementById('front-freq').value),
            rearBias: safeParseFloat(document.getElementById('rear-bias').value),
            stiffnessMultiplier: safeParseFloat(document.getElementById('stiffness-multiplier').value),
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
            params = { DIVISOR: 15.0, COMPRESSION_RATIO: 0.6, MIN_VAL: 1.0, MAX_VAL: 10.0 };
        } else if (suspensionType === 'racing-fh4') {
            params = { DIVISOR: 16.5, COMPRESSION_RATIO: 0.7, MIN_VAL: 3.0, MAX_VAL: 20.0 };
        } else {
            params = { DIVISOR: 17.5, COMPRESSION_RATIO: 0.7, MIN_VAL: 1.0, MAX_VAL: 20.0 };
        }

        let frontRebound = frontSpringKg / params.DIVISOR;
        let rearRebound = rearSpringKg / params.DIVISOR;

        const ratio = Math.max(frontSpringKg, rearSpringKg) / Math.min(frontSpringKg, rearSpringKg);
        const compensation = Math.sqrt(ratio);

        if (frontSpringKg > rearSpringKg) {
            rearRebound *= compensation;
        } else if (rearSpringKg > frontSpringKg) {
            frontRebound *= compensation;
        }

        frontRebound = clamp(frontRebound, params.MIN_VAL, params.MAX_VAL);
        rearRebound = clamp(rearRebound, params.MIN_VAL, params.MAX_VAL);

        const compressionMinVal = (suspensionType === 'race') ? params.MIN_VAL / 2 : params.MIN_VAL;

        const frontCompression = clamp(frontRebound * params.COMPRESSION_RATIO, compressionMinVal, params.MAX_VAL);
        const rearCompression = clamp(rearRebound * params.COMPRESSION_RATIO, compressionMinVal, params.MAX_VAL);

        return { frontRebound, rearRebound, frontCompression, rearCompression };
    }

    function calculateARBs(frontSpring, rearSpring, inputs) {
        const arbRange = { min: 1, max: 65 };

        const calculateNeutralARB = (spring, minSpring, maxSpring) => {
            if (maxSpring <= minSpring) {
                return (arbRange.min + arbRange.max) / 2;
            }
            const stiffnessRatio = (spring - minSpring) / (maxSpring - minSpring);
            return (arbRange.max - arbRange.min) * stiffnessRatio + arbRange.min;
        };

        let frontARB = calculateNeutralARB(frontSpring, inputs.frontSpringMin, inputs.frontSpringMax);
        let rearARB = calculateNeutralARB(rearSpring, inputs.rearSpringMin, inputs.rearSpringMax);

        switch(inputs.effectiveDriveType) {
            case 'fwd':
                rearARB = frontARB * 1.5;
                break;
            case 'rwd':
                frontARB = rearARB * 1.1;
                break;
            case 'awd_stock':
                rearARB = frontARB * 1.4;
                break;
            case 'awd_swapped':
                rearARB = frontARB * 1.9;
                break;
        }

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

        if (!validateField('weight', '100-5000', 100, 5000)) isValid = false;
        if (!validateField('balance', '1-99', 1, 99)) isValid = false;
        if (!validateField('front-freq', '1.0-6.0', 1.0, 6.0)) isValid = false;
        if (!validateField('rear-bias', '-100 - +100', -100, 100)) isValid = false;
        if (!validateField('stiffness-multiplier', '0.1-10', 0.1, 10)) isValid = false;
        if (!validateRange('front-spring-min', 'front-spring-max')) isValid = false;
        if (!validateRange('rear-spring-min', 'rear-spring-max')) isValid = false;

        return isValid;
    }

    function validateField(id, message, minVal = -Infinity, maxVal = Infinity) {
        const element = document.getElementById(id);
        const errorElement = document.getElementById(`${id}-error`);
        const value = safeParseFloat(element.value);

        if (element.value === '') {
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

    function validateRange(minId, maxId) {
        const minEl = document.getElementById(minId);
        const maxEl = document.getElementById(maxId);
        const minErrorEl = document.getElementById(minId + '-error');
        const maxErrorEl = document.getElementById(maxId + '-error');
        const min = safeParseFloat(minEl.value);
        const max = safeParseFloat(maxEl.value);

        let minValid = true;
        let maxValid = true;

        minEl.style.borderColor = '';
        maxEl.style.borderColor = '';
        minErrorEl.textContent = '';
        maxErrorEl.textContent = '';

        if (!minEl.value || isNaN(min) || min < 0 || min > 5000) {
            minErrorEl.textContent = 'Enter min value (0-5000)';
            minEl.style.borderColor = '#ff4d4d';
            minValid = false;
        }

        if (!maxEl.value || isNaN(max) || max < 0 || max > 5000) {
            maxErrorEl.textContent = 'Enter max value (0-5000)';
            maxEl.style.borderColor = '#ff4d4d';
            maxValid = false;
        }

        if (minValid && maxValid && min >= max) {
            minErrorEl.textContent = 'max > min';
            maxErrorEl.textContent = 'max > min';
            minEl.style.borderColor = '#ff4d4d';
            maxEl.style.borderColor = '#ff4d4d';
            return false;
        }

        return minValid && maxValid;
    }

    updateSwapOptions();
});