// Theme persistence
const applyTheme = (t) => {
    if (t === 'light') document.body.classList.add('light');
    else document.body.classList.remove('light');
    try { localStorage.setItem('invex_theme', t); } catch {}
    document.querySelectorAll('#theme-mini button').forEach(b => {
        b.classList.toggle('active', b.dataset.theme === t);
    });
};
const stored = (() => { try { return localStorage.getItem('invex_theme'); } catch { return null; } })();
applyTheme(stored || 'dark');
document.querySelectorAll('#theme-mini button').forEach(b => {
    b.addEventListener('click', () => applyTheme(b.dataset.theme));
});

const form = document.getElementById('login-form');
const errorMsg = document.getElementById('error-msg');
const submitBtn = document.getElementById('submit-btn');
const btnText = document.getElementById('btn-text');
const btnLoader = document.getElementById('btn-loader');

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Drop any lingering session from a previous user before signing in.
    // Prevents the new login from inheriting a stale role/token.
    try { sessionStorage.clear(); } catch {}

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    errorMsg.style.display = 'none';
    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoader.style.display = 'block';

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            sessionStorage.setItem('token', data.token);
            sessionStorage.setItem('user', JSON.stringify(data.user));

            // Show page loader and pre-fetch dashboard data
            showPageLoader(data.user);
            await prefetchDashboardData(data.token);
            window.location.href = '/dashboard.html';
        } else {
            errorMsg.textContent = data.message || 'Sign-in failed. Please try again.';
            errorMsg.style.display = 'block';
            submitBtn.disabled = false;
            btnText.style.display = 'block';
            btnLoader.style.display = 'none';
        }
    } catch (err) {
        errorMsg.textContent = 'Unable to connect to server.';
        errorMsg.style.display = 'block';
        submitBtn.disabled = false;
        btnText.style.display = 'block';
        btnLoader.style.display = 'none';
    }
});

// ── Page loader overlay ──────────────────────────────────
function showPageLoader(user) {
    const name = user.full_name || user.username || '';
    const overlay = document.createElement('div');
    overlay.className = 'page-loader-overlay';
    overlay.innerHTML = `
        <div class="page-loader-content">
            <div class="page-loader-brand">
                <img src="/assets/logo.png" alt="Invex Logo" class="page-loader-logo">
                <span>Invex</span>
            </div>
            <div class="page-loader-greeting">Welcome back, ${name.split(' ')[0]}</div>
            <div class="page-loader-spinner">
                <div class="page-loader-ring"></div>
            </div>
            <div class="page-loader-status">Preparing your dashboard…</div>
            <div class="page-loader-steps">
                <div class="page-loader-step active" id="step-auth">
                    <div class="step-dot"></div>
                    <span>Authenticated</span>
                </div>
                <div class="page-loader-step" id="step-data">
                    <div class="step-dot"></div>
                    <span>Loading inventory data</span>
                </div>
                <div class="page-loader-step" id="step-ready">
                    <div class="step-dot"></div>
                    <span>Ready</span>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    // Trigger entrance animation on next frame
    requestAnimationFrame(() => overlay.classList.add('visible'));
}

function updateLoaderStep(stepId, statusText) {
    const step = document.getElementById(stepId);
    const statusEl = document.querySelector('.page-loader-status');
    if (step) step.classList.add('active');
    if (statusEl && statusText) statusEl.textContent = statusText;
}

async function prefetchDashboardData(token) {
    const headers = { 'Authorization': `Bearer ${token}` };
    try {
        // Fetch dashboard summary and low-stock data in parallel
        updateLoaderStep('step-data', 'Loading inventory data…');
        const [dashRes, lowRes] = await Promise.all([
            fetch('/api/reports/dashboard?days=30', { headers }),
            fetch('/api/reports/low-stock', { headers }),
        ]);
        const dashData = await dashRes.json();
        const lowData = await lowRes.json();

        // Cache in sessionStorage so the dashboard can render instantly
        if (dashData.success) {
            sessionStorage.setItem('_dash_cache', JSON.stringify(dashData));
        }
        if (lowData.success) {
            sessionStorage.setItem('_low_cache', JSON.stringify(lowData));
        }

        updateLoaderStep('step-ready', 'Ready — redirecting…');
        // Brief pause so the user sees the "Ready" state
        await new Promise((r) => setTimeout(r, 400));
    } catch {
        // If prefetch fails, still proceed — dashboard will fetch on its own
        updateLoaderStep('step-ready', 'Redirecting…');
        await new Promise((r) => setTimeout(r, 200));
    }
}
