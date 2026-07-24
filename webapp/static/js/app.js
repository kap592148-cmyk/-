// ==================== AUTH ====================

// Текущий пользователь (хранится в localStorage)
let currentUser = null;

async function loadUser() {
    const data = localStorage.getItem('kriscom_user');
    if (data) {
        try {
            currentUser = JSON.parse(data);
            // Проверяем, существует ли ещё пользователь в БД
            const resp = await fetch('/api/profile/' + currentUser.id);
            if (resp.ok) {
                const result = await resp.json();
                currentUser = result.user;
                localStorage.setItem('kriscom_user', JSON.stringify(currentUser));
            } else {
                currentUser = null;
                localStorage.removeItem('kriscom_user');
            }
            updateProfileUI();
            updateAdminUI();
        } catch (e) {
            currentUser = null;
            localStorage.removeItem('kriscom_user');
            updateProfileUI();
        }
    }
}

function saveUser(user) {
    currentUser = user;
    localStorage.setItem('kriscom_user', JSON.stringify(user));
    updateProfileUI();
    updateAdminUI();
}

function logout() {
    currentUser = null;
    localStorage.removeItem('kriscom_user');
    updateProfileUI();
    switchScreen('screen-home');
}

function handleLogout() {
    logout();
}

function updateProfileUI() {
    const guestBlock = document.getElementById('profile-guest');
    const authBlock = document.getElementById('profile-authorized');
    const nameEl = document.querySelector('#profile-authorized .profile-name');
    const phoneEl = document.querySelector('#profile-authorized .profile-phone');
    const bonusEl = document.getElementById('profile-bonus');
    const avatarEl = document.getElementById('profile-avatar-display');

    if (currentUser) {
        if (guestBlock) guestBlock.style.display = 'none';
        if (authBlock) authBlock.style.display = 'block';
        if (nameEl) nameEl.textContent = currentUser.first_name || currentUser.login;
        if (phoneEl) phoneEl.textContent = currentUser.phone || currentUser.login;
        if (bonusEl) bonusEl.textContent = (currentUser.bonus_points || 0) + ' ₽';
        if (avatarEl) {
            if (currentUser.photo) {
                avatarEl.innerHTML = `<img src="${currentUser.photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
            } else {
                avatarEl.innerHTML = '<svg width="56" height="56" viewBox="0 0 56 56" fill="none" stroke="white" stroke-width="1.3" opacity="0.8"><circle cx="28" cy="20" r="11"/><path d="M12 48C12 39 18 33 28 33C38 33 44 39 44 48"/><path d="M22 18C24 16 32 16 34 18"/></svg>';
            }
        }
    } else {
        if (guestBlock) guestBlock.style.display = 'block';
        if (authBlock) authBlock.style.display = 'none';
    }
}

async function uploadAvatar(input) {
    const file = input.files[0];
    if (!file || !currentUser) return;

    const formData = new FormData();
    formData.append('photo', file);

    try {
        const resp = await fetch(`/api/profile/${currentUser.id}/avatar`, {
            method: 'POST',
            body: formData,
        });
        const data = await resp.json();
        if (data.ok) {
            currentUser.photo = data.photo;
            localStorage.setItem('kriscom_user', JSON.stringify(currentUser));
            updateProfileUI();
        }
    } catch (err) {
        console.error('Ошибка загрузки аватарки:', err);
    }
    input.value = '';
}

// ==================== IMAGE ZOOM ====================
let currentZoom = 1;
let panX = 0;
let panY = 0;
let lastTouchDist = 0;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;

function openImageZoom(src) {
    const modal = document.getElementById('image-zoom-modal');
    const img = document.getElementById('image-zoom-img');
    img.src = src;
    currentZoom = 1;
    panX = 0;
    panY = 0;
    updateZoomTransform(img);
    modal.classList.add('active');
}

function closeImageZoom(e) {
    if (e) e.stopPropagation();
    document.getElementById('image-zoom-modal').classList.remove('active');
}

function zoomImage(dir) {
    currentZoom = Math.max(0.5, Math.min(5, currentZoom + dir * 0.5));
    if (currentZoom === 1) { panX = 0; panY = 0; }
    const img = document.getElementById('image-zoom-img');
    const levelEl = document.getElementById('image-zoom-level');
    updateZoomTransform(img);
    if (levelEl) levelEl.textContent = Math.round(currentZoom * 100) + '%';
}

function updateZoomTransform(img) {
    img.style.transform = `translate(${panX}px, ${panY}px) scale(${currentZoom})`;
}

(function initZoomGestures() {
    document.addEventListener('DOMContentLoaded', () => {
        const container = document.getElementById('image-zoom-container');
        const img = document.getElementById('image-zoom-img');
        if (!container || !img) return;

        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            zoomImage(e.deltaY < 0 ? 1 : -1);
        }, { passive: false });

        container.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                lastTouchDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
            } else if (e.touches.length === 1 && currentZoom > 1) {
                isDragging = true;
                dragStartX = e.touches[0].clientX - panX;
                dragStartY = e.touches[0].clientY - panY;
            }
        });

        container.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (e.touches.length === 2) {
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                const delta = dist / lastTouchDist;
                currentZoom = Math.max(0.5, Math.min(5, currentZoom * delta));
                lastTouchDist = dist;
                updateZoomTransform(img);
            } else if (e.touches.length === 1 && isDragging) {
                panX = e.touches[0].clientX - dragStartX;
                panY = e.touches[0].clientY - dragStartY;
                updateZoomTransform(img);
            }
        }, { passive: false });

        container.addEventListener('touchend', () => {
            isDragging = false;
        });

        container.addEventListener('mousedown', (e) => {
            if (currentZoom > 1) {
                isDragging = true;
                dragStartX = e.clientX - panX;
                dragStartY = e.clientY - panY;
                container.style.cursor = 'grabbing';
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            panX = e.clientX - dragStartX;
            panY = e.clientY - dragStartY;
            updateZoomTransform(img);
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            if (container) container.style.cursor = '';
        });
    });
})();

// ==================== WELCOME IMAGE PROPS ====================
let IMAGE_BASE_W = 200, IMAGE_BASE_H = 240;

function onImagePropChange() {
    const scale = document.getElementById('img-scale').value;
    const r = document.getElementById('img-right').value;
    const b = document.getElementById('img-bottom').value;
    const w = Math.round(IMAGE_BASE_W * scale / 100);
    const h = Math.round(IMAGE_BASE_H * scale / 100);
    document.getElementById('val-scale').textContent = scale + '%';
    document.getElementById('val-right').textContent = r + 'px';
    document.getElementById('val-bottom').textContent = b + 'px';
    const img = document.getElementById('welcome-illustration');
    if (img) {
        img.style.width = w + 'px';
        img.style.height = h + 'px';
        img.style.right = r + 'px';
        img.style.bottom = b + 'px';
    }
}

async function saveImageProps() {
    const scale = parseInt(document.getElementById('img-scale').value);
    const r = parseInt(document.getElementById('img-right').value);
    const b = parseInt(document.getElementById('img-bottom').value);
    const w = Math.round(IMAGE_BASE_W * scale / 100);
    const h = Math.round(IMAGE_BASE_H * scale / 100);
    try {
        await fetch('/api/welcome-props', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ width: w, height: h, right: r, bottom: b }),
        });
    } catch (err) {}
}

async function loadWelcomeProps() {
    try {
        const resp = await fetch('/api/welcome-props');
        const data = await resp.json();
        if (data.ok) {
            const w = data.width || IMAGE_BASE_W;
            const h = data.height || IMAGE_BASE_H;
            const r = data.right || 0;
            const b = data.bottom || 0;
            const scale = Math.round((w / IMAGE_BASE_W) * 100);
            const img = document.getElementById('welcome-illustration');
            if (img) {
                img.style.width = w + 'px';
                img.style.height = h + 'px';
                img.style.right = r + 'px';
                img.style.bottom = b + 'px';
            }
            const ss = document.getElementById('img-scale');
            const sr = document.getElementById('img-right');
            const sb = document.getElementById('img-bottom');
            if (ss) ss.value = scale;
            if (sr) sr.value = r;
            if (sb) sb.value = b;
            onImagePropChange();
        }
    } catch (err) {}
}

function showAdminImageControls() {
    if (currentUser && currentUser.is_admin) {
        const controls = document.getElementById('admin-image-controls');
        if (controls) controls.style.display = 'block';
    }
}

// ==================== WELCOME IMAGE ====================
async function uploadWelcomeImage(input) {
    const file = input.files[0];
    if (!file) return;

    const resultEl = document.getElementById('welcome-image-result');
    const labelEl = document.getElementById('welcome-image-label');
    const previewEl = document.getElementById('admin-welcome-preview');

    labelEl.textContent = 'Загрузка...';
    resultEl.style.display = 'none';

    const formData = new FormData();
    formData.append('photo', file);

    try {
        const resp = await fetch('/api/admin/welcome-image', {
            method: 'POST',
            body: formData,
        });
        const data = await resp.json();
        if (data.ok) {
            resultEl.style.display = 'block';
            resultEl.style.color = '#4CAF50';
            resultEl.textContent = 'Изображение обновлено!';
            labelEl.textContent = 'Заменить изображение';

            const ts = Date.now();
            previewEl.src = data.url + '?t=' + ts;

            const homeImg = document.querySelector('.welcome-illustration');
            if (homeImg) homeImg.src = data.url + '?t=' + ts;
            showAdminImageControls();
        } else {
            resultEl.style.display = 'block';
            resultEl.style.color = '#E74C3C';
            resultEl.textContent = 'Ошибка';
            labelEl.textContent = 'Заменить изображение';
        }
    } catch (err) {
        resultEl.style.display = 'block';
        resultEl.style.color = '#E74C3C';
        resultEl.textContent = 'Ошибка сети';
        labelEl.textContent = 'Заменить изображение';
    }
    input.value = '';
}

// Показ/скрытие пароля
function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;

    if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    } else {
        input.type = 'password';
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    }
}

// Очистка ошибок
function clearErrors(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.querySelectorAll('.auth-error').forEach(el => {
        el.textContent = '';
        el.classList.remove('visible');
    });
    form.querySelectorAll('.auth-input').forEach(el => {
        el.classList.remove('error');
    });
}

function showFieldError(fieldId, message) {
    const input = document.getElementById(fieldId);
    const errorEl = document.getElementById(fieldId + '-error');
    if (input) input.classList.add('error');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.add('visible');
    }
}

// Регистрация
async function handleRegister(e) {
    e.preventDefault();
    clearErrors('register-form');

    const name = document.getElementById('reg-name').value.trim();
    const login = document.getElementById('reg-login').value.trim();
    const password = document.getElementById('reg-password').value;
    const password2 = document.getElementById('reg-password2').value;

    let valid = true;

    if (login.length < 3) {
        showFieldError('reg-login', 'Логин должен быть от 3 символов');
        valid = false;
    }
    if (password.length < 4) {
        showFieldError('reg-password', 'Пароль должен быть от 4 символов');
        valid = false;
    }
    if (password !== password2) {
        showFieldError('reg-password2', 'Пароли не совпадают');
        valid = false;
    }
    if (!name) {
        showFieldError('reg-name', 'Введите имя');
        valid = false;
    }

    if (!valid) return;

    const btn = document.getElementById('reg-submit');
    btn.classList.add('loading');
    btn.disabled = true;

    try {
        const resp = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                login: login,
                password: password,
                first_name: name,
            }),
        });

        const data = await resp.json();

        if (!resp.ok) {
            showFieldError('reg-login', data.detail || 'Ошибка регистрации');
            return;
        }

        saveUser(data.user);
        switchScreen('screen-home');
    } catch (err) {
        showFieldError('reg-login', 'Ошибка сети. Попробуйте снова.');
    } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
    }
}

// Вход
async function handleLogin(e) {
    e.preventDefault();
    clearErrors('login-form');

    const login = document.getElementById('login-login').value.trim();
    const password = document.getElementById('login-password').value;

    let valid = true;

    if (!login) {
        showFieldError('login-login', 'Введите логин');
        valid = false;
    }
    if (!password) {
        showFieldError('login-password', 'Введите пароль');
        valid = false;
    }

    if (!valid) return;

    const btn = document.getElementById('login-submit');
    btn.classList.add('loading');
    btn.disabled = true;

    try {
        const resp = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login, password }),
        });

        const data = await resp.json();

        if (!resp.ok) {
            showFieldError('login-password', data.detail || 'Неверный логин или пароль');
            return;
        }

        saveUser(data.user);
        switchScreen('screen-home');
    } catch (err) {
        showFieldError('login-password', 'Ошибка сети. Попробуйте снова.');
    } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
    }
}

// ==================== NAVIGATION ====================
function switchScreen(screenId) {
    // Deactivate all screens
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });

    // Activate target screen
    const target = document.getElementById(screenId);
    if (target) {
        target.classList.add('active');
    }

    // Update bottom nav active state
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    const activeNav = document.querySelector(`.nav-item[data-screen="${screenId}"]`);
    if (activeNav) {
        activeNav.classList.add('active');
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Сброс шагов записи
    if (screenId === 'screen-booking') {
        setBookingStep(1);
    }
}

// Bottom nav click handlers
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const screenId = item.getAttribute('data-screen');
            if (screenId) {
                switchScreen(screenId);
            }
        });
    });
});

// ==================== FILTER TABS (Promos) ====================
function filterPromos(tab, category) {
    // Update active tab
    document.querySelectorAll('.filter-tab').forEach(t => {
        t.classList.remove('active');
    });
    tab.classList.add('active');

    // Filter promo cards
    document.querySelectorAll('.promo-card').forEach(card => {
        if (category === 'all') {
            card.style.display = 'flex';
        } else {
            const cardCategory = card.getAttribute('data-category');
            card.style.display = (cardCategory === category) ? 'flex' : 'none';
        }
    });
}

// ==================== PROMOS PUBLIC ====================
const PROMO_COLORS = {
    discount: 'linear-gradient(145deg, #E8D5B7 0%, #D4B87A 100%)',
    gift: 'linear-gradient(145deg, #E8F0F8 0%, #D0E0F0 100%)',
    complex: 'linear-gradient(145deg, #F5E6D3 0%, #E8D5B7 100%)',
};
const PROMO_SVG = {
    discount: '<svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="white" stroke-width="1.2" opacity="0.75"><path d="M22 8C15 8 10 15 10 22C10 29 15 36 22 36C29 36 34 29 34 22C34 15 29 8 22 8Z"/><path d="M15 17C17 13 27 13 29 17"/><path d="M13 24C17 22 27 22 31 24"/></svg>',
    gift: '<svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="#C9A96E" stroke-width="1.2"><circle cx="22" cy="16" r="8"/><path d="M10 32C10 26 15 23 22 23C29 23 34 26 34 32"/><path d="M16 14C18 12 26 12 28 14"/></svg>',
    complex: '<svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="white" stroke-width="1.2" opacity="0.75"><rect x="14" y="8" width="16" height="28" rx="5"/><line x1="19" y1="18" x2="25" y2="18"/><line x1="22" y1="10" x2="22" y2="26"/></svg>',
};

let allPromos = [];

async function loadPromos() {
    const container = document.getElementById('promo-list');
    if (!container) return;

    try {
        const resp = await fetch('/api/promos');
        const data = await resp.json();
        if (!resp.ok || !data.promos.length) {
            container.innerHTML = '<div class="bookings-empty" style="padding:40px 20px"><p>Акций пока нет</p></div>';
            return;
        }
        allPromos = data.promos;
        renderPromos(allPromos);
    } catch (err) {
        container.innerHTML = '<div class="bookings-empty" style="padding:40px 20px"><p>Ошибка загрузки</p></div>';
    }
}

function renderPromos(promos) {
    const container = document.getElementById('promo-list');
    if (!container) return;

    container.innerHTML = promos.map(p => `
        <div class="promo-card" data-category="${p.category}" onclick="openPromo(${p.id})">
            ${p.badge ? `<span class="promo-badge ${p.badge_type}">${p.badge}</span>` : ''}
            <div class="promo-image">
                <img src="/static/img/${p.icon || 'icon-promos.png'}" alt="" width="56" height="56" style="border-radius:12px">
            </div>
            <div class="promo-info">
                <div class="promo-name">${p.title}</div>
                ${p.expiry ? `<div class="promo-expiry">${p.expiry}</div>` : ''}
            </div>
            <span class="promo-arrow">&rsaquo;</span>
        </div>
    `).join('');
}

// ==================== BOOKING ====================
const ALL_SLOTS = ['09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00'];
let booking = {
    service: null,
    master: 'Кристина',
    date: null,
    time: null,
};

function setBookingStep(step) {
    document.querySelectorAll('.booking-step').forEach(el => {
        el.style.display = 'none';
    });
    const target = document.getElementById('booking-step-' + step);
    if (target) target.style.display = 'block';

    document.querySelectorAll('.steps-indicator .step-item').forEach(el => {
        const s = parseInt(el.getAttribute('data-step'));
        el.classList.toggle('active', s === step);
    });
}

function pickService(name) {
    booking.service = name;
    setBookingStep(2);
    const dateInput = document.getElementById('book-date');
    if (dateInput && !dateInput.value) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
        dateInput.min = `${yyyy}-${mm}-${dd}`;
        onDateChange();
    }
}

function onDateChange() {
    const dateInput = document.getElementById('book-date');
    if (dateInput && dateInput.value) {
        booking.date = dateInput.value;
        booking.time = null;
        loadAvailableSlots(dateInput.value);
    }
}

async function loadAvailableSlots(date) {
    const container = document.getElementById('time-slots');
    if (!container) return;

    container.innerHTML = '<div class="bookings-loading"><div class="spinner" style="width:24px;height:24px;border-width:2px;margin:10px auto"></div></div>';

    try {
        const resp = await fetch(`/api/slots?date=${date}`);
        const data = await resp.json();
        const booked = data.booked || [];

        container.innerHTML = ALL_SLOTS.map(time => {
            const disabled = booked.includes(time);
            return `<button type="button" class="time-slot ${disabled ? 'disabled' : ''}" 
                ${disabled ? 'disabled' : `onclick="pickTime(this)"`}>${time}</button>`;
        }).join('');
    } catch (err) {
        container.innerHTML = ALL_SLOTS.map(time =>
            `<button type="button" class="time-slot" onclick="pickTime(this)">${time}</button>`
        ).join('');
    }
}

function pickTime(btn) {
    document.querySelectorAll('#time-slots .time-slot').forEach(el => el.classList.remove('selected'));
    btn.classList.add('selected');
    booking.time = btn.textContent;
}

function formatPhone(input) {
    let v = input.value.replace(/\D/g, '');
    if (v.length === 0) { input.value = ''; return; }
    if (v[0] === '8') v = '7' + v.slice(1);
    if (v[0] !== '7') v = '7' + v;

    let formatted = '+7';
    if (v.length > 1) formatted += ' ' + v.slice(1, 4);
    if (v.length > 4) formatted += ' ' + v.slice(4, 7);
    if (v.length > 7) formatted += ' ' + v.slice(7, 9);
    if (v.length > 9) formatted += ' ' + v.slice(9, 11);

    input.value = formatted;
}

function isValidPhone(phone) {
    const digits = phone.replace(/\D/g, '');
    return digits.length === 11 && digits[0] === '7';
}

async function submitBooking() {
    if (!currentUser) {
        switchScreen('screen-login');
        return;
    }

    const dateInput = document.getElementById('book-date');
    const phoneInput = document.getElementById('book-phone');
    const commentInput = document.getElementById('book-comment');

    booking.date = dateInput ? dateInput.value : null;
    const phone = phoneInput ? phoneInput.value.trim() : '';
    const comment = commentInput ? commentInput.value.trim() : null;

    if (!booking.date) {
        alert('Выберите дату');
        return;
    }
    if (!booking.time) {
        alert('Выберите время');
        return;
    }
    if (!phone || !isValidPhone(phone)) {
        alert('Введите номер телефона в формате +7 999 123 45 67');
        return;
    }

    const submitBtn = document.querySelector('#booking-step-2 .auth-submit');
    if (submitBtn) {
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;
    }

    try {
        const resp = await fetch('/api/book', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUser.id,
                service: booking.service,
                master: booking.master,
                date: booking.date,
                time: booking.time,
                phone: phone,
                comment: comment,
            }),
        });

        const data = await resp.json();

        if (!resp.ok) {
            alert(data.detail || 'Ошибка при создании записи');
            return;
        }

        const successText = document.getElementById('booking-success-text');
        if (successText) {
            successText.textContent =
                `${booking.service} — ${booking.date} в ${booking.time}. ` +
                `Мастер: Кристина. ` +
                `Мы свяжемся с вами для подтверждения.`;
        }

        setBookingStep(3);
    } catch (err) {
        alert('Ошибка сети. Попробуйте снова.');
    } finally {
        if (submitBtn) {
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
        }
    }
}

function resetBooking() {
    booking = { service: null, master: 'Кристина', date: null, time: null };
    document.querySelectorAll('#time-slots .time-slot').forEach(el => el.classList.remove('selected'));
    const dateInput = document.getElementById('book-date');
    if (dateInput) dateInput.value = '';
    const phoneInput = document.getElementById('book-phone');
    if (phoneInput) phoneInput.value = '';
    const commentInput = document.getElementById('book-comment');
    if (commentInput) commentInput.value = '';
    setBookingStep(1);
}

// ==================== PROMO CLICK ====================
function openPromo(promoId) {
    console.log('Open promo:', promoId);
    // TODO: Open promo detail modal
}

// ==================== ADMIN ====================
const STATUS_LABELS = {
    new: 'Ожидает',
    confirmed: 'Подтверждена',
    rejected: 'Отклонена',
    completed: 'Завершена',
};

let adminBookings = [];
let adminFilter = 'new';
let currentAdminBookingId = null;
let modalSelectedTime = null;

function updateAdminUI() {
    const adminBtn = document.querySelector('.admin-panel-btn');
    if (adminBtn) {
        adminBtn.style.display = (currentUser && currentUser.is_admin) ? 'flex' : 'none';
    }
}

async function loadAdminBookings() {
    const container = document.getElementById('admin-bookings-list');
    if (!container) return;

    container.innerHTML = '<div class="bookings-loading"><div class="spinner" style="width:32px;height:32px;border-width:3px;margin:40px auto"></div></div>';

    try {
        const resp = await fetch('/api/admin/bookings');
        const data = await resp.json();
        if (!resp.ok) {
            container.innerHTML = '<div class="bookings-empty"><p>Ошибка загрузки</p></div>';
            return;
        }
        adminBookings = data.bookings;
        renderAdminBookings();
    } catch (err) {
        container.innerHTML = '<div class="bookings-empty"><p>Ошибка сети</p></div>';
    }
}

function filterAdminBookings(tab, filter) {
    document.querySelectorAll('#screen-admin .filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    adminFilter = filter;
    renderAdminBookings();
}

function renderAdminBookings() {
    const container = document.getElementById('admin-bookings-list');
    if (!container) return;

    const filtered = adminFilter === 'all'
        ? adminBookings
        : adminBookings.filter(b => b.status === adminFilter);

    if (!filtered.length) {
        container.innerHTML = '<div class="bookings-empty"><p>Нет записей</p></div>';
        return;
    }

    container.innerHTML = filtered.map(b => {
        const statusClass = b.status;
        const statusText = STATUS_LABELS[b.status] || b.status;
        const masterLine = b.master ? `<span>👤 ${b.master}</span>` : '';
        const phoneLine = b.phone ? `<span>📞 ${b.phone}</span>` : '';
        const commentLine = b.comment ? `<span>💬 ${b.comment}</span>` : '';
        const confirmedLine = b.confirmed_time ? `<span>🕐 Подтверждено: <b>${b.confirmed_time}</b></span>` : '';
        const rejectLine = b.reject_reason ? `<div class="booking-card-reject-reason">Причина: ${b.reject_reason}</div>` : '';

        const actionsHtml = b.status === 'new' ? `
            <div class="admin-card-actions">
                <button class="admin-btn admin-btn-confirm" onclick="openConfirmModal(${b.id})">Подтвердить</button>
                <button class="admin-btn admin-btn-reject" onclick="openRejectModal(${b.id})">Отклонить</button>
            </div>
        ` : b.status === 'confirmed' ? `
            <div class="admin-card-actions">
                <button class="admin-btn admin-btn-confirm" style="background:#27AE60" onclick="completeBooking(${b.id})">Завершить</button>
            </div>
        ` : '';

        return `
            <div class="admin-card">
                <div class="admin-card-header">
                    <span class="admin-card-id">#${b.id} &middot; ${b.client_name} (@${b.client_login})</span>
                    <span class="booking-card-status ${statusClass}">${statusText}</span>
                </div>
                <div class="admin-card-service">${b.service}</div>
                <div class="admin-card-details">
                    <span>📅 ${b.date} в ${b.time}</span>
                    ${masterLine}
                    ${phoneLine}
                    ${commentLine}
                    ${confirmedLine}
                </div>
                ${rejectLine}
                ${actionsHtml}
            </div>
        `;
    }).join('');
}

// ==================== MODALS ====================
function openConfirmModal(bookingId) {
    currentAdminBookingId = bookingId;
    modalSelectedTime = null;
    document.getElementById('modal-time-slots').innerHTML = '';
    document.getElementById('modal-confirm-body').style.display = 'block';
    document.getElementById('modal-reject-body').style.display = 'none';
    document.getElementById('modal-title').textContent = 'Подтвердить запись';
    document.getElementById('confirm-modal').classList.add('active');

    const booking = adminBookings.find(b => b.id === bookingId);
    if (booking) {
        loadModalSlots(booking.date);
    }
}

async function loadModalSlots(date) {
    const container = document.getElementById('modal-time-slots');
    container.innerHTML = '<div class="bookings-loading"><div class="spinner" style="width:24px;height:24px;border-width:2px;margin:10px auto"></div></div>';
    try {
        const resp = await fetch(`/api/slots?date=${date}`);
        const data = await resp.json();
        const booked = data.booked || [];
        container.innerHTML = ALL_SLOTS.map(time => {
            const disabled = booked.includes(time);
            return `<button type="button" class="time-slot ${disabled ? 'disabled' : ''}" 
                ${disabled ? 'disabled' : `onclick="pickModalTime(this)"`}>${time}</button>`;
        }).join('');
    } catch (err) {
        container.innerHTML = ALL_SLOTS.map(time =>
            `<button type="button" class="time-slot" onclick="pickModalTime(this)">${time}</button>`
        ).join('');
    }
}

function openRejectModal(bookingId) {
    currentAdminBookingId = bookingId;
    document.getElementById('reject-reason').value = '';
    document.getElementById('modal-confirm-body').style.display = 'none';
    document.getElementById('modal-reject-body').style.display = 'block';
    document.getElementById('modal-title').textContent = 'Отклонить запись';
    document.getElementById('confirm-modal').classList.add('active');
}

function closeModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('confirm-modal').classList.remove('active');
    currentAdminBookingId = null;
}

function pickModalTime(btn) {
    document.querySelectorAll('#modal-time-slots .time-slot').forEach(el => el.classList.remove('selected'));
    btn.classList.add('selected');
    modalSelectedTime = btn.textContent;
}

async function confirmBooking() {
    if (!modalSelectedTime) {
        alert('Выберите время');
        return;
    }
    if (!currentAdminBookingId) return;

    const btn = document.getElementById('modal-confirm-btn');
    btn.classList.add('loading');
    btn.disabled = true;

    try {
        const resp = await fetch(`/api/admin/bookings/${currentAdminBookingId}/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ confirmed_time: modalSelectedTime }),
        });

        if (!resp.ok) {
            const data = await resp.json();
            alert(data.detail || 'Ошибка');
            return;
        }

        closeModal();
        await loadAdminBookings();
    } catch (err) {
        alert('Ошибка сети');
    } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
    }
}

