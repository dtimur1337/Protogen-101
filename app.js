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

// Gallery: masonry layout, lazy reveal, and lightbox
(function(){
    const loader = document.getElementById('gallery-loader');
    const container = document.getElementById('gallery-columns');
    if (!container) return;

    const GAP = 24;
    const MAX_THUMB = 500;

    function showLoader(on){ if (loader) loader.style.display = on ? 'block' : 'none'; }

    function createLightbox(){
        const lb = document.createElement('div'); lb.className = 'lightbox';
        lb.innerHTML = '<div class="close" aria-hidden="true">✕</div><img src="" alt="">';
        document.body.appendChild(lb);
        const img = lb.querySelector('img');
        lb.querySelector('.close').addEventListener('click', ()=> lb.classList.remove('active'));
        lb.addEventListener('click', (e)=> { if (e.target === lb) lb.classList.remove('active'); });
        document.addEventListener('keydown', (e)=> { if (e.key === 'Escape') lb.classList.remove('active'); });
        return {el: lb, img};
    }

    const lightbox = createLightbox();
    function openLightbox(src){ lightbox.img.src = src; lightbox.el.classList.add('active'); }

    function buildColumns(n){ container.innerHTML = ''; const cols = []; for (let i=0;i<n;i++){ const c=document.createElement('div'); c.className='gallery-column'; container.appendChild(c); cols.push(c);} return cols; }

    function shortestColumn(cols){
        let idx = 0; let min = Infinity;
        cols.forEach((c,i)=>{ const h = c.scrollHeight || c.offsetHeight || 0; if (h < min){ min = h; idx = i; } });
        return cols[idx];
    }

    function layout(images, thumbW){
        const available = Math.max(document.documentElement.clientWidth || window.innerWidth, container.parentElement.clientWidth || 0);
        const colWidth = (thumbW || MAX_THUMB) + GAP;
        let colsCount = Math.floor((available + GAP) / colWidth);
        colsCount = Math.max(1, Math.min(colsCount, images.length));
        const cols = buildColumns(colsCount);
        images.forEach(img => {
            const target = shortestColumn(cols);
            target.appendChild(img);
        });
    }

    async function loadAndBuild(){
        showLoader(true);
        let list = [];
        // Try a static manifest first (works on Vercel / static hosts)
        try {
            const m = await fetch('/images.json');
            if (m.ok) {
                const json = await m.json();
                if (Array.isArray(json) && json.length) {
                    list = json.slice();
                }
            }
        } catch (e) { /* ignore and fallback */ }

        // Fallback: try directory listing scraping (works for local simple servers)
        if (!list.length) {
            try {
                const res = await fetch('Images/');
                const txt = await res.text();
                const matches = Array.from(txt.matchAll(/href="([^\"]+)"/ig)).map(m=>m[1]);
                const exts = ['.jpg','.jpeg','.png','.webp','.gif','.tif','.tiff'];
                list = matches.filter(n=>exts.some(e=>n.toLowerCase().endsWith(e))).map(f=>`Images/${f}`);
            } catch(e) { list = []; }
        }

        if (!list.length){ showLoader(false); container.innerHTML = '<p style="color:var(--text-light);text-align:center">No images found in Images/</p>'; return; }

        const imgs = list.map(src=>{
            const el = document.createElement('img'); el.alt=''; el.loading='lazy'; el.addEventListener('click', ()=> openLightbox(src)); el.addEventListener('load', ()=> el.classList.add('in-view')); el.onerror = ()=> el.style.display='none'; el.src = src; return el;
        });

        // wait briefly for images to start loading, but don't block too long
        const loads = imgs.map(img => new Promise(res=>{ if (img.complete && img.naturalWidth) return res(); img.addEventListener('load', ()=>res(), {once:true}); img.addEventListener('error', ()=>res(), {once:true}); }));
        await Promise.race([Promise.all(loads), new Promise(r=> setTimeout(r, 700))]);

        // compute representative thumb width from actual loaded natural widths (capped)
        const widths = imgs.map(i=>i.naturalWidth || i.width || MAX_THUMB).filter(Boolean);
        const avg = widths.length ? Math.round(widths.reduce((a,b)=>a+b,0)/widths.length) : MAX_THUMB;
        const thumbW = Math.min(MAX_THUMB, Math.max(80, avg));

        layout(imgs, thumbW);
        showLoader(false);

        const io = new IntersectionObserver(entries=>{ entries.forEach(en=>{ if (en.isIntersecting) en.target.classList.add('in-view'); }); }, {threshold:0.06});
        container.querySelectorAll('img').forEach(i=> io.observe(i));

        let t; window.addEventListener('resize', ()=>{ clearTimeout(t); t = setTimeout(()=>{ const imgsNow = Array.from(container.querySelectorAll('img')); layout(imgsNow, thumbW); }, 220); });
    }

    loadAndBuild();

})();

