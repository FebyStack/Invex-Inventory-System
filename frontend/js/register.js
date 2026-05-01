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

const form = document.getElementById('register-form');
const errorMsg = document.getElementById('error-msg');
const successMsg = document.getElementById('success-msg');
const submitBtn = document.getElementById('submit-btn');
const btnText = document.getElementById('btn-text');
const btnLoader = document.getElementById('btn-loader');

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const full_name = document.getElementById('full_name').value;
    const email = document.getElementById('email').value;
    const username = document.getElementById('username').value;
    const role = document.getElementById('role').value;
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirm_password').value;

    if (password !== confirmPassword) {
        errorMsg.textContent = 'Passwords do not match.';
        errorMsg.style.display = 'block';
        return;
    }

    const payload = { full_name, email, username, role, password };

    errorMsg.style.display = 'none';
    successMsg.style.display = 'none';
    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnLoader.style.display = 'block';

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok && data.success) {
            successMsg.textContent = 'Account created. Redirecting…';
            successMsg.style.display = 'block';
            form.reset();
            setTimeout(() => { window.location.href = 'login.html'; }, 1600);
        } else {
            errorMsg.textContent = data.message || 'Registration failed.';
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