async function rejectBooking() {
    if (!currentAdminBookingId) return;

    const reason = document.getElementById('reject-reason').value.trim();

    try {
        const resp = await fetch(`/api/admin/bookings/${currentAdminBookingId}/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: reason || null }),
        });

        if (!resp.ok) {
            const data = await resp.json();
            alert(data.detail || 'Ошибка');
            return;
        }

        closeModal();
        await loadAdminBookings();
    } catch (err) {
        alert('Ошибка сети');
    }
}

async function completeBooking(bookingId) {
    if (!confirm('Завершить запись?')) return;

    try {
        const resp = await fetch(`/api/admin/bookings/${bookingId}/complete`, {
            method: 'POST',
        });

        if (!resp.ok) {
            const data = await resp.json();
            alert(data.detail || 'Ошибка');
            return;
        }

        await loadAdminBookings();
    } catch (err) {
        alert('Ошибка сети');
    }
}

// ==================== BONUS ====================
async function giveBonus() {
    const loginInput = document.getElementById('bonus-login');
    const amountInput = document.getElementById('bonus-amount');
    const resultEl = document.getElementById('bonus-result');

    const login = loginInput.value.trim().replace('@', '');
    const amount = parseInt(amountInput.value);

    if (!login) {
        resultEl.style.display = 'block';
        resultEl.style.color = '#E74C3C';
        resultEl.textContent = 'Введите юзернейм';
        return;
    }
    if (!amount || amount <= 0) {
        resultEl.style.display = 'block';
        resultEl.style.color = '#E74C3C';
        resultEl.textContent = 'Введите количество бонусов';
        return;
    }

    try {
        const resp = await fetch('/api/admin/bonus', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login, amount }),
        });

        const data = await resp.json();

        if (!resp.ok) {
            resultEl.style.display = 'block';
            resultEl.style.color = '#E74C3C';
            resultEl.textContent = data.detail || 'Ошибка';
            return;
        }

        resultEl.style.display = 'block';
        resultEl.style.color = '#27AE60';
        resultEl.textContent = `+${amount} бонусов → @${login} (всего: ${data.bonus_points})`;
        loginInput.value = '';
        amountInput.value = '';
    } catch (err) {
        resultEl.style.display = 'block';
        resultEl.style.color = '#E74C3C';
        resultEl.textContent = 'Ошибка сети';
    }
}

async function spendBonus() {
    const loginInput = document.getElementById('spend-login');
    const amountInput = document.getElementById('spend-amount');
    const resultEl = document.getElementById('spend-result');

    const login = loginInput.value.trim().replace('@', '');
    const amount = parseInt(amountInput.value);

    if (!login) {
        resultEl.style.display = 'block';
        resultEl.style.color = '#E74C3C';
        resultEl.textContent = 'Введите юзернейм';
        return;
    }
    if (!amount || amount <= 0) {
        resultEl.style.display = 'block';
        resultEl.style.color = '#E74C3C';
        resultEl.textContent = 'Введите количество бонусов';
        return;
    }

    try {
        const resp = await fetch('/api/admin/bonus/spend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login, amount }),
        });

        const data = await resp.json();

        if (!resp.ok) {
            resultEl.style.display = 'block';
            resultEl.style.color = '#E74C3C';
            resultEl.textContent = data.detail || 'Ошибка';
            return;
        }

        resultEl.style.display = 'block';
        resultEl.style.color = '#27AE60';
        resultEl.textContent = `-${amount} бонусов ← @${login} (всего: ${data.bonus_points})`;
        loginInput.value = '';
        amountInput.value = '';
    } catch (err) {
        resultEl.style.display = 'block';
        resultEl.style.color = '#E74C3C';
        resultEl.textContent = 'Ошибка сети';
    }
}

// ==================== ADMIN TABS ====================
function switchAdminTab(tab, section) {
    document.querySelectorAll('#screen-admin .filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    document.getElementById('admin-tab-bookings').style.display = section === 'bookings' ? 'block' : 'none';
    document.getElementById('admin-tab-promos').style.display = section === 'promos' ? 'block' : 'none';
    document.getElementById('admin-tab-services').style.display = section === 'services' ? 'block' : 'none';

    if (section === 'promos') loadAdminPromos();
    if (section === 'services') loadAdminServices();
}

// ==================== PROMOS CRUD ====================
async function createPromo() {
    const titleInput = document.getElementById('promo-title');
    const badgeInput = document.getElementById('promo-badge');
    const expiryInput = document.getElementById('promo-expiry');
    const categoryInput = document.getElementById('promo-category');
    const iconInput = document.getElementById('promo-icon');
    const resultEl = document.getElementById('promo-result');

    const title = titleInput.value.trim();
    if (!title) {
        resultEl.style.display = 'block';
        resultEl.style.color = '#E74C3C';
        resultEl.textContent = 'Введите название акции';
        return;
    }

    const badge = badgeInput.value.trim() || null;
    const expiry = expiryInput.value.trim() || null;
    const category = categoryInput.value;
    const icon = iconInput.value;

    let badgeType = 'discount';
    if (category === 'gift') badgeType = 'gift';
    if (category === 'complex') badgeType = 'complex';

    try {
        const resp = await fetch('/api/admin/promos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, badge, badge_type: badgeType, expiry, category, icon }),
        });

        const data = await resp.json();
        if (!resp.ok) {
            resultEl.style.display = 'block';
            resultEl.style.color = '#E74C3C';
            resultEl.textContent = data.detail || 'Ошибка';
            return;
        }

        resultEl.style.display = 'block';
        resultEl.style.color = '#27AE60';
        resultEl.textContent = 'Акция добавлена!';
        titleInput.value = '';
        badgeInput.value = '';
        expiryInput.value = '';
        loadAdminPromos();
    } catch (err) {
        resultEl.style.display = 'block';
        resultEl.style.color = '#E74C3C';
        resultEl.textContent = 'Ошибка сети';
    }
}

async function loadAdminPromos() {
    const container = document.getElementById('admin-promos-list');
    if (!container) return;

    container.innerHTML = '<div class="bookings-loading"><div class="spinner" style="width:32px;height:32px;border-width:3px;margin:40px auto"></div></div>';

    try {
        const resp = await fetch('/api/promos');
        const data = await resp.json();
        if (!resp.ok || !data.promos.length) {
            container.innerHTML = '<div class="bookings-empty"><p>Нет акций</p></div>';
            return;
        }

        const CATEGORY_LABELS = { discount: 'Скидки', complex: 'Комплексы', gift: 'Подарки' };

        container.innerHTML = data.promos.map(p => `
            <div class="admin-card" style="margin-bottom:12px">
                <div style="display:flex;align-items:center;gap:12px">
                    <img src="/static/img/${p.icon || 'icon-promos.png'}" width="40" height="40" style="border-radius:10px;background:#f5f0e8;padding:4px">
                    <div style="flex:1">
                        <div class="admin-card-header" style="margin-bottom:4px">
                            <span class="admin-card-service" style="margin:0">${p.title}</span>
                            ${p.badge ? `<span class="promo-badge ${p.badge_type}" style="font-size:12px">${p.badge}</span>` : ''}
                        </div>
                        <div style="font-size:13px;color:var(--text-light)">
                            📂 ${CATEGORY_LABELS[p.category] || p.category}
                            ${p.expiry ? ` · 📅 ${p.expiry}` : ''}
                        </div>
                    </div>
                </div>
                <button class="admin-btn admin-btn-reject" style="width:100%;margin-top:10px" onclick="deletePromo(${p.id})">Удалить</button>
            </div>
        `).join('');
    } catch (err) {
        container.innerHTML = '<div class="bookings-empty"><p>Ошибка сети</p></div>';
    }
}

async function deletePromo(promoId) {
    if (!confirm('Удалить акцию?')) return;

    try {
        const resp = await fetch(`/api/admin/promos/${promoId}`, { method: 'DELETE' });
        if (resp.ok) {
            loadAdminPromos();
        } else {
            alert('Ошибка удаления');
        }
    } catch (err) {
        alert('Ошибка сети');
    }
}

// ==================== SERVICES CRUD ====================
async function loadAdminServices() {
    const listEl = document.getElementById('admin-services-list');
    listEl.innerHTML = '<div class="spinner" style="width:32px;height:32px;border-width:3px;margin:40px auto"></div>';
    try {
        const resp = await fetch('/api/services');
        const services = await resp.json();
        if (!services.length) {
            listEl.innerHTML = '<div style="text-align:center;color:var(--text-light);padding:20px">Нет услуг</div>';
            return;
        }
        listEl.innerHTML = services.map(s => `
            <div class="admin-card" style="margin-bottom:12px">
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div style="display:flex;align-items:center;gap:12px">
                        <img src="/static/img/${s.icon}" width="36" height="36" style="border-radius:8px;background:#f5f0e8;padding:4px">
                        <div>
                            <div class="admin-card-service">${s.name}</div>
                            <div class="admin-card-master" style="font-size:13px;color:var(--text-light)">${s.description || ''}</div>
                            <div style="display:flex;gap:12px;margin-top:4px">
                                <div style="font-size:13px;font-weight:600;color:#C9A96E">${s.price > 0 ? s.price + ' ₽' : 'Цена не указана'}</div>
                                <div style="font-size:13px;color:var(--text-light)">${s.duration} мин</div>
                            </div>
                            <div style="font-size:12px;color:var(--text-light)">Порядок: ${s.sort_order}</div>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px">
                        <button class="admin-btn admin-btn-confirm" style="padding:8px 12px;font-size:13px" onclick="editService(${s.id}, '${s.name.replace(/'/g, "\\'")}', '${(s.description || '').replace(/'/g, "\\'")}', ${s.sort_order}, ${s.price}, ${s.duration}, '${s.icon}')">Изм.</button>
                        <button class="admin-btn admin-btn-reject" style="padding:8px 12px;font-size:13px" onclick="deleteService(${s.id})">Удал.</button>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (err) {
        listEl.innerHTML = '<div style="color:#E74C3C;text-align:center;padding:20px">Ошибка загрузки</div>';
    }
}

