import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const cfg = window.COSMOSKIN_CONFIG || {};

if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
  console.error('COSMOSKIN_CONFIG eksik. site-config.js içindeki Supabase ayarlarını kontrol et.');
}

const supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
window.cosmoskinSupabase = supabase;

// -----------------------------
// Helpers
// -----------------------------
const qsa = (s, root = document) => Array.from(root.querySelectorAll(s));

function track(eventName, payload = {}) {
  try {
    if (typeof window.gtag === 'function') {
      window.gtag('event', eventName, payload);
    }
  } catch (e) {
    console.warn('Analytics track warning:', e);
  }
}

function setStatus(message = '', isError = false, targetId = 'registerStatus') {
  const el = document.getElementById(targetId);
  if (!el) return;

  el.textContent = message;
  el.style.color = isError ? '#c0392b' : '#1f7a4f';
  el.style.display = message ? 'block' : 'none';
}

function clearStatuses() {
  setStatus('', false, 'registerStatus');
  setStatus('', false, 'loginStatus');
}

function setLoading(button, loading, loadingText = 'İşleniyor...') {
  if (!button) return;

  if (loading) {
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent;
    }
    button.textContent = loadingText;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
    button.removeAttribute('aria-busy');
  }
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function getRedirectTo() {
  return (cfg.siteUrl || window.location.origin) + (cfg.authCallbackPath || '/auth/callback.html');
}

function saveReturnTo() {
  try {
    const current = window.location.pathname + window.location.search + window.location.hash;
    const blocked = ['/auth/callback.html', '/auth/reset.html'];
    if (!blocked.includes(window.location.pathname)) {
      sessionStorage.setItem('cosmoskin_return_to', current);
    }
  } catch (e) {
    console.warn('saveReturnTo warning:', e);
  }
}

function getReturnTo() {
  try {
    return sessionStorage.getItem('cosmoskin_return_to');
  } catch {
    return null;
  }
}

function clearReturnTo() {
  try {
    sessionStorage.removeItem('cosmoskin_return_to');
  } catch (e) {
    console.warn('clearReturnTo warning:', e);
  }
}

function focusFirstInput(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const firstInput = panel.querySelector('input, textarea, select, button');
  if (firstInput) {
    setTimeout(() => firstInput.focus(), 80);
  }
}

function closeAccountModal() {
  const modal = document.getElementById('accountModal');
  const backdrop = document.getElementById('backdrop');

  modal?.classList.remove('open');
  modal?.classList.remove('show');
  backdrop?.classList.remove('show');
  document.body.classList.remove('modal-open');
}

function resolvePanelId(tab) {
  if (tab === 'register' || tab === 'registerPanel') return 'registerPanel';
  return 'loginPanel';
}

function openAccountModal(tab = 'login') {
  const modal = document.getElementById('accountModal');
  const backdrop = document.getElementById('backdrop');
  const panelId = resolvePanelId(tab);

  if (!modal) return;

  modal.classList.add('open');
  modal.classList.add('show');
  backdrop?.classList.add('show');
  document.body.classList.add('modal-open');

  switchTab(panelId);
  focusFirstInput(panelId);
}

function switchTab(panelId) {
  const panels = qsa('.tab-panel');
  const buttons = qsa('.tab-btn');

  panels.forEach((panel) => {
    panel.classList.toggle('active', panel.id === panelId);
  });

  buttons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === panelId);
  });

  clearStatuses();
}

