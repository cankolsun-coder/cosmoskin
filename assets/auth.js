import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const cfg = window.COSMOSKIN_CONFIG || {};

if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
  console.error('COSMOSKIN_CONFIG eksik. site-config.js içindeki Supabase ayarlarını kontrol et.');
}

const supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
window.cosmoskinSupabase = supabase;

// Redirect account button to profile page when session exists
supabase.auth.getSession().then(({ data: { session } }) => {
  if (session) {
    document.addEventListener('DOMContentLoaded', () => {
      const accountBtn = document.getElementById('accountBtn');
      if (accountBtn) {
        accountBtn.addEventListener('click', (e) => {
          e.stopImmediatePropagation();
          window.location.href = '/account/profile.html';
        }, true);
      }
    });
  }
});

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

function emitAuthState(user = null) {
  try {
    document.dispatchEvent(
      new CustomEvent('cosmoskin:auth-state', {
        detail: {
          loggedIn: !!user,
          user: user || null,
          email: user?.email || null
        }
      })
    );
  } catch (error) {
    console.warn('emitAuthState warning:', error);
  }
}


function getUserFullName(user) {
  const firstName = user?.user_metadata?.first_name || user?.user_metadata?.firstName || '';
  const lastName = user?.user_metadata?.last_name || user?.user_metadata?.lastName || '';
  return {
    firstName: String(firstName || '').trim(),
    lastName: String(lastName || '').trim()
  };
}

function setCheckoutGateVisibility(user) {
  const gate = document.getElementById('checkoutAuthGate');
  const form = document.getElementById('checkoutForm');
  const emailInput = form?.querySelector('input[name="email"]');
  const firstNameInput = form?.querySelector('input[name="first_name"]');
  const lastNameInput = form?.querySelector('input[name="last_name"]');

  if (!gate && !form) return;

  if (user) {
    const { firstName, lastName } = getUserFullName(user);

    gate?.setAttribute('hidden', '');
    gate?.classList.add('is-hidden');
    gate?.setAttribute('aria-hidden', 'true');

    form?.classList.add('is-authenticated-checkout');
    form?.setAttribute('data-authenticated', 'true');

    if (emailInput && !emailInput.value) emailInput.value = user.email || '';
    if (firstNameInput && !firstNameInput.value && firstName) firstNameInput.value = firstName;
    if (lastNameInput && !lastNameInput.value && lastName) lastNameInput.value = lastName;
  } else {
    gate?.removeAttribute('hidden');
    gate?.classList.remove('is-hidden');
    gate?.setAttribute('aria-hidden', 'false');

    form?.classList.remove('is-authenticated-checkout');
    form?.setAttribute('data-authenticated', 'false');
  }
}

async function syncCheckoutAuthState() {
  if (!document.getElementById('checkoutForm') && !document.getElementById('checkoutAuthGate')) return;

  try {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    setCheckoutGateVisibility(user || null);
  } catch (error) {
    console.warn('syncCheckoutAuthState warning:', error);
    setCheckoutGateVisibility(null);
  }
}

function closeAccountDrawer() {
  const drawer = document.getElementById('accountDrawer');
  const backdrop = document.getElementById('backdrop');
  drawer?.classList.remove('open');
  backdrop?.classList.remove('show');
  if (!document.getElementById('cartDrawer')?.classList.contains('open')) {
    document.body.classList.remove('modal-open');
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

    document.body.classList.add('user-is-authenticated');
    document.getElementById('accountBtn')?.setAttribute('aria-label', 'Hesabım');

    if (accountActions) {
      accountActions.innerHTML = `
        <a class="btn btn-primary" href="/account/profile.html">Hesabımı Yönet</a>
        <button class="btn btn-secondary" id="signOutBtn">Çıkış Yap</button>
      `;

      document.getElementById('signOutBtn')?.addEventListener('click', async () => {
        try {
          const { error } = await supabase.auth.signOut();
          if (error) throw error;
          track('sign_out');
          closeAccountDrawer();
          location.reload();
        } catch (error) {
          console.error('Sign out error:', error);
        }
      });
    }
  } else {
    document.body.classList.remove('user-is-authenticated');
    document.getElementById('accountBtn')?.setAttribute('aria-label', 'Hesap');
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
    emitAuthState(user || null);
  } catch (error) {
    console.error('refreshAccountUI error:', error);
  }
}

