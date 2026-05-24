(function(){
    const widget = document.getElementById('weather-widget');
    const emojiEl = widget.querySelector('.weather-emoji');
    const tempEl = widget.querySelector('.weather-temp');
    const locEl = widget.querySelector('.weather-location');
    const zipForm = document.getElementById('weather-zip');
    const zipInput = document.getElementById('zip-input');
    const zipSubmit = document.getElementById('zip-submit');
    const debugEl = document.getElementById('weather-debug');

    function debug(msg) {
        // no-op in production: keep function for calls but do not log
    }

    const US_STATES = {
        'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA','Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA','Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA','Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD','Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT','Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY','District of Columbia':'DC'
    };

    function setLoading() {
        widget.classList.add('weather-loading');
        emojiEl.textContent = '⏳';
        tempEl.textContent = 'Loading';
        locEl.textContent = '';
        debug('Loading: requesting location...');
    }

    function setError(msg) {
        emojiEl.textContent = '❓';
        tempEl.textContent = 'N/A';
        locEl.textContent = '';
        widget.classList.remove('weather-loading');
        debug(msg || 'Error occurred');
    }

    function showZipFallback() {
        widget.classList.add('zip-visible');
        widget.classList.remove('weather-loading');
        zipInput.focus();
        zipInput.select();
        debug('Please enter ZIP code (fallback)');
    }

    function weatherCodeToEmoji(code) {
        if (code === 0) return '☀️';
        if (code === 1 || code === 2) return '🌤️';
        if (code === 3) return '☁️';
        if (code === 45 || code === 48) return '🌫️';
        if (code >= 51 && code <= 55) return '🌦️';
        if (code >= 61 && code <= 67) return '🌧️';
        if (code >= 71 && code <= 77) return '❄️';
        if (code >= 80 && code <= 82) return '🌦️';
        if (code >= 85 && code <= 86) return '🌨️';
        if (code >= 95 && code <= 99) return '⛈️';
        return '🌈';
    }

    function formatLocationFromResult(res) {
        if (!res) return '';
        const name = res.name || '';
        const admin1 = res.admin1 || res.admin2 || '';
        const country = (res.country_code || (res.country && res.country.toUpperCase()) || '').toUpperCase();
        if (country === 'US' && admin1) {
            const abbr = US_STATES[admin1] || (admin1.length === 2 ? admin1.toUpperCase() : null);
            return abbr ? `${name}, ${abbr}` : `${name}, ${admin1}`;
        }
        if (admin1) return `${name}, ${admin1}`;
        if (res.country) return `${name}, ${res.country}`;
        return name;
    }

    function updateWidget(tempF, code, location) {
        emojiEl.textContent = weatherCodeToEmoji(code);
        tempEl.textContent = Math.round(tempF) + '°F';
        if (location) locEl.textContent = location;
        widget.classList.remove('weather-loading');
        debug('Weather updated: ' + Math.round(tempF) + '°F' + (location ? ' — ' + location : ''));
        setTimeout(() => { if (debugEl) debugEl.textContent = ''; }, 5000);
    }

    function reverseGeocode(lat, lon) {
        const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&count=1`;
        return fetch(url).then(r => r.json()).then(data => {
            if (data && data.results && data.results.length) {
                const res = data.results[0];
                const loc = formatLocationFromResult(res);
                return loc || null;
            }
            return null;
        }).catch(err => {
            console.warn('reverse geocode failed', err);
            return null;
        });
    }

    function fetchWeather(lat, lon, knownLocation) {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&temperature_unit=fahrenheit`;
        debug('Fetching weather: ' + url);
        fetch(url).then(r => {
            if (!r.ok) throw new Error('weather fetch failed');
            return r.json();
        }).then(data => {
            debug('Weather response received');
            const cw = data.current_weather;
            if (cw && typeof cw.temperature !== 'undefined') {
                if (knownLocation) {
                    updateWidget(cw.temperature, cw.weathercode, knownLocation);
                } else {
                    reverseGeocode(lat, lon).then(loc => {
                        updateWidget(cw.temperature, cw.weathercode, loc);
                    }).catch(() => {
                        updateWidget(cw.temperature, cw.weathercode);
                    });
                }
            } else {
                debug('No current_weather in response');
                setError('No current weather data');
            }
        }).catch(err => {
            debug('Weather fetch error: ' + (err && err.message));
            setError('Weather fetch failed');
        });
    }

    function geocodeZip(zip) {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(zip)}&count=1&country=US`;
        zipSubmit.disabled = true;
        zipSubmit.textContent = '...';
        fetch(url).then(r => {
            zipSubmit.disabled = false;
            zipSubmit.textContent = 'Go';
            if (!r.ok) throw new Error('geocode failed');
            return r.json();
        }).then(data => {
            if (data && data.results && data.results.length) {
                const res = data.results[0];
                const loc = formatLocationFromResult(res);
                if (loc) locEl.textContent = loc;
                fetchWeather(res.latitude, res.longitude, loc);
                widget.classList.remove('zip-visible');
            } else {
                tempEl.textContent = 'ZIP not found';
            }
        }).catch(err => {
            console.error(err);
            tempEl.textContent = 'Error';
            zipSubmit.disabled = false;
            zipSubmit.textContent = 'Go';
        });
    }

    zipSubmit.addEventListener('click', () => {
        const zip = zipInput.value.trim();
        if (!zip) return;
        setLoading();
        geocodeZip(zip);
    });

    zipInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            zipSubmit.click();
        }
    });

    if ('geolocation' in navigator) {
        const tryGetPosition = () => {
            setLoading();
            debug('Requesting position (browser prompt may appear)...');
            startFallbackTimer();
            navigator.geolocation.getCurrentPosition(pos => {
                debug('Geolocation obtained: ' + pos.coords.latitude.toFixed(4) + ',' + pos.coords.longitude.toFixed(4));
                clearFallbackTimer();
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                fetchWeather(lat, lon);
            }, err => {
                console.warn('Geolocation error', err);
                debug('Geolocation error: ' + (err && err.message) + ' (code ' + (err && err.code) + ')');
                if (err && err.code === 1) {
                    showZipFallback();
                } else {
                    debug('Attempting IP-based fallback...');
                    ipFallback();
                }
            }, {timeout: 15000, maximumAge: 600000, enableHighAccuracy: false});
        };

        function ipFallback() {
            const url = 'https://ipapi.co/json/';
            debug('Fetching IP-based location...');
            fetch(url).then(r => {
                if (!r.ok) throw new Error('IP geolocation failed');
                return r.json();
            }).then(data => {
                if (data && data.latitude && data.longitude) {
                    debug('IP location: ' + data.city + ', ' + data.region + ' (' + data.latitude + ',' + data.longitude + ')');
                    const lat = data.latitude;
                    const lon = data.longitude;
                    const city = data.city || '';
                    const region = data.region || '';
                    if (city && region) locEl.textContent = city + ', ' + region;
                    fetchWeather(lat, lon, (city && region) ? (city + ', ' + region) : null);
                } else {
                    debug('IP fallback returned no coords');
                    showZipFallback();
                }
            }).catch(err => {
                console.warn('IP fallback error', err);
                showZipFallback();
            });
        }

        let fallbackTimer = null;
        const startFallbackTimer = () => {
            clearFallbackTimer();
            fallbackTimer = setTimeout(() => {
                console.warn('Geolocation timed out — showing ZIP fallback');
                showZipFallback();
            }, 8000);
        };
        const clearFallbackTimer = () => { if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; } };

        if (navigator.permissions && navigator.permissions.query) {
            navigator.permissions.query({name: 'geolocation'}).then(status => {
                if (status.state === 'denied') {
                    showZipFallback();
                } else if (status.state === 'granted') {
                    startFallbackTimer();
                    tryGetPosition();
                } else {
                    startFallbackTimer();
                    tryGetPosition();
                }
                try { status.onchange = () => {}; } catch(e){}
            }).catch(err => {
                startFallbackTimer();
                tryGetPosition();
            });
        } else {
            startFallbackTimer();
            tryGetPosition();
        }
    } else {
        showZipFallback();
    }
})();