function renderResendButton(email) {
  const target = document.getElementById('loginStatus');
  if (!target || !email) return;

  target.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;">
      <span style="color:#c0392b;">Lütfen önce e-postanı doğrula.</span>
      <button type="button" id="resendConfirmationBtn" class="btn btn-secondary">Doğrulama e-postasını tekrar gönder</button>
    </div>
  `;

  const resendBtn = document.getElementById('resendConfirmationBtn');
  resendBtn?.addEventListener('click', async () => {
    try {
      setLoading(resendBtn, true, 'Gönderiliyor...');

      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: getRedirectTo()
        }
      });

      if (error) throw error;

      target.innerHTML = `<span style="color:#1f7a4f;">Doğrulama e-postası tekrar gönderildi.</span>`;
      track('resend_confirmation_email', { email_domain: email.split('@')[1] || '' });
    } catch (error) {
      console.error('Resend confirmation error:', error);
      target.innerHTML = `<span style="color:#c0392b;">Doğrulama e-postası gönderilemedi. Lütfen tekrar dene.</span>`;
    }
  });
}

function renderAccountState(user) {
  const accountState = document.getElementById('accountState');
  const accountActions = document.getElementById('accountActions');

  if (!accountState) return;

  if (user) {
    const firstName = user.user_metadata?.first_name || '';
    const lastName = user.user_metadata?.last_name || '';
    const fullName = `${firstName} ${lastName}`.trim();
    const displayName = fullName || user.email || 'Hesabın';
    const emailVerified =
      user.email_confirmed_at || user.confirmed_at
        ? 'E-posta doğrulandı'
        : 'E-posta doğrulaması bekleniyor';

    accountState.innerHTML = `
      <div class="account-state stack">
        <strong>${displayName}</strong>
        <div class="account-mini">${user.email || ''}</div>
        <div class="account-mini">${emailVerified}</div>
      </div>
    `;

    if (accountActions) {
      accountActions.innerHTML = `
        <button class="btn btn-secondary" id="signOutBtn">Çıkış Yap</button>
      `;

      document.getElementById('signOutBtn')?.addEventListener('click', async () => {
        try {
          const { error } = await supabase.auth.signOut();
          if (error) throw error;
          track('sign_out');
          location.reload();
        } catch (error) {
          console.error('Sign out error:', error);
        }
      });
    }
  } else {
    accountState.innerHTML = '';
    if (accountActions) {
      accountActions.innerHTML = `
        <button class="btn btn-primary" data-open-auth data-auth-tab="loginPanel">Giriş Yap</button>
        <button class="btn btn-secondary" data-open-auth data-auth-tab="registerPanel">Kayıt Ol</button>
      `;
      bindOpenAuthButtons();
    }
  }
}

async function refreshAccountUI() {
  try {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    renderAccountState(user);
  } catch (error) {
    console.error('refreshAccountUI error:', error);
  }
}

function bindOpenAuthButtons() {
  qsa('[data-open-auth]').forEach((btn) => {
    btn.addEventListener('click', () => {
      saveReturnTo();
      openAccountModal(btn.dataset.authTab || 'loginPanel');
    });
  });
}

// -----------------------------
// Password UX
// -----------------------------
function bindPasswordToggles() {
  qsa('[data-toggle-password]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const inputId = btn.getAttribute('data-toggle-password');
      const input = document.getElementById(inputId);
      if (!input) return;

      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      btn.textContent = isPassword ? 'Gizle' : 'Göster';
      btn.setAttribute('aria-label', isPassword ? 'Şifreyi gizle' : 'Şifreyi göster');
    });
  });
}

function evaluatePasswordStrength(password) {
  const checks = {
    length: password.length >= 8,
    upper: /[A-ZÇĞİÖŞÜ]/.test(password),
    lower: /[a-zçğıöşü]/.test(password),
    number: /\d/.test(password)
  };

  const score = Object.values(checks).filter(Boolean).length;

  let width = '0%';
  let text = 'Şifre güvenliği';
  let color = '#d1d5db';

  if (score === 1) {
    width = '25%';
    text = 'Zayıf';
    color = '#d14b4b';
  } else if (score === 2) {
    width = '50%';
    text = 'Orta';
    color = '#d9972b';
  } else if (score === 3) {
    width = '75%';
    text = 'İyi';
    color = '#3d8b6d';
  } else if (score === 4) {
    width = '100%';
    text = 'Güçlü';
    color = '#1f7a4f';
  }

  return { checks, width, text, color };
}

function bindPasswordMeter() {
  const input = document.getElementById('registerPassword');
  const fill = document.getElementById('passwordMeterFill');
  const text = document.getElementById('passwordStrengthText');
  const rules = document.getElementById('passwordRules');

  if (!input || !fill || !text || !rules) return;

  const update = () => {
    const result = evaluatePasswordStrength(input.value || '');
    fill.style.width = result.width;
    fill.style.backgroundColor = result.color;
    text.textContent = input.value ? result.text : 'Şifre güvenliği';

    rules.querySelector('[data-rule="length"]')?.classList.toggle('is-valid', result.checks.length);
    rules.querySelector('[data-rule="upper"]')?.classList.toggle('is-valid', result.checks.upper);
    rules.querySelector('[data-rule="lower"]')?.classList.toggle('is-valid', result.checks.lower);
    rules.querySelector('[data-rule="number"]')?.classList.toggle('is-valid', result.checks.number);
  };

  input.addEventListener('input', update);
  update();
}

// -----------------------------
// Tabs & modal controls
// -----------------------------
qsa('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    switchTab(btn.dataset.tab);
    focusFirstInput(btn.dataset.tab);
  });
});

qsa('.close-any').forEach((btn) => {
  btn.addEventListener('click', closeAccountModal);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAccountModal();
  }
});

document.getElementById('backdrop')?.addEventListener('click', closeAccountModal);

document.getElementById('accountBtn')?.addEventListener('click', async () => {
  const drawer = document.getElementById('accountDrawer');
  const backdrop = document.getElementById('backdrop');

  drawer?.classList.add('open');
  backdrop?.classList.add('show');
  document.body.classList.add('modal-open');

  await refreshAccountUI();
});

document.addEventListener('cosmoskin:open-auth', (event) => {
  saveReturnTo();
  openAccountModal(event.detail?.tab || 'loginPanel');
});

document.addEventListener('cosmoskin:open-auth-modal', (event) => {
  saveReturnTo();
  openAccountModal(event.detail?.tab || 'loginPanel');
});

bindOpenAuthButtons();
bindPasswordToggles();
bindPasswordMeter();

// -----------------------------
// Register
// -----------------------------
const registerForm = document.getElementById('registerForm');

registerForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const submitBtn = registerForm.querySelector('button[type="submit"]');
  setStatus('', false, 'registerStatus');
  setLoading(submitBtn, true, 'Hesap oluşturuluyor...');

  const firstName = document.getElementById('registerFirstName')?.value.trim() || '';
  const lastName = document.getElementById('registerLastName')?.value.trim() || '';
  const email = normalizeEmail(document.getElementById('registerEmail')?.value);
  const password = document.getElementById('registerPassword')?.value || '';

  if (!firstName || !lastName || !email || !password) {
    setStatus('Lütfen tüm alanları doldurun.', true, 'registerStatus');
    setLoading(submitBtn, false);
    return;
  }

  if (password.length < 8) {
    setStatus('Şifre en az 8 karakter olmalı.', true, 'registerStatus');
    setLoading(submitBtn, false);
    return;
  }

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getRedirectTo(),
        data: {
          first_name: firstName,
          last_name: lastName
        }
      }
    });

    if (error) throw error;

    if (data?.user?.identities?.length === 0) {
      setStatus('Girmiş olduğun e-posta zaten kayıtlı.', true, 'registerStatus');
      setLoading(submitBtn, false);
      return;
    }

    setStatus('Kayıt başarılı. Lütfen e-postanı kontrol et.', false, 'registerStatus');
    track('sign_up', { email_domain: email.split('@')[1] || '' });
    registerForm.reset();
    bindPasswordMeter();
  } catch (error) {
    console.error('Register error:', error);

    const msg = String(error?.message || '').toLowerCase();

    if (
      msg.includes('already') ||
      msg.includes('exists') ||
      msg.includes('duplicate') ||
      msg.includes('registered') ||
      msg.includes('database error saving new user')
    ) {
      setStatus('Girmiş olduğun e-posta zaten kayıtlı.', true, 'registerStatus');
    } else if (msg.includes('password')) {
      setStatus('Şifre kriterleri sağlanmadı. Lütfen daha güçlü bir şifre dene.', true, 'registerStatus');
    } else if (msg.includes('rate limit')) {
      setStatus('Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar dene.', true, 'registerStatus');
    } else {
      setStatus('Kayıt sırasında bir hata oluştu. Lütfen tekrar dene.', true, 'registerStatus');
    }
  } finally {
    setLoading(submitBtn, false);
  }
});

// -----------------------------
// Login
// -----------------------------
const loginForm = document.getElementById('loginForm');

loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const submitBtn = loginForm.querySelector('button[type="submit"]');
  setStatus('', false, 'loginStatus');
  setLoading(submitBtn, true, 'Giriş yapılıyor...');

  const email = normalizeEmail(document.getElementById('loginEmail')?.value);
  const password = document.getElementById('loginPassword')?.value || '';

  if (!email || !password) {
    setStatus('Lütfen e-posta ve şifre girin.', true, 'loginStatus');
    setLoading(submitBtn, false);
    return;
  }

  try {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    setStatus('Giriş başarılı.', false, 'loginStatus');
    track('login', { email_domain: email.split('@')[1] || '' });

    await refreshAccountUI();
    closeAccountModal();

    const returnTo = getReturnTo();
    clearReturnTo();

    setTimeout(() => {
      if (returnTo && returnTo !== window.location.pathname) {
        window.location.href = returnTo;
      } else {
        location.reload();
      }
    }, 500);
  } catch (error) {
    console.error('Login error:', error);

    const msg = String(error?.message || '').toLowerCase();

    if (msg.includes('invalid login credentials')) {
      setStatus('E-posta veya şifre hatalı.', true, 'loginStatus');
    } else if (msg.includes('email not confirmed')) {
      renderResendButton(email);
    } else if (msg.includes('rate limit')) {
      setStatus('Çok fazla giriş denemesi yapıldı. Lütfen biraz sonra tekrar dene.', true, 'loginStatus');
    } else {
      setStatus('Giriş sırasında bir hata oluştu. Lütfen tekrar dene.', true, 'loginStatus');
    }
  } finally {
    setLoading(submitBtn, false);
  }
});

// -----------------------------
// Auth state sync
// -----------------------------
supabase.auth.onAuthStateChange(async (_event, session) => {
  renderAccountState(session?.user || null);
});

refreshAccountUI();
