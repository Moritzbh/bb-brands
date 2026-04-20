/* ============================================================
 *  BB Brands — Consent Manager
 *
 *  Zweck: DSGVO/TTDSG-konformer Cookie/Consent-Banner OHNE
 *  Drittanbieter (kein Cookiebot, kein Usercentrics).
 *
 *  Kategorien:
 *    - necessary  → Form-Submits, Auth-Token. IMMER an.
 *    - statistik  → Anonyme Web-Analytics (Plausible, GA mit IP-Anon).
 *    - marketing  → Tracking-Pixel (Meta, Google Ads, LinkedIn, TikTok).
 *
 *  Aktuell sind keine Tracker aktiv. Das Framework steht für später —
 *  Tracker-Loader checken einfach window.bbConsent.has('marketing') etc.
 *
 *  Public API:
 *    window.bbConsent.has('marketing')      → true/false
 *    window.bbConsent.get()                 → komplettes Consent-Objekt
 *    window.bbConsent.set({ marketing: true }) → manuell setzen
 *    window.bbConsent.show()                → Banner/Settings öffnen
 *    window.bbConsent.onChange(fn)          → Callback bei Änderung
 *    window.bbConsent.reset()               → Alles löschen, Banner wieder zeigen
 *
 *  Storage: localStorage Key 'bb_consent_v1'
 * ============================================================ */
