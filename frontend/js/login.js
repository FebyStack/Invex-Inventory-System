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
            window.location.href = '/dashboard.html';
        } else {
            errorMsg.textContent = data.message || 'Sign-in failed. Please try again.';
            errorMsg.style.display = 'block';
        }
    } catch (err) {
        errorMsg.textContent = 'Unable to connect to server.';
        errorMsg.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
        btnText.style.display = 'block';
        btnLoader.style.display = 'none';
    }
});