function bindOpenAuthButtons() {
  qsa('[data-open-auth]').forEach((btn) => {
    if (btn.dataset.authBound === 'true') return;
    btn.dataset.authBound = 'true';
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

document.getElementById('accountBtn')?.addEventListener('click', async (event) => {
  const drawer = document.getElementById('accountDrawer');
  const backdrop = document.getElementById('backdrop');

  try {
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (user) {
      event.preventDefault();
      window.location.href = '/account/profile.html';
      return;
    }
  } catch (error) {
    console.warn('account button auth check failed:', error);
  }

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
// Checkout validation UX (Phase 2)
// -----------------------------
const CHECKOUT_FIELD_RULES = {
  first_name: { label: 'Ad', validate: (value) => String(value || '').trim().length >= 2 || 'Ad alanı en az 2 karakter olmalı.' },
  last_name: { label: 'Soyad', validate: (value) => String(value || '').trim().length >= 2 || 'Soyad alanı en az 2 karakter olmalı.' },
  email: { label: 'E-posta', validate: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim()) || 'Geçerli bir e-posta adresi gir.' },
  phone: { label: 'Telefon', validate: (value) => isValidTurkishPhone(value) || 'Telefon numarası +90 5xx xxx xx xx formatında olmalı.' },
  identity_number: { label: 'T.C. Kimlik No', validate: (value) => isValidTurkishIdentityNumber(value) || 'Geçerli bir 11 haneli T.C. kimlik numarası gir.' },
  city: { label: 'İl', validate: (value) => String(value || '').trim().length >= 2 || 'İl alanını doldur.' },
  district: { label: 'İlçe', validate: (value) => String(value || '').trim().length >= 2 || 'İlçe alanını doldur.' },
  postal_code: { label: 'Posta Kodu', validate: (value) => /^\d{5}$/.test(onlyDigits(value)) || 'Posta kodu 5 haneli olmalı.' },
  address: { label: 'Adres', validate: (value) => String(value || '').trim().length >= 10 || 'Adres alanı en az 10 karakter olmalı.' },
  sales_terms: { label: 'Mesafeli Satış', validate: (_value, input) => input?.checked || 'Ön bilgilendirme ve mesafeli satış koşullarını onaylamalısın.' },
  kvkk_terms: { label: 'KVKK', validate: (_value, input) => input?.checked || 'KVKK aydınlatma metni bilgilendirmesini onaylamalısın.' }
};

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeTurkishPhoneDigits(value) {
  let digits = onlyDigits(value);
  if (digits.startsWith('0090')) digits = digits.slice(4);
  if (digits.startsWith('90')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 10);
}

function formatTurkishPhone(value) {
  const digits = normalizeTurkishPhoneDigits(value);
  if (!digits) return '';
  const p1 = digits.slice(0, 3);
  const p2 = digits.slice(3, 6);
  const p3 = digits.slice(6, 8);
  const p4 = digits.slice(8, 10);
  return ['+90', p1, p2, p3, p4].filter(Boolean).join(' ');
}

function isValidTurkishPhone(value) {
  const digits = normalizeTurkishPhoneDigits(value);
  return /^5\d{9}$/.test(digits);
}

function normalizeTurkishPhoneForSubmit(value) {
  const digits = normalizeTurkishPhoneDigits(value);
  return digits ? `+90${digits}` : '';
}

function isValidTurkishIdentityNumber(value) {
  const digits = onlyDigits(value);
  if (!/^\d{11}$/.test(digits)) return false;
  if (digits[0] === '0') return false;
  const numbers = digits.split('').map(Number);
  const oddSum = numbers[0] + numbers[2] + numbers[4] + numbers[6] + numbers[8];
  const evenSum = numbers[1] + numbers[3] + numbers[5] + numbers[7];
  const tenth = ((oddSum * 7) - evenSum) % 10;
  const eleventh = numbers.slice(0, 10).reduce((sum, n) => sum + n, 0) % 10;
  return numbers[9] === tenth && numbers[10] === eleventh;
}

function injectCheckoutValidationStyles() {
  if (document.getElementById('checkoutValidationStyles')) return;
  const style = document.createElement('style');
  style.id = 'checkoutValidationStyles';
  style.textContent = `
    #checkoutForm .field { position: relative; }
    #checkoutForm .field-error { display:none; margin-top:7px; font-size:12px; line-height:1.45; color:#b42318; }
    #checkoutForm .field.has-error .field-error { display:block; }
    #checkoutForm .field.has-error input,
    #checkoutForm .field.has-error textarea,
    #checkoutForm .field.has-error select { border-color:rgba(180,35,24,.7); box-shadow:0 0 0 3px rgba(180,35,24,.08); }
    #checkoutForm .field.is-valid input,
    #checkoutForm .field.is-valid textarea,
    #checkoutForm .field.is-valid select { border-color:rgba(31,122,79,.45); }
  `;
  document.head.appendChild(style);
}

function getFieldWrapper(input) {
  return input?.closest('.field') || input?.closest('label')?.parentElement || null;
}

function ensureFieldError(input) {
  if (!input) return null;
  const wrapper = getFieldWrapper(input);
  if (!wrapper) return null;
  let error = wrapper.querySelector(`.field-error[data-for="${input.name}"]`);
  if (!error) {
    error = document.createElement('div');
    error.className = 'field-error';
    error.dataset.for = input.name;
    error.id = `checkout-error-${input.name}`;
    error.setAttribute('aria-live', 'polite');
    const line = input.closest('.checkline');
    if (line) line.insertAdjacentElement('afterend', error);
    else input.insertAdjacentElement('afterend', error);
  }
  return error;
}

function setCheckoutFieldError(input, message = '') {
  if (!input) return;
  const wrapper = getFieldWrapper(input);
  const error = ensureFieldError(input);
  if (!wrapper || !error) return;
  if (message) {
    wrapper.classList.add('has-error');
    wrapper.classList.remove('is-valid');
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', error.id);
    error.textContent = message;
  } else {
    wrapper.classList.remove('has-error');
    if (String(input.value || '').trim() || input.checked) wrapper.classList.add('is-valid');
    input.removeAttribute('aria-invalid');
    input.removeAttribute('aria-describedby');
    error.textContent = '';
  }
}

function validateCheckoutField(input, silent = false) {
  if (!input?.name || !CHECKOUT_FIELD_RULES[input.name]) return true;
  const result = CHECKOUT_FIELD_RULES[input.name].validate(input.value, input);
  const valid = result === true;
  if (!silent || !valid) setCheckoutFieldError(input, valid ? '' : result);
  return valid;
}

function setCheckoutStatus(message = '', isError = false) {
  const status = document.getElementById('checkoutStatus');
  if (!status) return;
  status.textContent = message;
  status.style.color = isError ? '#b42318' : '#1f7a4f';
  status.style.display = message ? 'block' : 'none';
  status.setAttribute('role', isError ? 'alert' : 'status');
}

function normalizeCheckoutValues(form) {
  const phoneInput = form?.querySelector('[name="phone"]');
  const identityInput = form?.querySelector('[name="identity_number"]');
  const postalInput = form?.querySelector('[name="postal_code"]');
  const emailInput = form?.querySelector('[name="email"]');
  if (phoneInput && isValidTurkishPhone(phoneInput.value)) phoneInput.value = formatTurkishPhone(phoneInput.value);
  if (identityInput) identityInput.value = onlyDigits(identityInput.value).slice(0, 11);
  if (postalInput) postalInput.value = onlyDigits(postalInput.value).slice(0, 5);
  if (emailInput) emailInput.value = normalizeEmail(emailInput.value);
}

function validateCheckoutForm(form, focusFirstInvalid = true) {
  if (!form) return true;
  normalizeCheckoutValues(form);
  const inputs = Object.keys(CHECKOUT_FIELD_RULES).map((name) => form.querySelector(`[name="${name}"]`)).filter(Boolean);
  const invalidInputs = inputs.filter((input) => !validateCheckoutField(input));
  if (invalidInputs.length) {
    setCheckoutStatus('Lütfen kırmızı işaretli alanları kontrol et.', true);
    if (focusFirstInvalid) {
      invalidInputs[0].focus({ preventScroll: true });
      invalidInputs[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return false;
  }
  setCheckoutStatus('', false);
  return true;
}

function bindCheckoutValidation() {
  const form = document.getElementById('checkoutForm');
  if (!form || form.dataset.phase2ValidationBound === 'true') return;
  form.dataset.phase2ValidationBound = 'true';
  injectCheckoutValidationStyles();

  const phoneInput = form.querySelector('[name="phone"]');
  const identityInput = form.querySelector('[name="identity_number"]');
  const postalInput = form.querySelector('[name="postal_code"]');

  phoneInput?.setAttribute('inputmode', 'tel');
  phoneInput?.setAttribute('maxlength', '17');
  phoneInput?.setAttribute('placeholder', '+90 5xx xxx xx xx');
  phoneInput?.addEventListener('input', () => {
    phoneInput.value = formatTurkishPhone(phoneInput.value);
    validateCheckoutField(phoneInput, true);
  });

  identityInput?.setAttribute('inputmode', 'numeric');
  identityInput?.setAttribute('maxlength', '11');
  identityInput?.addEventListener('input', () => {
    identityInput.value = onlyDigits(identityInput.value).slice(0, 11);
    validateCheckoutField(identityInput, true);
  });

  postalInput?.setAttribute('inputmode', 'numeric');
  postalInput?.setAttribute('maxlength', '5');
  postalInput?.addEventListener('input', () => {
    postalInput.value = onlyDigits(postalInput.value).slice(0, 5);
    validateCheckoutField(postalInput, true);
  });

  Object.keys(CHECKOUT_FIELD_RULES).forEach((name) => {
    const input = form.querySelector(`[name="${name}"]`);
    if (!input) return;
    ensureFieldError(input);
    input.addEventListener('blur', () => validateCheckoutField(input));
    input.addEventListener('change', () => validateCheckoutField(input, true));
  });

  form.addEventListener('submit', (event) => {
    if (!validateCheckoutForm(form)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return false;
    }
    const phoneInput = form.querySelector('[name="phone"]');
    if (phoneInput) phoneInput.dataset.normalizedPhone = normalizeTurkishPhoneForSubmit(phoneInput.value);
    setCheckoutStatus('Bilgiler kontrol edildi. Güvenli ödeme başlatılıyor...', false);
    return true;
  }, true);
}

document.addEventListener('DOMContentLoaded', bindCheckoutValidation);

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
    await syncCheckoutAuthState();
    closeAccountModal();
    closeAccountDrawer();

    const returnTo = getReturnTo();
    clearReturnTo();
    const currentPath = window.location.pathname + window.location.search + window.location.hash;

    if (returnTo && returnTo !== currentPath) {
      window.location.href = returnTo;
      return;
    }

    document.dispatchEvent(new CustomEvent('cosmoskin:auth-refresh-requested', {
      detail: {
        source: 'login',
        path: currentPath
      }
    }));
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
  const user = session?.user || null;
  renderAccountState(user);
  setCheckoutGateVisibility(user);
  emitAuthState(user);
});

document.addEventListener('DOMContentLoaded', syncCheckoutAuthState);
document.addEventListener('cosmoskin:auth-refresh-requested', syncCheckoutAuthState);

refreshAccountUI().then(syncCheckoutAuthState);