(function () {
  'use strict';

  var STORAGE_KEY = 'bb_consent_v1';
  var SCHEMA_VERSION = 1;

  var state = {
    listeners: [],
    consent: null, // { v, ts, necessary, statistik, marketing }
  };

  // ----- Storage ----------------------------------------------
  function read() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || obj.v !== SCHEMA_VERSION) return null;
      return obj;
    } catch (e) {
      return null;
    }
  }

  function write(consent) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
    } catch (e) { /* ignore */ }
  }

  function makeConsent(opts) {
    return {
      v: SCHEMA_VERSION,
      ts: new Date().toISOString(),
      necessary: true, // immer
      statistik: !!(opts && opts.statistik),
      marketing: !!(opts && opts.marketing),
    };
  }

  function fireListeners() {
    state.listeners.forEach(function (fn) {
      try { fn(state.consent); } catch (e) { /* ignore */ }
    });
  }

  // ----- Inject CSS -------------------------------------------
  function injectStyles() {
    if (document.getElementById('bb-consent-styles')) return;
    var css = `
      .bb-consent-overlay {
        position: fixed; inset: 0;
        background: rgba(10, 10, 14, 0.55);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        z-index: 9998;
        display: none;
        opacity: 0;
        transition: opacity 0.25s ease;
      }
      .bb-consent-overlay.is-open { display: block; opacity: 1; }

      .bb-consent-banner {
        position: fixed;
        bottom: 16px; left: 16px; right: 16px;
        max-width: 760px; margin: 0 auto;
        background: #0F0F14;
        color: #FAFAFA;
        border: 1px solid rgba(126, 139, 255, 0.18);
        border-radius: 16px;
        padding: 22px 26px;
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255,255,255,0.02);
        font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13.5px;
        line-height: 1.55;
        z-index: 9999;
        display: none;
        transform: translateY(140%);
        transition: transform 0.45s cubic-bezier(.2,.8,.3,1.05);
      }
      .bb-consent-banner.is-open {
        display: block;
        transform: translateY(0);
      }
      .bb-consent-banner h3 {
        font-family: 'Instrument Serif', Georgia, serif;
        font-style: italic;
        font-size: 22px;
        font-weight: 400;
        letter-spacing: -0.5px;
        margin: 0 0 8px;
        color: #FAFAFA;
      }
      .bb-consent-banner p {
        margin: 0 0 16px;
        color: #B5B5BD;
        font-size: 13px;
      }
      .bb-consent-banner a {
        color: #7E8BFF;
        text-decoration: underline;
        text-underline-offset: 2px;
      }
      .bb-consent-banner a:hover { color: #A5AEFF; }

      .bb-consent-actions {
        display: flex; gap: 10px; flex-wrap: wrap;
        align-items: center;
      }
      .bb-consent-btn {
        display: inline-flex; align-items: center; justify-content: center;
        padding: 11px 22px;
        font-size: 13px; font-weight: 700;
        font-family: inherit;
        border-radius: 999px;
        border: 1.5px solid transparent;
        cursor: pointer;
        transition: all 0.2s;
        line-height: 1;
        white-space: nowrap;
      }
      .bb-consent-btn-primary {
        background: #5B6BFF;
        color: #FFF;
        box-shadow: 0 6px 20px rgba(91, 107, 255, 0.35);
      }
      .bb-consent-btn-primary:hover {
        background: #7E8BFF;
        transform: translateY(-1px);
        box-shadow: 0 10px 28px rgba(126, 139, 255, 0.45);
      }
      .bb-consent-btn-ghost {
        background: transparent;
        color: #FAFAFA;
        border-color: rgba(255,255,255,0.18);
      }
      .bb-consent-btn-ghost:hover {
        border-color: rgba(255,255,255,0.4);
        background: rgba(255,255,255,0.04);
      }
      .bb-consent-btn-link {
        background: transparent;
        color: #B5B5BD;
        border: none;
        padding: 11px 8px;
        font-size: 12px;
        font-weight: 600;
        text-decoration: underline;
        text-underline-offset: 2px;
        cursor: pointer;
        margin-left: auto;
      }
      .bb-consent-btn-link:hover { color: #FAFAFA; }

      /* Settings-Modal */
      .bb-consent-modal {
        position: fixed;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%) scale(0.96);
        width: calc(100% - 32px); max-width: 540px;
        max-height: calc(100vh - 64px); overflow-y: auto;
        background: #0F0F14;
        color: #FAFAFA;
        border: 1px solid rgba(126, 139, 255, 0.22);
        border-radius: 18px;
        padding: 32px 30px 26px;
        box-shadow: 0 30px 90px rgba(0, 0, 0, 0.65);
        font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13.5px;
        z-index: 10000;
        display: none;
        opacity: 0;
        transition: opacity 0.25s ease, transform 0.3s cubic-bezier(.2,.8,.3,1.2);
      }
      .bb-consent-modal.is-open {
        display: block;
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
      }
      .bb-consent-modal-eyebrow {
        font-size: 11px; font-weight: 700; letter-spacing: 2.4px;
        text-transform: uppercase; color: #7E8BFF;
        margin-bottom: 10px;
      }
      .bb-consent-modal h3 {
        font-family: 'Instrument Serif', Georgia, serif;
        font-style: italic;
        font-size: 28px; font-weight: 400;
        letter-spacing: -0.6px;
        margin: 0 0 8px;
        line-height: 1.15;
      }
      .bb-consent-modal-sub {
        margin: 0 0 24px;
        color: #B5B5BD;
        font-size: 13px;
      }
      .bb-consent-cat {
        display: flex; gap: 14px;
        padding: 16px 0;
        border-top: 1px solid rgba(255,255,255,0.06);
      }
      .bb-consent-cat-info { flex: 1; min-width: 0; }
      .bb-consent-cat-name {
        font-size: 14px; font-weight: 700;
        margin-bottom: 4px;
      }
      .bb-consent-cat-desc {
        font-size: 12.5px;
        color: #9999A4;
        line-height: 1.5;
      }
      .bb-consent-toggle {
        position: relative;
        flex-shrink: 0;
        width: 44px; height: 24px;
        border-radius: 999px;
        background: rgba(255,255,255,0.1);
        cursor: pointer;
        transition: background 0.2s;
        border: none;
        padding: 0;
        margin-top: 2px;
      }
      .bb-consent-toggle::after {
        content: '';
        position: absolute;
        top: 2px; left: 2px;
        width: 20px; height: 20px;
        background: #FAFAFA;
        border-radius: 50%;
        transition: transform 0.22s cubic-bezier(.2,.8,.3,1.2);
      }
      .bb-consent-toggle.is-on { background: #5B6BFF; }
      .bb-consent-toggle.is-on::after { transform: translateX(20px); }
      .bb-consent-toggle.is-disabled {
        background: rgba(91, 107, 255, 0.5);
        cursor: not-allowed;
        opacity: 0.7;
      }
      .bb-consent-toggle.is-disabled::after { transform: translateX(20px); }

      .bb-consent-modal-actions {
        display: flex; gap: 10px; flex-wrap: wrap;
        margin-top: 22px;
        padding-top: 22px;
        border-top: 1px solid rgba(255,255,255,0.06);
      }
      .bb-consent-modal-actions .bb-consent-btn { flex: 1; min-width: 140px; }

      .bb-consent-modal-close {
        position: absolute;
        top: 16px; right: 18px;
        width: 32px; height: 32px;
        border-radius: 50%;
        background: rgba(255,255,255,0.06);
        border: none;
        color: #FAFAFA;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.15s;
      }
      .bb-consent-modal-close:hover { background: rgba(255,255,255,0.12); }

      @media (max-width: 540px) {
        .bb-consent-banner { padding: 20px 22px; bottom: 12px; left: 12px; right: 12px; }
        .bb-consent-banner h3 { font-size: 19px; }
        .bb-consent-banner p { font-size: 12.5px; }
        .bb-consent-actions { flex-direction: column; align-items: stretch; }
        .bb-consent-btn { width: 100%; }
        .bb-consent-btn-link { margin-left: 0; text-align: center; padding: 12px 0; }
        .bb-consent-modal { padding: 24px 22px 22px; }
        .bb-consent-modal h3 { font-size: 24px; }
        .bb-consent-modal-actions { flex-direction: column; }
        .bb-consent-modal-actions .bb-consent-btn { width: 100%; }
      }
    `;
    var style = document.createElement('style');
    style.id = 'bb-consent-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ----- DOM Templates ----------------------------------------
  function buildBanner() {
    var el = document.createElement('div');
    el.className = 'bb-consent-banner';
    el.id = 'bb-consent-banner';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-labelledby', 'bb-consent-title');
    el.setAttribute('aria-describedby', 'bb-consent-desc');
    el.innerHTML = `
      <h3 id="bb-consent-title">Kurz zu deiner Privatsphäre.</h3>
      <p id="bb-consent-desc">
        Wir nutzen Cookies und ähnliche Technologien, um die Seite zu betreiben und — falls du erlaubst — anonyme Statistiken oder Marketing-Pixel zu laden. Du entscheidest. Details in der <a href="/datenschutz" rel="noopener">Datenschutzerklärung</a>.
      </p>
      <div class="bb-consent-actions">
        <button type="button" class="bb-consent-btn bb-consent-btn-primary" data-bb-action="accept-all">Alle akzeptieren</button>
        <button type="button" class="bb-consent-btn bb-consent-btn-ghost" data-bb-action="reject-all">Nur notwendige</button>
        <button type="button" class="bb-consent-btn-link" data-bb-action="open-settings">Einstellungen anpassen</button>
      </div>
    `;
    return el;
  }

  function buildModal() {
    var el = document.createElement('div');
    el.className = 'bb-consent-modal';
    el.id = 'bb-consent-modal';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'bb-consent-modal-title');
    el.innerHTML = `
      <button type="button" class="bb-consent-modal-close" data-bb-action="close-settings" aria-label="Schließen">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
      <div class="bb-consent-modal-eyebrow">Datenschutz-Einstellungen</div>
      <h3 id="bb-consent-modal-title">Du entscheidest, was läuft.</h3>
      <p class="bb-consent-modal-sub">Notwendige Cookies sind immer an — sonst funktioniert die Seite nicht. Alles andere kannst du frei wählen und jederzeit ändern.</p>

      <div class="bb-consent-cat">
        <div class="bb-consent-cat-info">
          <div class="bb-consent-cat-name">Notwendig</div>
          <div class="bb-consent-cat-desc">Damit Formulare und Login funktionieren. Speichert keine Marketing-Daten.</div>
        </div>
        <button type="button" class="bb-consent-toggle is-on is-disabled" disabled aria-label="Notwendige Cookies (immer aktiv)"></button>
      </div>

      <div class="bb-consent-cat">
        <div class="bb-consent-cat-info">
          <div class="bb-consent-cat-name">Statistik</div>
          <div class="bb-consent-cat-desc">Anonyme Webanalyse, damit wir sehen welche Inhalte hilfreich sind. Keine personenbezogenen Profile.</div>
        </div>
        <button type="button" class="bb-consent-toggle" data-bb-toggle="statistik" aria-label="Statistik aktivieren"></button>
      </div>

      <div class="bb-consent-cat">
        <div class="bb-consent-cat-info">
          <div class="bb-consent-cat-name">Marketing</div>
          <div class="bb-consent-cat-desc">Tracking-Pixel von Meta, Google Ads, LinkedIn — nur wenn aktiv. Aktuell laden wir keine.</div>
        </div>
        <button type="button" class="bb-consent-toggle" data-bb-toggle="marketing" aria-label="Marketing aktivieren"></button>
      </div>

      <div class="bb-consent-modal-actions">
        <button type="button" class="bb-consent-btn bb-consent-btn-ghost" data-bb-action="reject-all">Nur notwendige</button>
        <button type="button" class="bb-consent-btn bb-consent-btn-primary" data-bb-action="save-settings">Auswahl speichern</button>
      </div>
    `;
    return el;
  }

  // ----- UI Mount + Events ------------------------------------
  var bannerEl = null;
  var modalEl = null;
  var overlayEl = null;
  var modalState = { statistik: false, marketing: false };

  function mount() {
    if (bannerEl) return;
    injectStyles();
    bannerEl = buildBanner();
    modalEl = buildModal();
    overlayEl = document.createElement('div');
    overlayEl.className = 'bb-consent-overlay';
    overlayEl.id = 'bb-consent-overlay';
    document.body.appendChild(overlayEl);
    document.body.appendChild(bannerEl);
    document.body.appendChild(modalEl);

    // Banner-Buttons
    bannerEl.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-bb-action]');
      if (!btn) return;
      var action = btn.getAttribute('data-bb-action');
      if (action === 'accept-all') acceptAll();
      else if (action === 'reject-all') rejectAll();
      else if (action === 'open-settings') openSettings();
    });

    // Modal-Buttons
    modalEl.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-bb-action], [data-bb-toggle]');
      if (!btn) return;
      var action = btn.getAttribute('data-bb-action');
      var toggleKey = btn.getAttribute('data-bb-toggle');
      if (toggleKey) {
        modalState[toggleKey] = !modalState[toggleKey];
        btn.classList.toggle('is-on', modalState[toggleKey]);
      } else if (action === 'accept-all') {
        modalState = { statistik: true, marketing: true };
        syncModalToggles();
        save();
        closeAll();
      } else if (action === 'reject-all') {
        rejectAll();
      } else if (action === 'save-settings') {
        save();
        closeAll();
      } else if (action === 'close-settings') {
        closeSettings();
      }
    });

    // Overlay-Click schließt Modal
    overlayEl.addEventListener('click', function () {
      if (modalEl.classList.contains('is-open')) closeSettings();
    });

    // ESC schließt Modal
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modalEl.classList.contains('is-open')) closeSettings();
    });
  }

  function syncModalToggles() {
    if (!modalEl) return;
    var toggles = modalEl.querySelectorAll('[data-bb-toggle]');
    toggles.forEach(function (t) {
      var key = t.getAttribute('data-bb-toggle');
      t.classList.toggle('is-on', !!modalState[key]);
    });
  }

  function showBanner() {
    if (!bannerEl) mount();
    requestAnimationFrame(function () {
      bannerEl.classList.add('is-open');
    });
  }

  function hideBanner() {
    if (bannerEl) bannerEl.classList.remove('is-open');
  }

  function openSettings() {
    if (!modalEl) mount();
    // Vorbelegen mit aktuellem Consent (oder false wenn noch keiner)
    if (state.consent) {
      modalState.statistik = !!state.consent.statistik;
      modalState.marketing = !!state.consent.marketing;
    }
    syncModalToggles();
    hideBanner();
    overlayEl.classList.add('is-open');
    requestAnimationFrame(function () {
      modalEl.classList.add('is-open');
    });
  }

  function closeSettings() {
    modalEl.classList.remove('is-open');
    overlayEl.classList.remove('is-open');
    // Wenn noch kein Consent gesetzt → Banner wieder zeigen
    if (!state.consent) {
      setTimeout(showBanner, 200);
    }
  }

  function closeAll() {
    hideBanner();
    if (modalEl) modalEl.classList.remove('is-open');
    if (overlayEl) overlayEl.classList.remove('is-open');
  }

  // ----- Actions ----------------------------------------------
  function acceptAll() {
    state.consent = makeConsent({ statistik: true, marketing: true });
    write(state.consent);
    closeAll();
    fireListeners();
  }

  function rejectAll() {
    state.consent = makeConsent({ statistik: false, marketing: false });
    write(state.consent);
    closeAll();
    fireListeners();
  }

  function save() {
    state.consent = makeConsent({
      statistik: modalState.statistik,
      marketing: modalState.marketing,
    });
    write(state.consent);
    fireListeners();
  }

  // ----- Public API -------------------------------------------
  window.bbConsent = {
    has: function (cat) {
      if (!state.consent) return false;
      return !!state.consent[cat];
    },
    get: function () {
      return state.consent ? Object.assign({}, state.consent) : null;
    },
    set: function (opts) {
      state.consent = makeConsent(opts);
      write(state.consent);
      fireListeners();
    },
    show: function () {
      if (state.consent) openSettings();
      else showBanner();
    },
    onChange: function (fn) {
      if (typeof fn === 'function') state.listeners.push(fn);
    },
    reset: function () {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      state.consent = null;
      mount();
      showBanner();
    },
  };

  // ----- Init -------------------------------------------------
  function init() {
    state.consent = read();
    mount();
    if (!state.consent) {
      // Erster Besuch → Banner zeigen (300ms delayed für sanfteren Page-Load)
      setTimeout(showBanner, 400);
    }
    // Footer-Trigger: <a data-bb-consent-open> klickbar überall
    document.addEventListener('click', function (e) {
      var trigger = e.target.closest('[data-bb-consent-open]');
      if (trigger) {
        e.preventDefault();
        window.bbConsent.show();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
