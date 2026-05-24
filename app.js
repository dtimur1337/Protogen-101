// Rebuilt weather widget implementation — concise, robust flow
(function(){
    const widget = document.getElementById('weather-widget');
    if (!widget) return;
    const emojiEl = widget.querySelector('.weather-emoji');
    const tempEl = widget.querySelector('.weather-temp');
    const locEl = widget.querySelector('.weather-location');
    const zipForm = document.getElementById('weather-zip');
    const zipInput = document.getElementById('zip-input');
    const zipSubmit = document.getElementById('zip-submit');

    const US_STATES = {
        'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA','Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA','Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA','Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD','Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT','Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY','District of Columbia':'DC'
    };

    function setLoading() {
        widget.classList.add('weather-loading');
        emojiEl.textContent = '⏳';
        tempEl.textContent = 'Loading';
        locEl.textContent = '';
        widget.classList.remove('zip-visible');
    }

    function setError() {
        emojiEl.textContent = '❓';
        tempEl.textContent = 'N/A';
        locEl.textContent = '';
        widget.classList.remove('weather-loading');
    }

    function showZipFallback() {
        widget.classList.add('zip-visible');
        widget.classList.remove('weather-loading');
        zipInput.focus();
        zipInput.select();
    }

    function codeToEmoji(code) {
        if (code === 0) return '☀️';
        if (code === 1 || code === 2) return '🌤️';
        if (code === 3) return '☁️';
        if (code === 45 || code === 48) return '🌫️';
        if (code >= 51 && code <= 67) return '🌧️';
        if (code >= 71 && code <= 77) return '❄️';
        if (code >= 80 && code <= 82) return '🌦️';
        if (code >= 85 && code <= 86) return '🌨️';
        if (code >= 95 && code <= 99) return '⛈️';
        return '🌈';
    }

    function formatLocation(res) {
        if (!res) return '';
        const name = res.name || '';
        const admin = res.admin1 || res.admin2 || '';
        const country = (res.country_code || (res.country && res.country.toUpperCase()) || '').toUpperCase();
        if (country === 'US' && admin) {
            const abbr = US_STATES[admin] || (admin.length === 2 ? admin.toUpperCase() : null);
            return abbr ? `${name}, ${abbr}` : `${name}, ${admin}`;
        }
        if (admin) return `${name}, ${admin}`;
        if (res.country) return `${name}, ${res.country}`;
        return name;
    }

    async function reverseGeocode(lat, lon) {
        try {
            const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&count=1`;
            const r = await fetch(url);
            const data = await r.json();
            if (data && data.results && data.results.length) return formatLocation(data.results[0]);
        } catch (e){}
        return null;
    }

    async function fetchWeather(lat, lon, knownLoc) {
        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&temperature_unit=fahrenheit`;
            const r = await fetch(url);
            if (!r.ok) throw new Error('weather fetch');
            const data = await r.json();
            const cw = data.current_weather;
            if (!cw) throw new Error('no current weather');
            const emoji = codeToEmoji(cw.weathercode);
            const temp = Math.round(cw.temperature) + '°F';
            emojiEl.textContent = emoji;
            tempEl.textContent = temp;
            widget.classList.remove('weather-loading');
            if (knownLoc) {
                locEl.textContent = knownLoc;
            } else {
                const loc = await reverseGeocode(lat, lon);
                if (loc) locEl.textContent = loc;
            }
        } catch (e) {
            setError();
        }
    }

    async function geocodeZip(zip) {
        try {
            const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(zip)}&count=1&country=US`;
            const r = await fetch(url);
            if (!r.ok) throw new Error('geocode');
            const data = await r.json();
            if (data && data.results && data.results.length) {
                const res = data.results[0];
                const loc = formatLocation(res);
                if (loc) locEl.textContent = loc;
                await fetchWeather(res.latitude, res.longitude, loc);
                widget.classList.remove('zip-visible');
                return;
            }
            tempEl.textContent = 'ZIP not found';
        } catch (e) {
            tempEl.textContent = 'Error';
        }
    }

    zipSubmit.addEventListener('click', (e) => {
        const zip = zipInput.value.trim();
        if (!zip) return;
        setLoading();
        geocodeZip(zip);
    });

    zipInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); zipSubmit.click(); }
    });

    function ipFallback() {
        return fetch('https://ipapi.co/json/').then(r => r.json()).then(data => {
            if (data && data.latitude && data.longitude) {
                const city = data.city || '';
                const region = data.region || '';
                const loc = (city && region) ? `${city}, ${region}` : null;
                if (loc) locEl.textContent = loc;
                return fetchWeather(data.latitude, data.longitude, loc);
            }
            showZipFallback();
        }).catch(() => showZipFallback());
    }

    function getPosition(options = {}) {
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, options);
        });
    }

    async function init() {
        setLoading();
        if (!('geolocation' in navigator)) { showZipFallback(); return; }

        if (navigator.permissions && navigator.permissions.query) {
            try {
                const status = await navigator.permissions.query({name:'geolocation'});
                if (status.state === 'denied') { showZipFallback(); return; }
            } catch (e) {}
        }

        try {
            const pos = await getPosition({timeout: 25000, maximumAge: 600000, enableHighAccuracy: false});
            await fetchWeather(pos.coords.latitude, pos.coords.longitude);
        } catch (err) {
            // PERMISSION_DENIED -> show zip; TIMEOUT or other -> try IP fallback
            if (err && err.code === 1) showZipFallback();
            else await ipFallback();
        }
    }

    // start
    init();
})();