async function createService() {
    const name = document.getElementById('service-name').value.trim();
    const desc = document.getElementById('service-desc').value.trim();
    const order = parseInt(document.getElementById('service-order').value) || 0;
    const price = parseInt(document.getElementById('service-price').value) || 0;
    const duration = parseInt(document.getElementById('service-duration').value) || 60;
    const icon = document.getElementById('service-icon').value;
    const resultEl = document.getElementById('service-result');

    if (!name) {
        resultEl.style.display = 'block';
        resultEl.style.color = '#E74C3C';
        resultEl.textContent = 'Введите название услуги';
        return;
    }

    try {
        const resp = await fetch('/api/admin/services', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description: desc, price, duration, icon, sort_order: order })
        });
        const data = await resp.json();
        if (data.ok) {
            resultEl.style.display = 'block';
            resultEl.style.color = '#4CAF50';
            resultEl.textContent = 'Услуга добавлена';
            document.getElementById('service-name').value = '';
            document.getElementById('service-desc').value = '';
            document.getElementById('service-order').value = '';
            document.getElementById('service-price').value = '';
            document.getElementById('service-duration').value = '';
            loadAdminServices();
        }
    } catch (err) {
        resultEl.style.display = 'block';
        resultEl.style.color = '#E74C3C';
        resultEl.textContent = 'Ошибка сети';
    }
}

function editService(id, name, desc, order, price, duration, icon) {
    const newName = prompt('Название услуги:', name);
    if (newName === null) return;
    const newDesc = prompt('Описание:', desc);
    const newOrder = prompt('Порядок:', order);
    const newPrice = prompt('Цена (₽):', price);
    const newDuration = prompt('Время сеанса (мин):', duration);
    const newIcon = prompt('Иконка (icon-hair.png, icon-face.png, icon-brows.png, icon-nails.png, icon-more.png):', icon);

    fetch(`/api/admin/services/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, description: newDesc || '', price: parseInt(newPrice) || 0, duration: parseInt(newDuration) || 60, icon: newIcon || 'icon-more.png', sort_order: parseInt(newOrder) || 0 })
    }).then(r => r.json()).then(data => {
        if (data.ok) loadAdminServices();
    });
}

async function deleteService(id) {
    if (!confirm('Удалить услугу?')) return;
    try {
        const resp = await fetch(`/api/admin/services/${id}`, { method: 'DELETE' });
        if (resp.ok) loadAdminServices();
    } catch (err) {
        alert('Ошибка сети');
    }
}

// ==================== PROFILE MENU ====================
function openMenuItem(item) {
    if (item === 'bookings') {
        loadMyBookings();
        switchScreen('screen-my-bookings');
        return;
    }
    if (item === 'admin') {
        loadAdminBookings();
        switchScreen('screen-admin');
        return;
    }
    if (item === 'faq') {
        switchScreen('screen-faq');
        return;
    }
    console.log('Open menu item:', item);
}

function toggleFaq(el) {
    el.closest('.faq-item').classList.toggle('open');
}

// ==================== REVIEWS ====================
let currentReviewBookingId = null;
let currentReviewRating = 0;
let currentReviewPhotoFile = null;

function onReviewPhotoSelected(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
        alert('Максимум 5 МБ');
        input.value = '';
        return;
    }
    currentReviewPhotoFile = file;
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('review-photo-img').src = e.target.result;
        document.getElementById('review-photo-preview').style.display = 'block';
        document.getElementById('review-photo-label').textContent = 'Фото выбрано';
    };
    reader.readAsDataURL(file);
}

function removeReviewPhoto() {
    currentReviewPhotoFile = null;
    document.getElementById('review-photo-input').value = '';
    document.getElementById('review-photo-preview').style.display = 'none';
    document.getElementById('review-photo-label').textContent = 'Добавить фото';
}

function openReviewModal(bookingId) {
    currentReviewBookingId = bookingId;
    currentReviewRating = 0;
    currentReviewPhotoFile = null;
    document.getElementById('review-text').value = '';
    document.getElementById('review-result').style.display = 'none';
    document.querySelectorAll('#review-stars .review-star').forEach(s => s.classList.remove('active'));
    document.getElementById('review-photo-input').value = '';
    document.getElementById('review-photo-preview').style.display = 'none';
    document.getElementById('review-photo-label').textContent = 'Добавить фото';
    document.getElementById('review-modal').classList.add('active');
}

function closeReviewModal(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('review-modal').classList.remove('active');
    currentReviewBookingId = null;
}

function pickReviewStar(n) {
    currentReviewRating = n;
    document.querySelectorAll('#review-stars .review-star').forEach((s, i) => {
        s.classList.toggle('active', i < n);
    });
}

async function submitReview() {
    if (!currentReviewRating) {
        alert('Поставьте оценку');
        return;
    }
    if (!currentUser || !currentReviewBookingId) return;

    const text = document.getElementById('review-text').value.trim();
    const btn = document.getElementById('review-submit-btn');
    btn.classList.add('loading');
    btn.disabled = true;

    const formData = new FormData();
    formData.append('user_id', currentUser.id);
    formData.append('booking_id', currentReviewBookingId);
    formData.append('rating', currentReviewRating);
    if (text) formData.append('text', text);
    if (currentReviewPhotoFile) formData.append('photo', currentReviewPhotoFile);

    try {
        const resp = await fetch('/api/reviews', {
            method: 'POST',
            body: formData,
        });

        const data = await resp.json();

        if (!resp.ok) {
            const resultEl = document.getElementById('review-result');
            let msg = 'Ошибка';
            if (data.detail) {
                if (Array.isArray(data.detail)) {
                    msg = data.detail.map(e => e.msg || e.message || 'Ошибка').join(', ');
                } else {
                    msg = data.detail;
                }
            }
            resultEl.style.display = 'block';
            resultEl.style.color = '#E74C3C';
            resultEl.textContent = msg;
            return;
        }

        closeReviewModal();
        await loadMyBookings();
    } catch (err) {
        alert('Ошибка сети: ' + err.message);
    } finally {
        btn.classList.remove('loading');
        btn.disabled = false;
    }
}

function renderBookings(bookings) {
    const container = document.getElementById('my-bookings-list');
    if (!container) return;

    if (!bookings.length) {
        container.innerHTML = `
            <div class="bookings-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <p>У вас пока нет записей</p>
                <button class="book-btn" onclick="switchScreen('screen-booking')" style="font-size:14px;padding:12px 24px">
                    Записаться
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = bookings.map(b => {
        const statusClass = b.status;
        const statusText = STATUS_LABELS[b.status] || b.status;
        const confirmedTimeLine = b.confirmed_time
            ? `<span>🕐 Подтверждённое время: <b>${b.confirmed_time}</b></span>`
            : '';
        const rejectReason = b.reject_reason
            ? `<div class="booking-card-reject-reason">Причина отказа: ${b.reject_reason}</div>`
            : '';
        const reviewBtn = b.status === 'completed' && !b.has_review
            ? `<button class="book-btn" onclick="openReviewModal(${b.id})" style="font-size:13px;padding:10px 20px;margin-top:12px;width:100%">Оставить отзыв</button>`
            : b.status === 'completed' && b.has_review
            ? `<div style="margin-top:10px;font-size:13px;color:#27AE60;font-weight:600">Отзыв оставлен</div>`
            : '';

        return `
            <div class="booking-card">
                <span class="booking-card-status ${statusClass}">${statusText}</span>
                <div class="booking-card-service">${b.service}</div>
                <div class="booking-card-details">
                    <span>📅 ${b.date} в ${b.time}</span>
                    ${b.master ? `<span>👤 ${b.master}</span>` : ''}
                    ${confirmedTimeLine}
                </div>
                ${rejectReason}
                ${reviewBtn}
            </div>
        `;
    }).join('');
}

async function loadMyBookings() {
    const container = document.getElementById('my-bookings-list');
    if (!container) return;

    if (!currentUser) {
        container.innerHTML = `
            <div class="bookings-empty">
                <p>Войдите, чтобы видеть записи</p>
                <button class="book-btn" onclick="switchScreen('screen-login')" style="font-size:14px;padding:12px 24px">
                    Войти
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = '<div class="bookings-loading"><div class="spinner" style="width:32px;height:32px;border-width:3px;margin:40px auto"></div></div>';

    try {
        const resp = await fetch(`/api/bookings/${currentUser.id}`);
        const data = await resp.json();

        if (!resp.ok) {
            container.innerHTML = '<div class="bookings-empty"><p>Ошибка загрузки</p></div>';
            return;
        }

        renderBookings(data.bookings);
    } catch (err) {
        container.innerHTML = '<div class="bookings-empty"><p>Ошибка сети</p></div>';
    }
}

// ==================== HOME REVIEWS ====================
async function loadHomeReviews() {
    const container = document.getElementById('home-reviews');
    if (!container) return;

    try {
        const resp = await fetch('/api/reviews');
        const data = await resp.json();
        if (!resp.ok || !data.reviews.length) {
            container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-light);font-size:14px">Отзывов пока нет</div>';
            return;
        }

        const ratingEl = document.getElementById('home-rating');
        const ratingValueEl = document.getElementById('home-rating-value');
        const ratingCountEl = document.getElementById('home-rating-count');
        if (ratingEl && data.avg_rating) {
            ratingEl.style.display = 'flex';
            ratingValueEl.textContent = data.avg_rating;
            ratingCountEl.textContent = `(${data.review_count})`;
        }

        container.innerHTML = data.reviews.map(r => {
            const stars = '&#9733;'.repeat(r.rating) + '&#9734;'.repeat(5 - r.rating);
            return `
                <div class="review-card">
                    <div class="review-card-header">
                        <span class="review-card-name">${r.user_name}</span>
                        <span class="review-card-stars">${stars}</span>
                    </div>
                    ${r.text ? `<div class="review-card-text">${r.text}</div>` : ''}
                </div>
            `;
        }).join('');
    } catch (err) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-light);font-size:14px">Ошибка загрузки</div>';
    }
}

let portfolioPhotos = [];
let portfolioExpanded = false;

async function loadPortfolio() {
    const container = document.getElementById('home-portfolio');
    if (!container) return;

    try {
        const resp = await fetch('/api/portfolio');
        const data = await resp.json();
        if (!resp.ok || !data.photos.length) return;

        portfolioPhotos = data.photos;
        portfolioExpanded = false;
        renderPortfolio();
    } catch (err) {
    }
}

function renderPortfolio() {
    const container = document.getElementById('home-portfolio');
    if (!container) return;

    const visible = portfolioExpanded ? portfolioPhotos : portfolioPhotos.slice(0, 2);
    const hasMore = portfolioPhotos.length > 2;

    let html = '<div class="portfolio-grid">' + visible.map((p, i) => {
        const stars = '&#9733;'.repeat(p.rating);
        const delay = (i % visible.length) * 80;
        return `
            <div class="portfolio-item ${portfolioExpanded && i >= 2 ? 'portfolio-item-anim' : ''}" style="animation-delay:${delay}ms">
                <img src="${p.photo}" alt="${p.user_name}">
                <div class="portfolio-item-overlay">
                    <span>${p.user_name} ${stars}</span>
                </div>
            </div>
        `;
    }).join('') + '</div>';

    if (hasMore) {
        if (!portfolioExpanded) {
            html += `<div style="text-align:center;padding:16px 0">
                <button class="book-btn portfolio-btn" onclick="expandPortfolio()">Показать ещё</button>
            </div>`;
        } else {
            html += `<div style="text-align:center;padding:16px 0">
                <button class="book-btn portfolio-btn" onclick="collapsePortfolio()">Скрыть</button>
            </div>`;
        }
    }

    container.innerHTML = html;
}

function expandPortfolio() {
    portfolioExpanded = true;
    renderPortfolio();
}

function collapsePortfolio() {
    portfolioExpanded = false;
    renderPortfolio();
    const grid = document.querySelector('#home-portfolio .portfolio-grid');
    if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ==================== SERVICES LOADING ====================

async function loadServices() {
    try {
        const resp = await fetch('/api/services');
        const services = await resp.json();

        const categoriesGrid = document.getElementById('home-categories');
        if (categoriesGrid) {
            categoriesGrid.innerHTML = services.map(s => {
                const icon = `/static/img/${s.icon || 'icon-more.png'}`;
                return `<a class="category-item" onclick="switchScreen('screen-booking')">
                    <div class="category-icon">
                        <img src="${icon}" alt="${s.name}" width="40" height="40">
                    </div>
                    <span class="category-name">${s.name}</span>
                </a>`;
            }).join('');
        }

        const bookingServices = document.getElementById('booking-services');
        if (bookingServices) {
            bookingServices.innerHTML = services.map(s => {
                const icon = `/static/img/${s.icon || 'icon-more.png'}`;
                const priceText = s.price > 0 ? `<span>от ${s.price} ₽</span>` : '';
                const durText = s.duration ? `<span>${s.duration} мин</span>` : '';
                const details = [priceText, durText].filter(Boolean).join('<span style="margin:0 4px;opacity:0.3">·</span>');
                const detailsBlock = details ? `<div style="font-size:12px;color:#C9A96E;font-weight:600;margin-top:2px;display:flex;align-items:center;gap:2px">${details}</div>` : '';
                return `<div class="service-card" onclick="pickService('${s.name.replace(/'/g, "\\'")}')">
                    <div class="service-icon">
                        <img src="${icon}" alt="${s.name}" width="28" height="28">
                    </div>
                    <div class="service-info">
                        <div class="service-name">${s.name}</div>
                        <div class="service-desc">${s.description || ''}</div>
                        ${detailsBlock}
                    </div>
                    <span class="service-arrow">&rsaquo;</span>
                </div>`;
            }).join('');
        }
    } catch (err) {
        console.error('Ошибка загрузки услуг:', err);
    }
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', async () => {
    await loadUser();
    await loadWelcomeProps();
    showAdminImageControls();
    await loadServices();
    await loadPromos();
    await loadHomeReviews();
    await loadPortfolio();
    switchScreen('screen-home');
});
