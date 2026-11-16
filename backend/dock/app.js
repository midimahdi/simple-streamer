import { ObsWebSocketClient } from './obs-client.js';
import { t, setLanguage, getLanguage, I18N } from './locales.js';

// Platform SVG Icons (Clean & Scalable)
const PLATFORM_ICONS = {
  youtube: `<svg class="platform-svg yt" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
  facebook: `<svg class="platform-svg fb" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
  twitch: `<svg class="platform-svg twitch" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2.149 0l-1.612 4.119v16.8h5.9v3.081h3.081l3.08-3.081h4.632l6.219-6.219V0H2.149zm19.231 13.638l-3.693 3.693h-5.228l-3.081 3.081v-3.081H4.632V2.149h16.748v11.489zm-4.632-6.529h-2.149v5.901h2.149V7.109zm-5.9 0H8.699v5.901h2.149V7.109z"/></svg>`,
  kick: `<svg class="platform-svg kick" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M1.333 0h7.62v7.619h3.809V3.81h3.81V0h7.618v11.429h-3.81v3.809h3.81V24h-7.619v-3.81h-3.81v-3.809H8.952V24H1.333V0z"/></svg>`,
  custom: `<svg class="platform-svg custom" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`,
};

const DEFAULT_CLOUD_BACKEND = 'https://simple-streamer.bdjlmn.com';
function resolveBackendUrl() {
  const custom = localStorage.getItem('obs_orchestrator_backend_url');
  if (custom && !custom.includes('45455') && !custom.includes('127.0.0.1') && !custom.includes('localhost') && !custom.includes('192.168.')) {
    return custom;
  }
  if (custom) {
    try { localStorage.removeItem('obs_orchestrator_backend_url'); } catch (_) {}
  }
  if (window.location.origin && window.location.origin.includes('simple-streamer.bdjlmn.com')) {
    return window.location.origin;
  }
  return DEFAULT_CLOUD_BACKEND;
}

// Application State
const state = {
  obs: new ObsWebSocketClient(),
  isStreaming: false,
  isRecording: false,
  isPreparing: false,
  isEnding: false,
  isManagedStream: false,
  isExternalStream: false,
  ephemeralThumbnailBase64: null, // Strictly in-memory, never saved to localStorage (cleared on Go Live)
  timerInterval: null,
  metricsInterval: null,
  streamStartTime: null,
  destinations: [], // Configured destinations list
  activeBroadcast: {
    title: '',
    destinations: [], // Resolved active destinations with streaming status
  },
  lastCloudPoll: 0,
  reconnectTimer: null,
  reconnectAttempts: 0,
  config: {
    obsUrl: localStorage.getItem('obs_orchestrator_ws_url') || 'ws://127.0.0.1:4455',
    obsPass: localStorage.getItem('obs_orchestrator_ws_pass') || '',
    backendUrl: resolveBackendUrl(),
    apiKey: localStorage.getItem('obs_orchestrator_api_key') || '',
  },
  proOffer: {
    dealActive: true,
    ctaLabel: '⚡ Claim Lifetime Pass ($5 Once) ↗',
    alertCtaLabel: 'LIFETIME PASS ($5) ↗',
    paymentUrl: 'https://buy.stripe.com/fZuaEXafk39B03W6e85EY02',
    expiresAt: null,
  },
  discoveryCallback: null,
  sessionPin: localStorage.getItem('simple_streamer_pin') || (() => {
    const p = Math.floor(1000 + Math.random() * 9000).toString();
    localStorage.setItem('simple_streamer_pin', p);
    return p;
  })(),
  remoteQr: null,
};

// DOM References
const el = {
  statusBadge: document.getElementById('statusBadge'),
  toggleDiagBtn: document.getElementById('toggleDiagBtn'),
  toggleRemoteBtn: document.getElementById('toggleRemoteBtn'),
  brandTitle: document.getElementById('brandTitle'),
  brandSub: document.getElementById('brandSub'),
  actionContainer: document.querySelector('.action-container'),
  alertBox: document.getElementById('alertBox'),
  alertCloseBtn: document.getElementById('alertCloseBtn'),
  alertTitle: document.getElementById('alertTitle'),
  alertMsg: document.getElementById('alertMsg'),
  alertActions: document.getElementById('alertActions'),
  updateBanner: document.getElementById('updateBanner'),
  updateBannerText: document.getElementById('updateBannerText'),
  btnDownloadUpdate: document.getElementById('btnDownloadUpdate'),
  btnCloseUpdateBanner: document.getElementById('btnCloseUpdateBanner'),
  liveContainer: document.getElementById('liveContainer'),
  liveHeader: document.getElementById('liveHeader'),
  liveTimer: document.getElementById('liveTimer'),
  platformLiveGrid: document.getElementById('platformLiveGrid'),
  metricBitrate: document.getElementById('metricBitrate'),
  metricFps: document.getElementById('metricFps'),
  metricDropped: document.getElementById('metricDropped'),
  metricRecord: document.getElementById('metricRecord'),
  inputGroup: document.getElementById('inputGroup'),
  lessonTitle: document.getElementById('lessonTitle'),
  lessonDescription: document.getElementById('lessonDescription'),
  titleCounter: document.getElementById('titleCounter'),
  templateSelector: document.getElementById('templateSelector'),
  thumbnailInput: document.getElementById('thumbnailInput'),
  thumbnailDropzone: document.getElementById('thumbnailDropzone'),
  thumbnailPrompt: document.getElementById('thumbnailPrompt'),
  thumbnailPreviewContainer: document.getElementById('thumbnailPreviewContainer'),
  thumbnailImgPreview: document.getElementById('thumbnailImgPreview'),
  thumbnailClearBtn: document.getElementById('thumbnailClearBtn'),
  actionBtn: document.getElementById('actionBtn'),
  actionBtnText: document.getElementById('actionBtnText'),
  diagPanel: document.getElementById('diagPanel'),
  langSelector: document.getElementById('langSelector'),

  // Elgato-Style Navigation & Views
  viewBroadcast: document.getElementById('viewBroadcast'),
  viewSettings: document.getElementById('viewSettings'),
  settingsLiveBar: document.getElementById('settingsLiveBar'),
  settingsLiveTimer: document.getElementById('settingsLiveTimer'),
  settingsMenu: document.getElementById('settingsMenu'),
  btnMenuDestinations: document.getElementById('btnMenuDestinations'),
  btnMenuRemote: document.getElementById('btnMenuRemote'),
  btnMenuAccount: document.getElementById('btnMenuAccount'),
  btnMenuGeneral: document.getElementById('btnMenuGeneral'),
  subpageDestinations: document.getElementById('subpageDestinations'),
  subpageRemote: document.getElementById('subpageRemote'),
  subpageAccount: document.getElementById('subpageAccount'),
  subpageGeneral: document.getElementById('subpageGeneral'),
  destLockedNotice: document.getElementById('destLockedNotice'),
  settingsDestCountSub: document.getElementById('settingsDestCountSub'),
  settingsAccountPlanSub: document.getElementById('settingsAccountPlanSub'),
  settingsAccountBadge: document.getElementById('settingsAccountBadge'),
  obsWsStatusBadge: document.getElementById('obsWsStatusBadge'),
  obsWsEndpointDisplay: document.getElementById('obsWsEndpointDisplay'),
  btnReconnectObsSettings: document.getElementById('btnReconnectObsSettings'),
  btnResetLocalData: document.getElementById('btnResetLocalData'),

  // Account & License UI
  btnHeaderAccount: document.getElementById('btnHeaderAccount'),
  accountCard: document.getElementById('accountCard'),
  accountBadge: document.getElementById('accountBadge'),
  accountInfo: document.getElementById('accountInfo'),
  accountActions: document.getElementById('accountActions'),
  btnSignInAccount: document.getElementById('btnSignInAccount'),
  btnLinkToken: document.getElementById('btnLinkToken'),

  // Remote Panel UI
  remotePanel: document.getElementById('remotePanel'),
  remoteQrContainer: document.getElementById('remoteQrContainer'),
  remoteUrlDisplay: document.getElementById('remoteUrlDisplay'),
  remoteMdnsDisplay: document.getElementById('remoteMdnsDisplay'),
  remotePinDisplay: document.getElementById('remotePinDisplay'),
  btnCopyRemoteUrl: document.getElementById('btnCopyRemoteUrl'),

  // Multi-destination UI
  destinationsPills: document.getElementById('destinationsPills'),
  destinationsList: document.getElementById('destinationsList'),
  btnToggleAddPlatforms: document.getElementById('btnToggleAddPlatforms'),
  addPlatformsGrid: document.getElementById('addPlatformsGrid'),

  // Discovery Card
  discoveryCard: document.getElementById('discoveryCard'),
  discoveryTitle: document.getElementById('discoveryTitle'),
  discoveryBody: document.getElementById('discoveryBody'),
  btnConfirmDiscovery: document.getElementById('btnConfirmDiscovery'),
  btnCancelDiscovery: document.getElementById('btnCancelDiscovery'),
  btnCloseDiscovery: document.getElementById('btnCloseDiscovery'),

  // Platform Add Buttons
  btnAddYt: document.getElementById('btnAddYt'),
  btnAddFb: document.getElementById('btnAddFb'),
  btnAddTwitch: document.getElementById('btnAddTwitch'),
  btnAddKick: document.getElementById('btnAddKick'),
  btnAddCustomRtmp: document.getElementById('btnAddCustomRtmp'),

  // Mid-Stream Live Metadata Update Action Bar
  liveMetadataUpdateBar: document.getElementById('liveMetadataUpdateBar'),
  btnUpdateLiveMetadata: document.getElementById('btnUpdateLiveMetadata'),
  btnUpdateLiveMetadataText: document.getElementById('btnUpdateLiveMetadataText'),
};

/**
 * Log message to console and diagnostics
 */
function logDiag(msg) {
  const ts = new Date().toLocaleTimeString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
}

/**
 * Update Main Action Button state based on OBS connection & system readiness
 */
function updateActionBtnState() {
  if (state.isExternalStream) {
    el.actionBtn.disabled = true;
    el.actionBtn.className = 'btn-primary external-live';
    el.actionBtnText.textContent = t('obsStreamingExternal') || '● OBS STREAMING (EXTERNAL)';
    el.actionBtn.title = t('externalStreamAlertMsg') || 'OBS is currently broadcasting via external controls or another plugin.';
    return;
  }
  el.actionBtn.title = '';

  if (state.isStreaming) {
    el.actionBtn.disabled = false;
    el.actionBtn.className = 'btn-primary stop';
    el.actionBtnText.textContent = t('endBroadcast');
    return;
  }

  if (state.isPreparing) {
    el.actionBtn.disabled = true;
    el.actionBtn.className = 'btn-primary';
    el.actionBtnText.textContent = t('startingBroadcast');
    return;
  }

  if (state.isEnding) {
    el.actionBtn.disabled = true;
    el.actionBtn.className = 'btn-primary';
    el.actionBtnText.textContent = t('stoppingBroadcast');
    return;
  }

  if (!state.obs.isConnected) {
    el.actionBtn.disabled = true;
    el.actionBtn.className = 'btn-primary';
    el.actionBtnText.textContent = t('connectingObs');
    return;
  }

  // Check destination readiness
  const activePrimary = getActivePrimaryDestination();
  const enabledTargets = state.destinations.filter((d) => d.enabled);
  // Sort so active runtime Primary platform is strictly Destination 0
  enabledTargets.sort((a, b) => (b.id === activePrimary?.id ? 1 : 0) - (a.id === activePrimary?.id ? 1 : 0));
  if (enabledTargets.length === 0) {
    el.actionBtn.disabled = true;
    el.actionBtn.className = 'btn-primary';
    el.actionBtnText.textContent = t('selectDestFirst');
    return;
  }

  const hasInvalid = enabledTargets.some((d) => d.status === 'invalid' && !d.credentials?.streamKey && !d.streamKey);
  if (hasInvalid) {
    el.actionBtn.disabled = true;
    el.actionBtn.className = 'btn-primary';
    el.actionBtnText.textContent = t('destError');
    return;
  }

  // Ready to stream
  el.actionBtn.disabled = false;
  el.actionBtn.className = 'btn-primary';
  el.actionBtnText.textContent = t('startBroadcast');
}

/**
 * Update UI Status Badge
 */
function setStatus(text, type = 'connected') {
  if (el.statusBadge) {
    el.statusBadge.textContent = text;
    el.statusBadge.className = `badge ${type}`;
  }
  updateActionBtnState();
  updateGeneralSettingsUI();
}

/**
 * Show Alert Banner with optional action buttons
 * @param {string} title
 * @param {string} message
 * @param {Array} actions
 * @param {'info'|'success'|'warning'|'error'} type
 */
function showAlert(title, message, actions = [], type = 'info') {
  if (!el.alertBox) return;
  el.alertBox.className = `alert-box ${type}`;
  el.alertTitle.textContent = title;
  el.alertMsg.textContent = message;
  el.alertActions.innerHTML = '';

  const finalActions = Array.isArray(actions) ? [...actions] : [];
  if (finalActions.length === 0) {
    finalActions.push({ label: 'DISMISS', onClick: () => clearAlert() });
  }

  finalActions.forEach((act) => {
    const btn = document.createElement('button');
    btn.className = 'alert-btn';
    btn.textContent = act.label;
    btn.onclick = () => {
      clearAlert();
      if (typeof act.onClick === 'function') {
        act.onClick();
      }
    };
    el.alertActions.appendChild(btn);
  });

  el.alertBox.style.display = 'block';
}

function clearAlert() {
  if (el.alertBox) {
    el.alertBox.style.display = 'none';
    el.alertBox.className = 'alert-box';
    el.alertActions.innerHTML = '';
  }
}

/**
 * Custom Thumbnail Ephemeral Management
 * Guarantees zero leakage into subsequent broadcasts.
 */
function clearThumbnail() {
  state.ephemeralThumbnailBase64 = null;
  if (el.thumbnailInput) el.thumbnailInput.value = '';
  if (el.thumbnailImgPreview) el.thumbnailImgPreview.src = '';
  if (el.thumbnailPreviewContainer) el.thumbnailPreviewContainer.style.display = 'none';
  if (el.thumbnailPrompt) el.thumbnailPrompt.style.display = 'flex';
  if (el.thumbnailClearBtn) el.thumbnailClearBtn.style.display = 'none';
}

async function processThumbnailFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    logDiag('Selected file is not an image');
    return;
  }

  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 1280;
            canvas.height = 720;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            const targetAspect = 1280 / 720;
            const sourceAspect = img.width / img.height;
            let renderWidth, renderHeight, offsetX, offsetY;

            if (sourceAspect > targetAspect) {
              renderHeight = 720;
              renderWidth = img.width * (720 / img.height);
              offsetX = -(renderWidth - 1280) / 2;
              offsetY = 0;
            } else {
              renderWidth = 1280;
              renderHeight = img.height * (1280 / img.width);
              offsetX = 0;
              offsetY = -(renderHeight - 720) / 2;
            }

            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, 1280, 720);
            ctx.drawImage(img, offsetX, offsetY, renderWidth, renderHeight);

            const compressed = canvas.toDataURL('image/jpeg', 0.82);
            resolve(compressed);
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = () => reject(new Error('Failed to load image preview'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(file);
    });

    state.ephemeralThumbnailBase64 = dataUrl;
    if (el.thumbnailImgPreview) el.thumbnailImgPreview.src = dataUrl;
    if (el.thumbnailPrompt) el.thumbnailPrompt.style.display = 'none';
    if (el.thumbnailPreviewContainer) el.thumbnailPreviewContainer.style.display = 'block';
    if (el.thumbnailClearBtn) el.thumbnailClearBtn.style.display = 'inline-block';
    logDiag('Thumbnail auto-optimized to 720p progressive JPEG (<200KB)');
  } catch (err) {
    logDiag(`Thumbnail processing error: ${err.message}`);
  }
}

/**
 * -------------------------------------------------------------
 * Title Guard & Dynamic Character Counter
 * -------------------------------------------------------------
 */
function updateTitleCounter() {
  if (!el.lessonTitle || !el.titleCounter) return;
  const len = el.lessonTitle.value.length;
  el.titleCounter.textContent = `${len}/100`;
  if (len >= 100) {
    el.titleCounter.style.color = '#ef4444';
    el.titleCounter.style.fontWeight = 'bold';
  } else if (len >= 90) {
    el.titleCounter.style.color = '#f59e0b';
    el.titleCounter.style.fontWeight = '600';
  } else {
    el.titleCounter.style.color = 'var(--text-muted)';
    el.titleCounter.style.fontWeight = 'normal';
  }
}

/**
 * -------------------------------------------------------------
 * Application Version & Update Checker
 * -------------------------------------------------------------
 */
const CURRENT_VERSION = '1.0.0';

async function checkForAppUpdates() {
  try {
    const res = await fetch(`${state.config.backendUrl}/api/version`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.stripePaymentUrl) {
      state.config.stripePaymentUrl = data.stripePaymentUrl;
    }
    if (data.proOffer) {
      state.proOffer = data.proOffer;
      if (!currentAccountSession?.isPro && !currentAccountSession?.is_founding_member) {
        renderAccountView();
      }
    }
    if (!data.ok || !data.hasUpdate) return;

    if (sessionStorage.getItem('dismissed_update_version') === data.latestVersion) {
      return;
    }

    if (el.updateBanner && el.updateBannerText && el.btnDownloadUpdate) {
      el.updateBannerText.innerHTML = `Update available: <strong>v${data.latestVersion}</strong>`;
      const isMac = /Mac|iPhone|iPad/i.test(navigator.userAgent || navigator.platform);
      const downloadUrl = isMac ? data.macDownloadUrl : data.windowsDownloadUrl;
      el.btnDownloadUpdate.href = downloadUrl || data.releaseUrl || 'https://simple-streamer.bdjlmn.com';
      el.updateBanner.style.display = 'flex';
      logDiag(`✨ Newer Simple Streamer version available: v${data.latestVersion}`);
    }
  } catch (_) {
    // Non-fatal, offline resilience
  }
}

/**
 * Returns dynamic, conditional Pro offer details.
 * When the deal expires or is deactivated, all deal text ($5, limited deal) cleanly disappears.
 */
function getProOffer() {
  const offer = state.proOffer || {};
  let isDealActive = offer.dealActive !== false;
  if (offer.expiresAt) {
    const exp = new Date(offer.expiresAt).getTime();
    if (!isNaN(exp) && Date.now() > exp) {
      isDealActive = false;
    }
  }
  const paymentUrl = offer.paymentUrl || state.config.stripePaymentUrl || 'https://buy.stripe.com/fZuaEXafk39B03W6e85EY02';
  return {
    dealActive: isDealActive,
    title: isDealActive ? '🔥 LIFETIME FOUNDING DEAL — $5 ONCE' : '⭐ SIMPLE STREAMER PRO ($12/YR)',
    dealBadge: isDealActive ? 'LIMITED DEAL' : 'ANNUAL',
    ctaLabel: isDealActive
      ? (offer.ctaLabel || '⚡ Claim Lifetime Pass ($5 Once) ↗')
      : '⚡ Upgrade to Pro ($12/yr) ↗',
    alertCtaLabel: isDealActive
      ? (offer.alertCtaLabel || 'LIFETIME PASS ($5) ↗')
      : 'UPGRADE PRO ↗',
    paymentUrl,
  };
}

/**
 * Reset all local storage, accounts, and destinations to start with a blank slate.
 */
async function resetAllLocalState() {
  if (!confirm('Are you sure you want to reset all local settings, connected accounts, and cached tokens to start fresh?')) {
    return;
  }
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch (_) {}
  try {
    await fetch('http://127.0.0.1:45455/broadcast-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '', description: '', destinations: [] }),
    });
  } catch (_) {}
  try {
    await fetch('http://127.0.0.1:45455/save-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: '' }),
    });
  } catch (_) {}
  window.location.reload();
}

/**
 * -------------------------------------------------------------
 * Account & Device License Management
 * -------------------------------------------------------------
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, (m) => {
    switch (m) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#039;';
      default: return m;
    }
  });
}

let currentAccountSession = null;

function loadCachedAccountSession() {
  try {
    const raw = localStorage.getItem('simple_streamer_account_session');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.ok) {
        currentAccountSession = parsed;
        updateAccountUI(parsed);
      }
    }
  } catch (_) {}
}

function updateAccountUI(data) {
  if (!el.accountCard) return;

  if (data && data.ok) {
    currentAccountSession = data;
    try {
      localStorage.setItem('simple_streamer_account_session', JSON.stringify(data));
    } catch (_) {}
    const user = data.user || {};
    const email = user.email || 'Authenticated Streamer';
    const isFounding = data.is_founding_member || data.subscription_status === 'lifetime_founding';
    const isPro = isFounding || data.isPro || data.subscription_status === 'pro';
    const deviceCount = data.device_count || 1;
    const maxDevices = data.max_devices || 2;

    if (el.accountBadge) {
      if (isFounding) {
        el.accountBadge.textContent = t('founding100Badge');
        el.accountBadge.style.background = 'rgba(245, 158, 11, 0.2)';
        el.accountBadge.style.color = '#fbbf24';
        el.accountBadge.style.border = '1px solid rgba(245, 158, 11, 0.4)';
      } else if (isPro) {
        el.accountBadge.textContent = t('proEditionBadge');
        el.accountBadge.style.background = 'rgba(52, 211, 153, 0.2)';
        el.accountBadge.style.color = '#34d399';
        el.accountBadge.style.border = '1px solid rgba(52, 211, 153, 0.4)';
      } else {
        el.accountBadge.textContent = t('freeEditionBadge');
        el.accountBadge.style.background = 'rgba(148, 163, 184, 0.15)';
        el.accountBadge.style.color = '#94a3b8';
        el.accountBadge.style.border = 'none';
      }
    }

    if (el.btnHeaderAccount) {
      if (isFounding) {
        el.btnHeaderAccount.textContent = t('foundingBadge');
        el.btnHeaderAccount.style.color = '#fbbf24';
        el.btnHeaderAccount.style.borderColor = 'rgba(245, 158, 11, 0.5)';
        el.btnHeaderAccount.style.background = 'rgba(245, 158, 11, 0.15)';
      } else if (isPro) {
        el.btnHeaderAccount.textContent = t('proBadge');
        el.btnHeaderAccount.style.color = '#34d399';
        el.btnHeaderAccount.style.borderColor = 'rgba(52, 211, 153, 0.5)';
        el.btnHeaderAccount.style.background = 'rgba(52, 211, 153, 0.15)';
      } else {
        el.btnHeaderAccount.textContent = t('freeBadge');
        el.btnHeaderAccount.style.color = '#94a3b8';
        el.btnHeaderAccount.style.borderColor = '#334155';
        el.btnHeaderAccount.style.background = 'rgba(148, 163, 184, 0.15)';
      }
    }

    if (el.accountInfo) {
      el.accountInfo.style.display = 'block';
      const planText = isFounding ? t('lifetimePassText') : isPro ? t('activeProSubText') : t('freeCoreText');
      const linkedText = t('machinesLinked', { count: deviceCount, max: maxDevices });
      el.accountInfo.innerHTML = `
        <div class="account-user-email">${escapeHtml(email)}</div>
        <div class="account-user-meta">
          ${planText} · <span class="account-devices-count">${linkedText}</span>
        </div>
      `;
    }

    if (el.accountActions) {
      el.accountActions.innerHTML = `
        <button type="button" id="btnManageAccount" class="btn-account-primary">${t('btnManageAccount')}</button>
        <button type="button" id="btnSignOutAccount" class="btn-account-signout">${t('btnSignOut')}</button>
      `;
      const btnManage = document.getElementById('btnManageAccount');
      if (btnManage) {
        btnManage.onclick = () => openExternalUrl('https://simple-streamer.bdjlmn.com/account');
      }
      const btnSignOut = document.getElementById('btnSignOutAccount');
      if (btnSignOut) {
        btnSignOut.onclick = () => signOutAccount();
      }
    }
  } else {
    currentAccountSession = null;
    try {
      localStorage.removeItem('simple_streamer_account_session');
    } catch (_) {}
    if (el.accountBadge) {
      el.accountBadge.textContent = t('freeEditionBadge');
      el.accountBadge.style.background = 'rgba(148, 163, 184, 0.15)';
      el.accountBadge.style.color = '#94a3b8';
      el.accountBadge.style.border = 'none';
    }
    if (el.btnHeaderAccount) {
      el.btnHeaderAccount.textContent = '⚡ Upgrade Pro';
      el.btnHeaderAccount.style.color = '#fbbf24';
      el.btnHeaderAccount.style.borderColor = 'rgba(245, 158, 11, 0.5)';
      el.btnHeaderAccount.style.background = 'rgba(245, 158, 11, 0.15)';
    }
    if (el.accountInfo) {
      el.accountInfo.style.display = 'none';
      el.accountInfo.innerHTML = '';
    }
    if (el.accountActions) {
      const offer = getProOffer();
      el.accountActions.innerHTML = `
        <div class="pro-offer-card" style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 8px; padding: 12px; margin-bottom: 12px; width: 100%; box-sizing: border-box;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <span style="font-size: 11px; font-weight: 800; color: #fbbf24; letter-spacing: 0.3px;">${escapeHtml(offer.title)}</span>
          </div>
          <div style="font-size: 11px; color: #fde68a; line-height: 1.5; margin-bottom: 12px;">
            <div style="display: flex; align-items: flex-start; gap: 6px; margin-bottom: 6px;">
              <span style="color: #fbbf24; font-weight: 700; flex-shrink: 0;">✓</span>
              <span>1-Click broadcast with synced title, description & thumbnail</span>
            </div>
            <div style="display: flex; align-items: flex-start; gap: 6px; margin-bottom: 6px;">
              <span style="color: #fbbf24; font-weight: 700; flex-shrink: 0;">✓</span>
              <span>Update stream title & info mid-broadcast without stopping OBS</span>
            </div>
            <div style="display: flex; align-items: flex-start; gap: 6px;">
              <span style="color: #fbbf24; font-weight: 700; flex-shrink: 0;">✓</span>
              <span>Mobile phone remote control over internet or cellular</span>
            </div>
          </div>
          <button type="button" id="btnUpgradePro" class="btn-account-primary" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: #000; font-weight: 800; border: none; padding: 9px 12px; width: 100%; border-radius: 6px; cursor: pointer; font-size: 11px; display: flex; align-items: center; justify-content: center; gap: 6px;">${escapeHtml(offer.ctaLabel)}</button>
        </div>

        <div style="width: 100%; text-align: center; margin-top: 2px;">
          <div style="font-size: 10px; color: #64748b; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Already have a license?</div>
          <button type="button" id="btnSignInAccount" class="btn-account-secondary" style="width: 100%; font-size: 11px; padding: 7px 10px; background: #1e2434; color: #cbd5e1; border: 1px solid #334155; border-radius: 6px; cursor: pointer; font-weight: 600;">${t('btnSignInClaim')}</button>
          <button type="button" id="btnLinkToken" style="background: none; border: none; color: #64748b; font-size: 10px; cursor: pointer; text-decoration: underline; margin-top: 8px; padding: 2px;">Have an offline license key? Paste token</button>
        </div>
      `;
      const btnUp = document.getElementById('btnUpgradePro');
      if (btnUp) {
        btnUp.onclick = () => openExternalUrl(offer.paymentUrl);
      }
      const btnIn = document.getElementById('btnSignInAccount');
      if (btnIn) {
        btnIn.onclick = () => startAccountSignInFlow();
      }
      const btnLnk = document.getElementById('btnLinkToken');
      if (btnLnk) {
        btnLnk.onclick = () => promptPasteToken();
      }
    }
  }
  updateSettingsMenuSubtitles();
}

async function verifyAccountSession() {
  const token = getAuthToken();
  if (!token) {
    updateAccountUI(null);
    return;
  }

  try {
    const hwid = await syncDeviceHwidFromBridge();
    if (!hwid) {
      logDiag('Waiting for native bridge to provide authentic hardware identifier before device check...');
      return;
    }

    const res = await fetch(`${state.config.backendUrl}/auth/device-check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        token,
        hwid,
        deviceName: 'OBS Studio Workstation',
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      if (res.status === 403 && errData.error === 'DEVICE_LIMIT_REACHED') {
        showAlert(
          'DEVICE LIMIT REACHED',
          'This account has reached its 2-device limit. Manage or revoke devices at simple-streamer.bdjlmn.com/account.',
          [{ label: 'MANAGE DEVICES', onClick: () => openExternalUrl('https://simple-streamer.bdjlmn.com/account') }],
          'warning'
        );
      }
      if (!currentAccountSession) {
        updateAccountUI(null);
      }
      return;
    }

    const data = await res.json();
    if (data.ok) {
      updateAccountUI(data);
      // Auto-sync presets if Pro
      if (data.isPro || data.is_founding_member || data.subscription_status === 'pro' || data.subscription_status === 'lifetime_founding') {
        syncPresetsWithCloud(false).catch(() => {});
      }
    } else {
      updateAccountUI(null);
    }
  } catch (_) {
    // Offline resilience: if offline, retain cached state if available
  }
}

function promptPasteToken() {
  const token = prompt(t('promptPasteToken'));
  if (token && token.trim()) {
    localStorage.setItem('simple_streamer_auth_token', token.trim());
    logDiag('Validating account token...');
    verifyAccountSession().then(() => {
      showAlert(t('signedInSuccessTitle') || '✓ SIGNED IN', t('accountLinkedAlert'), [], 'success');
    });
  }
}

function signOutAccount() {
  if (confirm(t('confirmSignOut'))) {
    localStorage.removeItem('simple_streamer_auth_token');
    localStorage.removeItem('simple_streamer_pro_token');
    localStorage.removeItem('simple_streamer_account_session');
    updateAccountUI(null);
    showAlert(t('alertTitle'), t('alertSignedOut'), [], 'info');
  }
}

let accountAuthPollTimer = null;

function startAccountSignInFlow() {
  const sessionId = generateSecureSessionId('session_user');
  openExternalUrl(`https://simple-streamer.bdjlmn.com/login?session=${sessionId}`);
  logDiag('Waiting for account authentication in browser...');
  startAccountAuthPoll(sessionId);
}

function startAccountAuthPoll(sessionId) {
  if (accountAuthPollTimer) {
    clearInterval(accountAuthPollTimer);
    accountAuthPollTimer = null;
  }
  let attempts = 0;
  const maxAttempts = 120; // 3 minutes
  accountAuthPollTimer = setInterval(async () => {
    attempts++;
    if (attempts > maxAttempts) {
      clearInterval(accountAuthPollTimer);
      accountAuthPollTimer = null;
      return;
    }
    try {
      const res = await fetch(`${state.config.backendUrl}/api/auth-session?session=${sessionId}&_t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.ok && data.token) {
        clearInterval(accountAuthPollTimer);
        accountAuthPollTimer = null;
        localStorage.setItem('simple_streamer_auth_token', data.token);
        fetch('http://127.0.0.1:45455/focus-obs', { mode: 'no-cors' }).catch(() => {});
        await verifyAccountSession();
        showAlert(
          t('signedInSuccessTitle') || '✓ SIGNED IN',
          t('accountConnectedWelcome', { email: data.user?.email || 'Streamer' }),
          [],
          'success'
        );
      }
    } catch (_) {}
  }, 1500);
}

/**
 * -------------------------------------------------------------
 * Metadata Real-Time Two-Way Sync (Local Bridge & Remote Phone)
 * -------------------------------------------------------------
 */
function syncMetadataToBridgeAndRemote(titleOverride, descOverride) {
  const titleEl = document.getElementById('lessonTitle');
  const descEl = document.getElementById('lessonDescription');

  let title = (typeof titleOverride === 'string') ? titleOverride.trim() : (titleEl ? titleEl.value.trim() : '');
  let description = (typeof descOverride === 'string') ? descOverride.trim() : (descEl ? descEl.value.trim() : '');

  // Guard against any event object leakage
  if (title.includes('[object')) title = '';
  if (description.includes('[object')) description = '';

  // Persist immediately to local bridge so background poll sees updated values
  fetch(`http://127.0.0.1:45455/save-title?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}`).catch(() => {});

  // Broadcast to mobile remotes via OBS WebSocket CustomEvent
  if (state.obs && state.obs.isConnected) {
    state.obs.call('BroadcastCustomEvent', {
      eventData: {
        action: 'METADATA_CHANGED',
        title,
        description,
        destinations: (state.destinations || []).map((d) => ({
          id: d.id,
          name: d.name || d.platform,
          platform: d.platform,
          enabled: d.enabled !== false,
        })),
      }
    }).catch(() => {});
  }
}

/**
 * -------------------------------------------------------------
 * Broadcast Preset Templates Engine
 * -------------------------------------------------------------
 */
const DEFAULT_PRESET_TEMPLATES = [];
let activePresetId = localStorage.getItem('simple_streamer_active_preset') || '';

function getAuthToken() {
  return (
    localStorage.getItem('simple_streamer_auth_token') ||
    localStorage.getItem('simple_streamer_pro_token') ||
    state.config.apiKey ||
    ''
  );
}

let cachedBridgeHwid = null;

async function syncDeviceHwidFromBridge() {
  if (cachedBridgeHwid && cachedBridgeHwid.length >= 8 && !cachedBridgeHwid.startsWith('obs_dock_')) {
    return cachedBridgeHwid;
  }

  // Purge any legacy synthetic dummy IDs from storage
  const stored = localStorage.getItem('simple_streamer_hwid');
  if (stored && (stored.startsWith('obs_dock_') || stored === 'default-hwid' || stored.length < 8)) {
    localStorage.removeItem('simple_streamer_hwid');
  } else if (stored && stored.length >= 8) {
    cachedBridgeHwid = stored.trim();
  }

  // Query native bridge (retry up to 3 times with backoff if bridge is starting up)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch('http://127.0.0.1:45455/remote-config', { mode: 'cors' });
      if (res.ok) {
        const data = await res.json();
        const bridgeHwid = data.hwid || data.machineId;
        if (bridgeHwid && bridgeHwid.length >= 8 && !bridgeHwid.startsWith('obs_dock_')) {
          cachedBridgeHwid = bridgeHwid.trim();
          localStorage.setItem('simple_streamer_hwid', cachedBridgeHwid);
          return cachedBridgeHwid;
        }
      }
    } catch (_) {}
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
    }
  }

  // Return verified bridge HWID if available, never generate synthetic obs_dock_ IDs
  if (cachedBridgeHwid && cachedBridgeHwid.length >= 8 && !cachedBridgeHwid.startsWith('obs_dock_')) {
    return cachedBridgeHwid;
  }

  return null;
}

function applyTemplateVariables(str) {
  if (!str) return '';
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayStr = days[now.getDay()];
  const timeStr = now.toTimeString().substring(0, 5);
  return str
    .replace(/\{date\}/g, dateStr)
    .replace(/\{day\}/g, dayStr)
    .replace(/\{time\}/g, timeStr);
}

function getSavedTemplates() {
  try {
    const raw = localStorage.getItem('simple_streamer_templates');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Filter out hardcoded demo presets
    const cleaned = parsed.filter(
      (t) => t.id !== 'tpl_khutbah' && t.id !== 'tpl_halaqah' && t.id !== 'tpl_podcast'
    );
    if (cleaned.length !== parsed.length) {
      localStorage.setItem('simple_streamer_templates', JSON.stringify(cleaned));
    }
    return cleaned;
  } catch (_) {
    return [];
  }
}

function isPresetDirty() {
  if (!activePresetId) return false;
  const templates = getSavedTemplates();
  const activeTpl = templates.find((t) => t.id === activePresetId);
  if (!activeTpl) return false;

  const curTitle = el.lessonTitle ? el.lessonTitle.value.trim() : '';
  const curDesc = el.lessonDescription ? el.lessonDescription.value.trim() : '';

  const appliedTitle = applyTemplateVariables(activeTpl.title).slice(0, 100);
  const appliedDesc = applyTemplateVariables(activeTpl.description);

  return (curTitle !== activeTpl.title && curTitle !== appliedTitle) ||
         (curDesc !== activeTpl.description && curDesc !== appliedDesc);
}

function renderTemplateOptions() {
  if (!el.templateSelector) return;
  const templates = getSavedTemplates();
  el.templateSelector.innerHTML = '';

  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = t('presetsHeader');
  if (!activePresetId) defaultOpt.selected = true;
  el.templateSelector.appendChild(defaultOpt);

  const activeTpl = templates.find((t) => t.id === activePresetId);
  const dirty = isPresetDirty();

  // ONLY show "Save changes" if a preset is active AND has unsaved modifications
  if (activeTpl && dirty) {
    const updateOpt = document.createElement('option');
    updateOpt.value = '__update__';
    updateOpt.textContent = t('savePresetTo', { name: activeTpl.name });
    el.templateSelector.appendChild(updateOpt);
  }

  const newOpt = document.createElement('option');
  newOpt.value = '__new__';
  newOpt.textContent = t('newPreset');
  el.templateSelector.appendChild(newOpt);

  templates.forEach((tpl) => {
    const opt = document.createElement('option');
    opt.value = tpl.id;
    opt.textContent = `📋 ${tpl.name}`;
    if (tpl.id === activePresetId && !dirty) opt.selected = true;
    el.templateSelector.appendChild(opt);
  });

  if (templates.length > 0) {
    const delOpt = document.createElement('option');
    delOpt.value = '__delete__';
    delOpt.textContent = t('deletePreset');
    el.templateSelector.appendChild(delOpt);
  }

  const token = getAuthToken();
  if (token) {
    const syncOpt = document.createElement('option');
    syncOpt.value = '__sync__';
    syncOpt.textContent = t('syncPresetsCloud');
    el.templateSelector.appendChild(syncOpt);
  }
}

async function syncPresetsWithCloud(isManual = false) {
  const token = getAuthToken();
  if (!token) {
    if (isManual) {
      logDiag('ℹ️ Log in to Simple Streamer Pro to sync presets across your 2 machines.');
    }
    return;
  }

  try {
    const localTemplates = getSavedTemplates();
    const res = await fetch(`${state.config.backendUrl}/presets/cloud`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ presets: localTemplates }),
    });

    if (!res.ok) {
      if (isManual) logDiag(`Cloud preset sync failed: HTTP ${res.status}`);
      return;
    }

    const data = await res.json();
    if (data.ok && Array.isArray(data.presets)) {
      const cleaned = data.presets.filter(
        (t) => t.id !== 'tpl_khutbah' && t.id !== 'tpl_halaqah' && t.id !== 'tpl_podcast'
      );
      localStorage.setItem('simple_streamer_templates', JSON.stringify(cleaned));
      renderTemplateOptions();
      logDiag(`☁️ Presets synced across devices (${cleaned.length} active)`);
    }
  } catch (err) {
    if (isManual) logDiag(`Cloud preset sync error: ${err.message}`);
  }
}

function handleTemplateSelect(e) {
  const val = e.target.value;

  if (!val) {
    activePresetId = '';
    localStorage.removeItem('simple_streamer_active_preset');
    renderTemplateOptions();
    logDiag('Preset: None selected.');
    return;
  }

  if (val === '__sync__') {
    syncPresetsWithCloud(true);
    renderTemplateOptions();
    return;
  }

  if (val === '__update__') {
    const templates = getSavedTemplates();
    const tpl = templates.find((t) => t.id === activePresetId);
    if (tpl) {
      const curTitle = el.lessonTitle ? el.lessonTitle.value.trim() : '';
      const curDesc = el.lessonDescription ? el.lessonDescription.value.trim() : '';
      tpl.title = curTitle;
      tpl.description = curDesc;
      tpl.updated_at = new Date().toISOString();
      localStorage.setItem('simple_streamer_templates', JSON.stringify(templates));
      renderTemplateOptions();
      logDiag(`💾 Saved changes to preset "${tpl.name}".`);
      syncPresetsWithCloud(false);
    }
    return;
  }

  if (val === '__new__') {
    const currentTitle = el.lessonTitle ? el.lessonTitle.value.trim() : '';
    const currentDesc = el.lessonDescription ? el.lessonDescription.value.trim() : '';
    const name = prompt(t('enterPresetPrompt'), currentTitle || 'My Broadcast Preset');
    if (name && name.trim()) {
      const templates = getSavedTemplates();
      const newTpl = {
        id: 'tpl_' + Date.now(),
        name: name.trim(),
        title: currentTitle,
        description: currentDesc,
        updated_at: new Date().toISOString()
      };
      templates.push(newTpl);
      localStorage.setItem('simple_streamer_templates', JSON.stringify(templates));
      activePresetId = newTpl.id;
      localStorage.setItem('simple_streamer_active_preset', newTpl.id);
      renderTemplateOptions();
      logDiag(`Created preset: "${newTpl.name}"`);
      syncPresetsWithCloud(false);
    } else {
      renderTemplateOptions();
    }
    return;
  }

  if (val === '__delete__') {
    const templates = getSavedTemplates();
    if (templates.length === 0) {
      alert(t('deletePreset'));
      renderTemplateOptions();
      return;
    }
    const list = templates.map((t, idx) => `${idx + 1}. ${t.name}`).join('\n');
    const input = prompt(t('selectPresetToDelete', { list, max: templates.length }));
    if (input) {
      const idx = parseInt(input.trim(), 10) - 1;
      if (idx >= 0 && idx < templates.length) {
        const removed = templates.splice(idx, 1)[0];
        if (activePresetId === removed.id) {
          activePresetId = '';
          localStorage.removeItem('simple_streamer_active_preset');
        }
        localStorage.setItem('simple_streamer_templates', JSON.stringify(templates));
        logDiag(`Deleted preset: "${removed.name}"`);
        syncPresetsWithCloud(false);
      }
    }
    renderTemplateOptions();
    return;
  }

  const templates = getSavedTemplates();
  const selected = templates.find((t) => t.id === val);
  if (selected) {
    activePresetId = selected.id;
    localStorage.setItem('simple_streamer_active_preset', selected.id);

    const interpolatedTitle = applyTemplateVariables(selected.title).slice(0, 100);
    const interpolatedDesc = applyTemplateVariables(selected.description);

    if (el.lessonTitle) {
      el.lessonTitle.value = interpolatedTitle;
      localStorage.setItem('dock_lessonTitle', interpolatedTitle);
    }
    if (el.lessonDescription) {
      el.lessonDescription.value = interpolatedDesc;
      localStorage.setItem('dock_lessonDescription', interpolatedDesc);
    }
    updateTitleCounter();
    syncMetadataToBridgeAndRemote(interpolatedTitle, interpolatedDesc);
    logDiag(`Applied preset: ${selected.name}`);
    renderTemplateOptions();
  }
}

/**
 * Timer Formatting (HH:MM:SS)
 */
function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000);
  const hrs = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const secs = String(totalSec % 60).padStart(2, '0');
  return `${hrs}:${mins}:${secs}`;
}

function startTimer() {
  stopTimer();
  state.streamStartTime = Date.now();
  if (el.liveTimer) el.liveTimer.textContent = '00:00:00';
  if (el.settingsLiveTimer) el.settingsLiveTimer.textContent = '00:00:00';
  state.timerInterval = setInterval(() => {
    const elapsed = Date.now() - state.streamStartTime;
    const str = formatElapsed(elapsed);
    if (el.liveTimer) el.liveTimer.textContent = str;
    if (el.settingsLiveTimer) el.settingsLiveTimer.textContent = str;
  }, 1000);

  startMetricsPolling();
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
  stopMetricsPolling();
}

// Navigation Controller (Elgato-Style Subpages)
const nav = {
  currentView: 'broadcast', // 'broadcast' | 'settings_menu' | 'destinations' | 'remote' | 'account' | 'general'
  previousView: 'broadcast',
};

function navigateTo(targetView) {
  nav.previousView = nav.currentView;
  nav.currentView = targetView;
  renderNavigation();
}

function renderNavigation() {
  const isSettings = nav.currentView !== 'broadcast';
  const isSubpage = isSettings && nav.currentView !== 'settings_menu';

  // Toggle Top-level Views
  if (el.viewBroadcast) el.viewBroadcast.style.display = isSettings ? 'none' : 'flex';
  if (el.viewSettings) el.viewSettings.style.display = isSettings ? 'flex' : 'none';

  // Toggle Header Account / Sign In button
  if (el.btnHeaderAccount) {
    el.btnHeaderAccount.style.display = isSettings ? 'none' : '';
  }

  // Toggle Header Action Button state (⚙ ↔ ✕ ↔ ←)
  if (el.toggleDiagBtn) {
    el.toggleDiagBtn.classList.toggle('active', isSettings);
    el.toggleDiagBtn.classList.toggle('is-back', isSubpage);

    if (!isSettings) {
      el.toggleDiagBtn.textContent = '⚙';
      el.toggleDiagBtn.title = t('toggleSettingsTip');
      el.toggleDiagBtn.setAttribute('data-i18n-title', 'toggleSettingsTip');
      el.toggleDiagBtn.setAttribute('aria-label', t('toggleSettingsTip') || 'Settings');
    } else if (nav.currentView === 'settings_menu') {
      el.toggleDiagBtn.textContent = '✕';
      el.toggleDiagBtn.title = t('backToAppTip') || 'Close Settings';
      el.toggleDiagBtn.setAttribute('data-i18n-title', 'backToAppTip');
      el.toggleDiagBtn.setAttribute('aria-label', t('backToAppTip') || 'Close Settings');
    } else {
      el.toggleDiagBtn.textContent = '←';
      el.toggleDiagBtn.title = t('settingsBackSettings') || 'Back to Settings';
      el.toggleDiagBtn.setAttribute('data-i18n-title', 'settingsBackSettings');
      el.toggleDiagBtn.setAttribute('aria-label', t('settingsBackSettings') || 'Back to Settings');
    }
  }

  // Contextual Header Title
  if (el.brandTitle) {
    if (!isSettings) {
      el.brandTitle.textContent = t('brandTitle');
      el.brandTitle.setAttribute('data-i18n', 'brandTitle');
    } else if (nav.currentView === 'settings_menu') {
      el.brandTitle.textContent = t('settingsNavTitle') || 'SETTINGS';
      el.brandTitle.removeAttribute('data-i18n');
    } else if (nav.currentView === 'destinations') {
      el.brandTitle.textContent = t('destinationsTitle');
      el.brandTitle.removeAttribute('data-i18n');
    } else if (nav.currentView === 'remote') {
      el.brandTitle.textContent = t('mobileRemoteMenuTitle');
      el.brandTitle.removeAttribute('data-i18n');
    } else if (nav.currentView === 'account') {
      el.brandTitle.textContent = t('accountPassTitle');
      el.brandTitle.removeAttribute('data-i18n');
    } else if (nav.currentView === 'general') {
      el.brandTitle.textContent = t('generalMenuTitle');
      el.brandTitle.removeAttribute('data-i18n');
    }
  }

  // Update live indicator inside settings
  if (el.settingsLiveBar) {
    el.settingsLiveBar.style.display = isSettings && state.isStreaming ? 'flex' : 'none';
    if (el.settingsLiveTimer && el.liveTimer) {
      el.settingsLiveTimer.textContent = el.liveTimer.textContent;
    }
  }

  // Subpages vs Master Menu Hub
  const subpages = [
    { el: el.settingsMenu, show: nav.currentView === 'settings_menu' },
    { el: el.subpageDestinations, show: nav.currentView === 'destinations' },
    { el: el.subpageRemote, show: nav.currentView === 'remote' },
    { el: el.subpageAccount, show: nav.currentView === 'account' },
    { el: el.subpageGeneral, show: nav.currentView === 'general' },
  ];

  subpages.forEach(({ el: node, show }) => {
    if (node) node.style.display = show ? 'block' : 'none';
  });

  // Refresh dynamic info in subpages
  if (isSettings) {
    if (nav.currentView === 'destinations') {
      if (el.destLockedNotice) {
        el.destLockedNotice.style.display = state.isStreaming ? 'block' : 'none';
      }
      renderDestinationsList();
    } else if (nav.currentView === 'remote') {
      updateRemotePanelInfo();
    } else if (nav.currentView === 'settings_menu') {
      updateSettingsMenuSubtitles();
    } else if (nav.currentView === 'general') {
      updateGeneralSettingsUI();
    }
  }

  window.scrollTo({ top: 0, behavior: 'instant' });
}

function handleTopRightAction() {
  if (nav.currentView === 'broadcast') {
    navigateTo('settings_menu');
  } else if (nav.currentView === 'settings_menu') {
    navigateTo('broadcast');
  } else {
    // If on any subpage: go back to settings menu
    navigateTo('settings_menu');
  }
}

function handleSettingsBack() {
  handleTopRightAction();
}

function toggleSettingsPanel(forceState) {
  if (forceState === true) {
    navigateTo('settings_menu');
  } else if (forceState === false) {
    navigateTo('broadcast');
  } else {
    handleTopRightAction();
  }
}

function toggleRemotePanel() {
  navigateTo('remote');
}

function updateSettingsMenuSubtitles() {
  if (el.settingsDestCountSub) {
    const total = state.destinations.length;
    const active = state.destinations.filter((d) => d.enabled).length;
    el.settingsDestCountSub.textContent = total === 0 ? t('noDestinationsTitle') : `${active}/${total} active destinations`;
  }

  if (currentAccountSession) {
    if (currentAccountSession.is_founding_member) {
      if (el.settingsAccountPlanSub) el.settingsAccountPlanSub.textContent = 'Founding 100 Lifetime License';
      if (el.settingsAccountBadge) {
        el.settingsAccountBadge.textContent = '🔥 FOUNDING';
        el.settingsAccountBadge.style.color = '#f59e0b';
      }
    } else if (currentAccountSession.isPro) {
      if (el.settingsAccountPlanSub) el.settingsAccountPlanSub.textContent = 'Simple Streamer Pro ($12/yr)';
      if (el.settingsAccountBadge) {
        el.settingsAccountBadge.textContent = '⭐ PRO';
        el.settingsAccountBadge.style.color = '#fbbf24';
      }
    } else {
      if (el.settingsAccountPlanSub) el.settingsAccountPlanSub.textContent = 'Free Plan';
      if (el.settingsAccountBadge) {
        el.settingsAccountBadge.textContent = 'FREE';
        el.settingsAccountBadge.style.color = '#94a3b8';
      }
    }
  } else {
    if (el.settingsAccountPlanSub) el.settingsAccountPlanSub.textContent = 'Free Plan';
    if (el.settingsAccountBadge) {
      el.settingsAccountBadge.textContent = 'FREE';
      el.settingsAccountBadge.style.color = '#94a3b8';
    }
  }
}

function updateGeneralSettingsUI() {
  if (el.obsWsEndpointDisplay) {
    el.obsWsEndpointDisplay.textContent = state.config.obsUrl || 'ws://127.0.0.1:4455';
  }
  if (el.obsWsStatusBadge) {
    if (state.obs && state.obs.isConnected) {
      el.obsWsStatusBadge.textContent = t('obsWsStatusConnected') || 'CONNECTED';
      el.obsWsStatusBadge.style.background = 'rgba(16, 185, 129, 0.15)';
      el.obsWsStatusBadge.style.color = '#10b981';
    } else {
      el.obsWsStatusBadge.textContent = t('obsWsStatusDisconnected') || 'DISCONNECTED';
      el.obsWsStatusBadge.style.background = 'rgba(239, 68, 68, 0.15)';
      el.obsWsStatusBadge.style.color = '#ef4444';
    }
  }
}

/**
 * Update Remote Panel Information & QR Code
 */
async function updateRemotePanelInfo() {
  if (el.remotePinDisplay) {
    el.remotePinDisplay.textContent = state.sessionPin;
  }

  let hostIp = '127.0.0.1';
  let bridgePort = 45455;
  let obsPort = 4455;

  try {
    const res = await fetch('http://127.0.0.1:45455/remote-config', { mode: 'cors' });
    if (res.ok) {
      const data = await res.json();
      if (data.hostIp) hostIp = data.hostIp;
      if (data.bridgePort) bridgePort = data.bridgePort;
      if (data.obsPort) obsPort = data.obsPort;
    }
  } catch (_) {}

  if (hostIp === '127.0.0.1' && window.location.hostname && window.location.hostname !== '127.0.0.1' && window.location.hostname !== 'localhost') {
    hostIp = window.location.hostname;
  }

  const mdnsUrl = `http://simple-streamer.local:${bridgePort}/remote?pin=${state.sessionPin}&fallback=${hostIp}&port=${obsPort}`;
  const ipUrl = `http://${hostIp}:${bridgePort}/remote?pin=${state.sessionPin}&port=${obsPort}`;
  const primaryUrl = hostIp !== '127.0.0.1' ? ipUrl : mdnsUrl;

  if (el.remoteUrlDisplay) {
    el.remoteUrlDisplay.textContent = `http://${hostIp}:${bridgePort}/remote`;
  }
  if (el.remoteMdnsDisplay) {
    el.remoteMdnsDisplay.textContent = hostIp !== '127.0.0.1' ? `mDNS fallback: ${mdnsUrl}` : '';
  }

  if (el.remoteQrContainer && typeof QRCode !== 'undefined') {
    el.remoteQrContainer.innerHTML = '';
    try {
      state.remoteQr = new QRCode(el.remoteQrContainer, {
        text: primaryUrl,
        width: 105,
        height: 105,
        colorDark: '#0d0f12',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
      });
    } catch (e) {
      console.warn('QR Code generation error:', e);
    }
  }

  if (el.btnCopyRemoteUrl) {
    el.btnCopyRemoteUrl.onclick = async () => {
      try {
        await navigator.clipboard.writeText(primaryUrl);
        el.btnCopyRemoteUrl.textContent = t('remoteLinkCopied');
        setTimeout(() => {
          if (el.btnCopyRemoteUrl) el.btnCopyRemoteUrl.textContent = t('btnCopyRemoteLink');
        }, 2000);
      } catch (_) {
        prompt('Copy this link:', primaryUrl);
      }
    };
  }

  const btnToggleNet = document.getElementById('btnToggleNetworkDetails');
  const netDetails = document.getElementById('remoteNetworkDetails');
  if (btnToggleNet && netDetails) {
    btnToggleNet.onclick = () => {
      const isHidden = netDetails.style.display === 'none';
      netDetails.style.display = isHidden ? 'flex' : 'none';
      const span = btnToggleNet.querySelector('span');
      if (span) {
        span.textContent = isHidden ? '▴ Hide Network Info' : '▾ Direct Network Info';
      }
    };
  }
}

function extractAccountIdentifier(d) {
  if (!d) return '';
  if (d.credentials?.broadcasterId) return String(d.credentials.broadcasterId).toLowerCase();
  if (d.credentials?.channelSlug) return String(d.credentials.channelSlug).toLowerCase();
  if (d.credentials?.pageId) return String(d.credentials.pageId).toLowerCase();
  if (d.credentials?.streamId) return String(d.credentials.streamId).toLowerCase();
  if (d.accountName) return String(d.accountName).toLowerCase().trim();
  if (d.credentials?.channelName) return String(d.credentials.channelName).toLowerCase().trim();
  const m = (d.name || '').match(/\((.+)\)/);
  if (m) return m[1].toLowerCase().trim();
  return (d.name || d.id || '').toLowerCase().trim();
}

/**
 * Deduplicate and merge destinations by platform and account identifier
 */
function deduplicateDestinations(dests) {
  if (!Array.isArray(dests)) return [];
  const result = [];
  const seen = new Map();

  for (const d of dests) {
    if (!d || !d.platform) continue;
    const platform = d.platform.toLowerCase().trim();
    const ident = extractAccountIdentifier(d);
    const key = `${platform}:${ident}`;

    if (!seen.has(key)) {
      const copy = { ...d, credentials: { ...(d.credentials || {}) } };
      seen.set(key, copy);
      result.push(copy);
    } else {
      const existing = seen.get(key);
      existing.credentials = {
        ...(existing.credentials || {}),
        ...(d.credentials || {}),
      };
      if (d.status === 'valid' || existing.status === 'valid') {
        existing.status = 'valid';
      }
      if (d.enabled) existing.enabled = true;
      if (d.name && !existing.name) existing.name = d.name;
      if (d.accountName && !existing.accountName) existing.accountName = d.accountName;
    }
  }

  // Fallback consolidation per platform
  const byPlatform = new Map();
  for (const d of result) {
    const p = d.platform.toLowerCase().trim();
    if (!byPlatform.has(p)) {
      byPlatform.set(p, [d]);
    } else {
      byPlatform.get(p).push(d);
    }
  }

  const finalDests = [];
  for (const [p, list] of byPlatform.entries()) {
    if (list.length > 1) {
      const primary = list.find((x) => x.credentials?.streamKey || x.credentials?.refreshToken || x.credentials?.userToken) || list[0];
      for (const other of list) {
        if (other !== primary) {
          primary.credentials = { ...(other.credentials || {}), ...(primary.credentials || {}) };
          if (other.enabled) primary.enabled = true;
          if (other.status === 'valid') primary.status = 'valid';
        }
      }
      finalDests.push(primary);
    } else {
      finalDests.push(list[0]);
    }
  }

  return finalDests;
}

/**
 * Load Destinations from LocalStorage with Seamless Legacy Migration
 */
function loadDestinations() {
  const raw = localStorage.getItem('simple_streamer_destinations');
  if (raw) {
    try {
      state.destinations = deduplicateDestinations(JSON.parse(raw));
    } catch (_) {
      state.destinations = [];
    }
  } else {
    // Migrate legacy single-account data if present
    state.destinations = [];
    const ytToken = localStorage.getItem('simple_streamer_yt_token');
    const ytStreamId = localStorage.getItem('simple_streamer_yt_stream_id');
    const ytChannel = localStorage.getItem('simple_streamer_yt_channel') || 'YouTube Channel';

    if (ytToken) {
      state.destinations.push({
        id: 'yt_legacy_' + Date.now(),
        platform: 'youtube',
        name: ytChannel,
        accountName: ytChannel,
        enabled: true,
        status: 'valid',
      statusWarning: null,
      statusError: null,
        credentials: {
          refreshToken: ytToken,
          streamId: ytStreamId,
        },
      });
    }

    const fbPageId = localStorage.getItem('simple_streamer_fb_page_id');
    const fbToken = localStorage.getItem('simple_streamer_fb_token');
    const fbName = localStorage.getItem('simple_streamer_fb_name') || 'Facebook Page';

    if (fbPageId && fbToken) {
      state.destinations.push({
        id: 'fb_' + fbPageId,
        platform: 'facebook',
        name: fbName,
        accountName: fbName,
        enabled: true,
        status: 'valid',
      statusWarning: null,
      statusError: null,
        credentials: {
          pageId: fbPageId,
          accessToken: fbToken,
        },
      });
    }

    if (state.destinations.length > 0) {
      saveDestinations();
    }
  }

  state.destinations = deduplicateDestinations(state.destinations);

  // Ensure exactly one destination is designated as primary
  if (state.destinations.length > 0) {
    const hasPrimary = state.destinations.some((d) => d.isPrimary);
    if (!hasPrimary) {
      state.destinations[0].isPrimary = true;
    }
  }

  // Always query bridge remote-config to sync and merge server destinations
  fetch('http://127.0.0.1:45455/remote-config')
    .then((r) => r.json())
    .then((cfg) => {
      if (cfg && (cfg.hwid || cfg.machineId)) {
        cachedBridgeHwid = (cfg.hwid || cfg.machineId).trim();
        localStorage.setItem('simple_streamer_hwid', cachedBridgeHwid);
      }
      if (cfg && cfg.destinations && Array.isArray(cfg.destinations) && cfg.destinations.length > 0) {
        if (!state.destinations || state.destinations.length === 0) {
          state.destinations = deduplicateDestinations(cfg.destinations);
          if (state.destinations.length > 0 && !state.destinations.some((d) => d.isPrimary)) {
            state.destinations[0].isPrimary = true;
          }
          saveDestinations();
          renderDestinationsPills();
          renderDestinationsList();
          updateActionBtnState();
        } else {
          let merged = false;
          cfg.destinations.forEach((sd) => {
            const loc = state.destinations.find((d) => d.id === sd.id || d.platform === sd.platform);
            if (!loc) {
              state.destinations.push(sd);
              merged = true;
            } else if (!loc.credentials && sd.credentials) {
              loc.credentials = sd.credentials;
              merged = true;
            }
          });
          if (merged) {
            state.destinations = deduplicateDestinations(state.destinations);
            if (!state.destinations.some((d) => d.isPrimary)) {
              state.destinations[0].isPrimary = true;
            }
            saveDestinations();
            renderDestinationsPills();
            renderDestinationsList();
            updateActionBtnState();
          }
        }
      }
    })
    .catch(() => {});

  renderDestinationsPills();
  renderDestinationsList();
  updateSettingsMenuSubtitles();
  syncNativePluginConfig();
}

/**
 * Set a specific destination as the Primary Broadcast Platform (OBS Core Output)
 */
function setPrimaryDestination(destId) {
  let changed = false;
  state.destinations.forEach((d) => {
    const shouldBePrimary = d.id === destId;
    if (d.isPrimary !== shouldBePrimary) {
      d.isPrimary = shouldBePrimary;
      changed = true;
    }
  });
  if (changed) {
    saveDestinations();
    const primary = state.destinations.find((d) => d.id === destId);
    logDiag(`★ Set "${primary?.name || destId}" as Primary Broadcast Platform (OBS Core Output)`);
  }
}

/**
 * Returns the active Primary destination for the current runtime broadcast session.
 * 1. If the user-designated primary destination (from Settings) is currently enabled, it is primary.
 * 2. If the designated primary is currently deactivated on the main page, falls back to the first active/enabled destination.
 * 3. As soon as the designated primary is re-enabled on the main page, it automatically reclaims priority.
 * 4. Falls back to designated primary or first destination if none are enabled.
 */
function getActivePrimaryDestination() {
  if (!state.destinations || state.destinations.length === 0) return null;
  const designated = state.destinations.find((d) => d.isPrimary);
  if (designated && designated.enabled) {
    return designated;
  }
  const fallback = state.destinations.find((d) => d.enabled);
  if (fallback) {
    return fallback;
  }
  return designated || state.destinations[0] || null;
}

/**
 * Save Destinations to LocalStorage and update UI
 */
function saveDestinations() {
  state.destinations = deduplicateDestinations(state.destinations);
  localStorage.setItem('simple_streamer_destinations', JSON.stringify(state.destinations));
  renderDestinationsPills();
  renderDestinationsList();
  updateSettingsMenuSubtitles();
  syncNativePluginConfig();
  updateActionBtnState();

  // Save full state to bridge so broadcast_state.json stays in sync
  fetch('http://127.0.0.1:45455/save-state-destinations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destinations: state.destinations }),
  }).catch(() => {});

  // Real-time sync to Mobile Remotes
  if (state.obs && state.obs.isConnected) {
    state.obs.call('BroadcastCustomEvent', {
      eventData: {
        action: 'METADATA_CHANGED',
        destinations: (state.destinations || []).map((d) => ({
          id: d.id,
          name: d.name || d.platform,
          platform: d.platform,
          enabled: d.enabled,
        })),
      },
    }).catch(() => {});
  }

  // Atomically persist all destination enabled states to local bridge in one shot
  const bridgeUrl = (window.location.port === '45455' ? window.location.origin : 'http://127.0.0.1:45455');
  fetch(`${bridgeUrl}/sync-destinations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      destinations: (state.destinations || []).map((d) => ({
        id: d.id,
        enabled: d.enabled !== false,
      })),
    }),
  }).catch(() => {});
}

/**
 * Render Destination Pills in Main Control View
 */
function renderDestinationsPills() {
  if (!el.destinationsPills) return;
  el.destinationsPills.innerHTML = '';

  if (state.destinations.length === 0) {
    const emptyBtn = document.createElement('button');
    emptyBtn.type = 'button';
    emptyBtn.className = 'dest-pill';
    emptyBtn.style.borderStyle = 'dashed';
    emptyBtn.style.color = '#38bdf8';
    emptyBtn.innerHTML = t('connectFirstPlatform');
    emptyBtn.onclick = () => navigateTo('destinations');
    el.destinationsPills.appendChild(emptyBtn);
    return;
  }

  const activePrimary = getActivePrimaryDestination();

  state.destinations.forEach((dest) => {
    const isRuntimePrimary = Boolean(dest.enabled && activePrimary && activePrimary.id === dest.id);
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = `dest-pill ${dest.enabled ? 'active' : 'disabled'}`;
    pill.title = isRuntimePrimary
      ? (state.isStreaming ? `${dest.name} (${t('anchorPlatformTitle')}) - ${t('anchorPlatformTip')}` : `${dest.name} (${t('primaryBadge')})`)
      : `${dest.name}`;

    const icon = PLATFORM_ICONS[dest.platform] || '';
    pill.innerHTML = `${icon} <span>${isRuntimePrimary ? '★ ' : ''}${dest.name}</span>`;
    pill.onclick = () => {
      if (state.isStreaming) {
        if (isRuntimePrimary && dest.enabled) {
          if (!confirm(t('confirmAnchorToggle', { name: dest.name }))) {
            return;
          }
        }
        dest.enabled = !dest.enabled;
      } else {
        dest.enabled = !dest.enabled;
        // The designated primary set in Settings remains permanent in dest.isPrimary.
        // getActivePrimaryDestination() automatically promotes the next active channel
        // when deactivated, and restores priority immediately when re-enabled.
      }
      saveDestinations();
    };

    el.destinationsPills.appendChild(pill);
  });
}

/**
 * Render Destination Cards in Settings View
 */
function renderDestinationsList() {
  if (!el.destinationsList) return;
  el.destinationsList.innerHTML = '';

  if (state.destinations.length === 0) {
    el.destinationsList.innerHTML = `
      <div style="text-align: center; padding: 20px 10px; color: #94a3b8; font-size: 11px;">
        ${t('noDestinationsConfigured')}
      </div>
    `;
    return;
  }

  state.destinations.forEach((dest) => {
    const card = document.createElement('div');
    card.className = 'destination-card';

    const icon = PLATFORM_ICONS[dest.platform] || '';
    const hasStreamKey = Boolean(dest.credentials?.streamKey || dest.streamKey);
    const hasRefreshToken = Boolean(dest.credentials?.refreshToken);
    const hasOAuth = !!(
      dest.credentials?.userToken ||
      dest.credentials?.refreshToken ||
      dest.credentials?.accessToken
    );
    // If the destination has a stream key or refresh token, background refresh / RTMP handles it automatically.
    // Never show "Sync Token" if a valid key or refresh token exists.
    const needsAuthSync = (dest.platform === 'twitch' || dest.platform === 'kick') && !hasStreamKey && !hasRefreshToken && !hasOAuth;
    const authSyncHtml = needsAuthSync
      ? `<button type="button" class="btn-sync-token" id="sync_${dest.id}" style="font-size: 10px; padding: 2px 8px; background: #38bdf8; color: #0f172a; border: none; border-radius: 4px; font-weight: 700; cursor: pointer;" title="${t('syncTokenTip')}">${t('syncToken')}</button>`
      : '';

    const isPri = !!dest.isPrimary;
    const primaryBadge = isPri
      ? `<div class="badge-primary-wrapper">
          <span class="badge-primary">${t('primaryBadge')}</span>
          <div class="badge-tooltip">
            <strong style="color: #f59e0b; display: block; margin-bottom: 2px;">${t('anchorPlatformTitle')}</strong>
            ${t('anchorPlatformTip')}
          </div>
        </div>`
      : '';

    const makePrimaryHtml = !isPri
      ? `<button type="button" class="btn-make-primary" id="pri_${dest.id}" style="font-size: 10px; padding: 2px 8px; background: #1e2434; color: #94a3b8; border: 1px solid #334155; border-radius: 4px; cursor: pointer; font-weight: 500;" title="${t('makePrimary')}">${t('makePrimary')}</button>`
      : '';

    card.innerHTML = `
      <div class="destination-card-left" style="display: flex; align-items: center; gap: 6px;">
        ${icon}
        <span class="destination-name">${dest.name}</span>
        ${primaryBadge}
      </div>
      <div class="destination-card-right">
        ${makePrimaryHtml}
        ${authSyncHtml}
        <button type="button" class="btn-icon-del" id="del_${dest.id}" title="${t('removeDestinationTip')}">✕</button>
      </div>
    `;

    // Set Primary destination handler
    const priBtn = card.querySelector(`#pri_${dest.id}`);
    if (priBtn) {
      priBtn.onclick = () => setPrimaryDestination(dest.id);
    }

    // Re-sync auth token
    const syncBtn = card.querySelector(`#sync_${dest.id}`);
    if (syncBtn) {
      syncBtn.onclick = () => {
        if (dest.platform === 'twitch' && el.btnAddTwitch) el.btnAddTwitch.click();
        if (dest.platform === 'kick' && el.btnAddKick) el.btnAddKick.click();
      };
    }

    // Delete destination
    const delBtn = card.querySelector(`#del_${dest.id}`);
    delBtn.onclick = () => {
      if (confirm(t('confirmRemoveDest', { name: dest.name }))) {
        state.destinations = state.destinations.filter((d) => d.id !== dest.id);
        if (isPri && state.destinations.length > 0) {
          state.destinations[0].isPrimary = true;
        }
        saveDestinations();
      }
    };

    el.destinationsList.appendChild(card);
  });
}

/**
 * Validate Single Destination via Backend API
 */
async function validateSingleDestination(destId) {
  const dest = state.destinations.find((d) => d.id === destId);
  if (!dest) return;

  try {
    const res = await fetch(`${state.config.backendUrl}/api/validate-destination`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(state.config.apiKey ? { 'x-api-key': state.config.apiKey } : {}),
      },
      body: JSON.stringify({ destination: dest }),
    });

    const data = await res.json();
    const hasDirectKey = !!(dest.credentials?.streamKey || dest.streamKey);
    if (data.valid || hasDirectKey) {
      dest.status = 'valid';
      dest.statusError = null;
      dest.statusWarning = data.valid ? null : data.error;
    } else {
      dest.status = 'invalid';
      dest.statusError = data.error || null;
    }
    if (data.channelName && !dest.name) dest.name = data.channelName;
    if (data.streamKey && !dest.credentials.streamKey) dest.credentials.streamKey = data.streamKey;
    if (data.streamName && !dest.credentials.streamName) dest.credentials.streamName = data.streamName;
    if (data.ingestionAddress && !dest.credentials.ingestionAddress) dest.credentials.ingestionAddress = data.ingestionAddress;
  } catch (err) {
    const hasDirectKey = !!(dest.credentials?.streamKey || dest.streamKey);
    if (hasDirectKey) {
      dest.status = 'valid';
      dest.statusError = null;
      dest.statusWarning = null;
    } else {
      dest.status = 'invalid';
      dest.statusError = err.message;
    }
  }

  saveDestinations();
}

/**
 * Global Health Check across ALL Active Destinations
 */
async function validateAllDestinations() {
  if (state.destinations.length === 0) return;

  state.destinations.forEach((d) => {
    d.status = 'checking';
    d.statusError = null;
  });
  renderDestinationsPills();
  renderDestinationsList();

  logDiag('⚡ Running global validation across all stream destinations...');

  try {
    const res = await fetch(`${state.config.backendUrl}/api/validate-all-destinations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(state.config.apiKey ? { 'x-api-key': state.config.apiKey } : {}),
      },
      body: JSON.stringify({ destinations: state.destinations }),
    });

    if (!res.ok) {
      throw new Error(`Health check returned HTTP ${res.status}`);
    }

    const data = await res.json();
    if (Array.isArray(data.results)) {
      data.results.forEach((r) => {
        const found = state.destinations.find((d) => d.id === r.id);
        if (found) {
          const hasDirectKey = !!(found.credentials?.streamKey || found.streamKey);
          if (r.valid) {
            found.status = 'valid';
            found.statusError = null;
            found.statusWarning = null;
          } else if (hasDirectKey) {
            // Direct stream key is present; video broadcast works directly without manual token intervention
            found.status = 'valid';
            found.statusError = null;
            found.statusWarning = null;
            logDiag(`✓ Destination "${found.name}": RTMP stream key ready.`);
          } else {
            found.status = 'invalid';
            found.statusError = r.error || null;
          }
          if (r.channelName && !found.name) found.name = r.channelName;
          if (r.streamKey && !found.credentials?.streamKey) {
            found.credentials = found.credentials || {};
            found.credentials.streamKey = r.streamKey;
          }
          if (r.streamName && !found.credentials?.streamName) {
            found.credentials = found.credentials || {};
            found.credentials.streamName = r.streamName;
          }
          if (r.ingestionAddress && !found.credentials?.ingestionAddress) {
            found.credentials = found.credentials || {};
            found.credentials.ingestionAddress = r.ingestionAddress;
          }
          if (r.userToken) {
            found.credentials = found.credentials || {};
            found.credentials.userToken = r.userToken;
          }
          if (r.refreshToken) {
            found.credentials = found.credentials || {};
            found.credentials.refreshToken = r.refreshToken;
          }
        }
      });
    }

    saveDestinations();
    logDiag('✓ Health check completed for all destinations.');
    updateActionBtnState();
  } catch (err) {
    logDiag(`Global health check notice: ${err.message}`);
    state.destinations.forEach((d) => {
      if (d.status === 'checking') d.status = 'unknown';
    });
    renderDestinationsPills();
    renderDestinationsList();
  }
}

/**
 * Show Discovery & Confirmation Modal Card
 */
function showDiscovery(title, contentHtml, onConfirm) {
  navigateTo('destinations');
  if (el.discoveryTitle) el.discoveryTitle.textContent = title;
  if (el.discoveryBody) el.discoveryBody.innerHTML = contentHtml;
  if (el.discoveryCard) el.discoveryCard.style.display = 'block';
  state.discoveryCallback = onConfirm;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideDiscovery() {
  if (el.discoveryCard) el.discoveryCard.style.display = 'none';
  if (el.discoveryBody) el.discoveryBody.innerHTML = '';
  state.discoveryCallback = null;
}

/**
 * Open external URL via local bridge or window.open
 */
async function openExternalUrl(url) {
  try {
    await fetch(`http://127.0.0.1:45455/open?url=${encodeURIComponent(url)}`, { mode: 'cors' });
  } catch (_) {
    window.open(url, '_blank');
  }
}

/**
 * Setup YouTube Discovery Poll
 */
function startYouTubePoll(sessionId) {
  let attempts = 0;
  const maxAttempts = 120; // 3 minutes
  const poll = setInterval(async () => {
    attempts++;
    if (attempts > maxAttempts) {
      clearInterval(poll);
      showAlert('CONNECTION TIMEOUT', 'YouTube authorization timed out. Please try again.');
      return;
    }

    try {
      const res = await fetch(`${state.config.backendUrl}/api/auth-session?session=${sessionId}&_t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.ok && data.refreshToken) {
        clearInterval(poll);
        fetch('http://127.0.0.1:45455/focus-obs', { mode: 'no-cors' }).catch(() => {});
        promptConfirmYouTube(data);
      } else if (data.error) {
        clearInterval(poll);
        showAlert('YOUTUBE ERROR', data.error);
      }
    } catch (_) {}
  }, 1500);
}

/**
 * Prompt User to Confirm Discovered YouTube Channel
 */
function promptConfirmYouTube(data) {
  const { refreshToken, channelTitle, streams = [] } = data;

  let streamOptions = '';
  streams.forEach((s, idx) => {
    streamOptions += `<option value="${s.id}">${s.title} (${s.resolution || 'Auto'})</option>`;
  });

  const html = `
    <div style="margin-bottom: 10px;">
      <div style="font-weight: 700; color: #fff; margin-bottom: 4px;">Discovered YouTube Channel:</div>
      <div style="background: #0f172a; padding: 8px 10px; border-radius: 6px; border: 1px solid #334155; font-size: 13px; font-weight: 800; color: #38bdf8;">
        ${channelTitle}
      </div>
    </div>
    ${streams.length > 0 ? `
      <div style="margin-bottom: 10px;">
        <label style="font-size: 10px; color: #94a3b8; font-weight: 600;">Stream Key / Ingestion Target:</label>
        <select id="discYtStreamSelect" style="width: 100%; margin-top: 4px; padding: 6px; background: #0f172a; border: 1px solid #334155; color: #fff; border-radius: 4px;">
          ${streamOptions}
        </select>
      </div>
    ` : ''}
    <p style="font-size: 10px; color: #94a3b8; margin: 0;">Confirm below to add this channel to your Simple Streamer destinations.</p>
  `;

  showDiscovery('Confirm YouTube Channel', html, async () => {
    const streamSelect = document.getElementById('discYtStreamSelect');
    const selectedStreamId = streamSelect ? streamSelect.value : (streams[0]?.id || null);
    const matchedStream = streams.find((s) => s.id === selectedStreamId) || streams[0];

    const dest = {
      id: 'yt_' + (selectedStreamId || Date.now()),
      platform: 'youtube',
      name: channelTitle,
      accountName: channelTitle,
      enabled: true,
      status: 'valid',
      statusWarning: null,
      statusError: null,
      credentials: {
        refreshToken,
        streamId: selectedStreamId,
        streamName: matchedStream?.streamName || '',
        ingestionAddress: matchedStream?.ingestionAddress || 'rtmp://a.rtmp.youtube.com/live2',
      },
    };

    // Replace if existing channel exists, otherwise add
    const existingIdx = state.destinations.findIndex(
      (d) => d.platform === 'youtube' && (
        d.id === dest.id ||
        d.accountName === channelTitle ||
        d.name === channelTitle ||
        d.name === `YouTube (${channelTitle})` ||
        (d.credentials && selectedStreamId && d.credentials.streamId === selectedStreamId) ||
        state.destinations.filter((x) => x.platform === 'youtube').length === 1
      )
    );
    if (existingIdx >= 0) {
      const existing = state.destinations[existingIdx];
      state.destinations[existingIdx] = {
        ...existing,
        ...dest,
        id: existing.id,
        name: existing.name || dest.name,
        enabled: existing.enabled !== undefined ? existing.enabled : true,
        status: 'valid',
      statusWarning: null,
      statusError: null,
        statusWarning: null,
        statusError: null,
        credentials: {
          ...existing.credentials,
          ...dest.credentials,
        },
      };
    } else {
      state.destinations.push(dest);
    }

    saveDestinations();
    hideDiscovery();
    logDiag(`✓ Added YouTube Channel: ${channelTitle}`);

    // Trigger validation across ALL platforms
    await validateAllDestinations();
  });
}

/**
 * Setup Facebook Discovery Poll
 */
function startFacebookPoll(sessionId) {
  let attempts = 0;
  const maxAttempts = 120; // 3 minutes
  const poll = setInterval(async () => {
    attempts++;
    if (attempts > maxAttempts) {
      clearInterval(poll);
      showAlert('CONNECTION TIMEOUT', 'Facebook authorization timed out. Please try again.');
      return;
    }

    try {
      const res = await fetch(`${state.config.backendUrl}/api/auth-session?session=${sessionId}&_t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.ok && data.pages && data.pages.length > 0) {
        clearInterval(poll);
        fetch('http://127.0.0.1:45455/focus-obs', { mode: 'no-cors' }).catch(() => {});
        promptConfirmFacebook(data);
      } else if (data.ok && data.pages && data.pages.length === 0) {
        clearInterval(poll);
        showAlert('NO ELIGIBLE PAGES', 'Facebook authorized successfully, but no Pages eligible for Live Video broadcasting were found. Meta requires at least 100 followers.');
      } else if (data.error) {
        clearInterval(poll);
        showAlert('FACEBOOK ERROR', data.error);
      }
    } catch (_) {}
  }, 1500);
}

/**
 * Prompt User to Confirm Discovered Facebook Pages
 */
function promptConfirmFacebook(data) {
  const { pages = [] } = data;

  let checklistHtml = '';
  pages.forEach((page) => {
    checklistHtml += `
      <label class="discovery-item">
        <input type="checkbox" name="discFbPage" value="${page.id}" data-name="${encodeURIComponent(page.name)}" data-token="${encodeURIComponent(page.accessToken)}" checked />
        <span style="font-weight: 700; color: #fff;">${page.name}</span>
      </label>
    `;
  });

  const html = `
    <div style="margin-bottom: 8px;">
      <div style="font-weight: 700; color: #fff; margin-bottom: 4px;">Found ${pages.length} Facebook Page(s):</div>
      <p style="font-size: 10px; color: #94a3b8; margin: 0 0 8px 0;">Select which specific Pages you want to add to Simple Streamer:</p>
      <div class="discovery-checklist">${checklistHtml}</div>
    </div>
  `;

  showDiscovery('Select Facebook Pages', html, async () => {
    const checkboxes = document.querySelectorAll('input[name="discFbPage"]:checked');
    if (checkboxes.length === 0) {
      showAlert('SELECTION REQUIRED', 'Please check at least one Facebook Page to add.');
      return;
    }

    checkboxes.forEach((cb) => {
      const pageId = cb.value;
      const pageName = decodeURIComponent(cb.dataset.name);
      const accessToken = decodeURIComponent(cb.dataset.token);

      const dest = {
        id: 'fb_' + pageId,
        platform: 'facebook',
        name: pageName,
        accountName: pageName,
        enabled: true,
        status: 'valid',
      statusWarning: null,
      statusError: null,
        credentials: {
          pageId,
          accessToken,
        },
      };

      const existingIdx = state.destinations.findIndex(
        (d) => d.platform === 'facebook' && (
          d.id === dest.id ||
          d.credentials?.pageId === pageId ||
          d.name === pageName ||
          d.name === `Facebook (${pageName})` ||
          d.accountName === pageName ||
          state.destinations.filter((x) => x.platform === 'facebook').length === 1
        )
      );
      if (existingIdx >= 0) {
        const existing = state.destinations[existingIdx];
        state.destinations[existingIdx] = {
          ...existing,
          ...dest,
          id: existing.id,
          name: existing.name || dest.name,
          enabled: existing.enabled !== undefined ? existing.enabled : true,
          credentials: {
            ...existing.credentials,
            ...dest.credentials,
          },
        };
      } else {
        state.destinations.push(dest);
      }
    });

    saveDestinations();
    hideDiscovery();
    logDiag(`✓ Added ${checkboxes.length} Facebook Page(s).`);

    // Trigger validation across ALL platforms
    await validateAllDestinations();
  });
}

/**
 * Setup Twitch Discovery Poll
 */
function startTwitchPoll(sessionId) {
  let attempts = 0;
  const maxAttempts = 120; // 3 minutes
  const poll = setInterval(async () => {
    attempts++;
    if (attempts > maxAttempts) {
      clearInterval(poll);
      showAlert('CONNECTION TIMEOUT', 'Twitch authorization timed out. Please try again.');
      return;
    }

    try {
      const res = await fetch(`${state.config.backendUrl}/api/auth-session?session=${sessionId}&_t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.ok && data.userToken) {
        clearInterval(poll);
        clearAlert();
        fetch('http://127.0.0.1:45455/focus-obs', { mode: 'no-cors' }).catch(() => {});
        promptConfirmTwitch(data);
      } else if (data.error) {
        clearInterval(poll);
        showAlert('TWITCH ERROR', data.error);
      }
    } catch (_) {}
  }, 1500);

  showAlert('CONNECTING TWITCH', 'Opened Twitch in your browser. Log in and authorize Simple Streamer to link your stream key and enable title sync (Free).', [
    { label: 'ENTER KEY MANUALLY', onClick: () => { clearInterval(poll); promptAddTwitch(); } },
    { label: 'CANCEL', onClick: () => { clearInterval(poll); clearAlert(); } },
  ]);
}

function promptConfirmTwitch(data) {
  const { channelName, broadcasterId, streamKey, userToken, serverUrl, refreshToken } = data;
  const html = `
    <div style="margin-bottom: 10px;">
      <div style="font-weight: 700; color: #fff; margin-bottom: 4px;">Twitch Channel Authorized:</div>
      <div style="background: #0f172a; padding: 8px 10px; border-radius: 6px; border: 1px solid #334155; font-size: 13px; font-weight: 800; color: #9146ff;">
        ${channelName}
      </div>
      <p style="font-size: 10px; color: #94a3b8; margin: 8px 0 0 0;">
        ✓ Stream key linked automatically.<br>
        ✓ Automatic title updates enabled (auto-refreshing token).
      </p>
    </div>
  `;

  showDiscovery('Confirm Twitch Channel', html, async () => {
    const dest = {
      id: 'twitch_' + (broadcasterId || Date.now()),
      platform: 'twitch',
      name: `Twitch (${channelName})`,
      accountName: channelName,
      enabled: true,
      status: 'valid',
      statusWarning: null,
      statusError: null,
      credentials: {
        broadcasterId,
        channelName,
        streamKey,
        userToken,
        refreshToken: refreshToken || null,
        serverUrl: serverUrl || 'rtmp://live.twitch.tv/app/',
      },
    };

    const existingIdx = state.destinations.findIndex(
      (d) => d.platform === 'twitch' && (
        d.credentials?.broadcasterId === broadcasterId ||
        d.id === 'twitch_' + broadcasterId ||
        d.accountName === channelName ||
        d.credentials?.channelName === channelName ||
        d.name === channelName ||
        d.name === `Twitch (${channelName})` ||
        state.destinations.filter((x) => x.platform === 'twitch').length === 1
      )
    );

    if (existingIdx >= 0) {
      const existing = state.destinations[existingIdx];
      state.destinations[existingIdx] = {
        ...existing,
        ...dest,
        id: existing.id,
        name: existing.name || dest.name,
        enabled: existing.enabled !== undefined ? existing.enabled : true,
        status: 'valid',
      statusWarning: null,
      statusError: null,
        statusWarning: null,
        statusError: null,
        credentials: {
          ...existing.credentials,
          ...dest.credentials,
        },
      };
    } else {
      state.destinations.push(dest);
    }

    saveDestinations();
    hideDiscovery();
    logDiag(`✓ Added Twitch Channel: ${channelName}`);
    await validateAllDestinations();
  });
}

/**
 * Setup Kick Discovery Poll
 */
function startKickPoll(sessionId) {
  let attempts = 0;
  const maxAttempts = 120; // 3 minutes
  const poll = setInterval(async () => {
    attempts++;
    if (attempts > maxAttempts) {
      clearInterval(poll);
      showAlert('CONNECTION TIMEOUT', 'Kick authorization timed out. Please try again.');
      return;
    }

    try {
      const res = await fetch(`${state.config.backendUrl}/api/auth-session?session=${sessionId}&_t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.ok && (data.userToken || data.channelName)) {
        clearInterval(poll);
        clearAlert();
        fetch('http://127.0.0.1:45455/focus-obs', { mode: 'no-cors' }).catch(() => {});
        promptConfirmKick(data);
      } else if (data.error) {
        clearInterval(poll);
        showAlert('KICK ERROR', data.error);
      }
    } catch (_) {}
  }, 1500);

  showAlert('CONNECTING KICK', 'Opened Kick in your browser. Log in and authorize Simple Streamer to link your stream key and enable title sync (Free).', [
    { label: 'ENTER KEY MANUALLY', onClick: () => { clearInterval(poll); promptAddKick(); } },
    { label: 'CANCEL', onClick: () => { clearInterval(poll); clearAlert(); } },
  ]);
}

function promptConfirmKick(data) {
  const { channelName, userToken, serverUrl, streamKey: fetchedStreamKey, refreshToken } = data;
  const hasAutoKey = Boolean(fetchedStreamKey);

  const html = `
    <div style="margin-bottom: 10px;">
      <div style="font-weight: 700; color: #fff; margin-bottom: 4px;">Kick Account Authorized:</div>
      <div style="background: #0f172a; padding: 8px 10px; border-radius: 6px; border: 1px solid #334155; font-size: 13px; font-weight: 800; color: #53fc18;">
        ${channelName}
      </div>
      ${hasAutoKey ? `
        <p style="font-size: 10px; color: #94a3b8; margin: 8px 0 0 0;">
          ✓ Stream key linked automatically via streamkey:read.<br>
          ✓ Automatic title updates enabled (auto-refreshing token).
        </p>
      ` : `
        <div style="margin-top: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <label style="font-size: 10px; color: #94a3b8; font-weight: 600;">Stream Key (from Dashboard):</label>
            <button type="button" id="btnOpenKickDash" style="background: none; border: none; color: #38bdf8; font-size: 10px; cursor: pointer; text-decoration: underline; padding: 0;">Open Kick Settings ↗</button>
          </div>
          <input type="password" id="discKickKey" placeholder="sk_..." style="width: 100%; margin-top: 4px; padding: 6px; background: #0f172a; border: 1px solid #334155; color: #fff; border-radius: 4px;" />
          <p style="font-size: 9.5px; color: #94a3b8; margin: 4px 0 0 0;">Paste your stream key once from Kick Creator Dashboard.</p>
        </div>
      `}
    </div>
  `;

  showDiscovery('Confirm Kick Channel', html, async () => {
    const keyInput = document.getElementById('discKickKey');
    const finalStreamKey = fetchedStreamKey || keyInput?.value.trim();
    if (!finalStreamKey) {
      showAlert('STREAM KEY REQUIRED', 'Please enter your Kick stream key.');
      return;
    }

    const dest = {
      id: 'kick_' + channelName.replace(/[^a-zA-Z0-9_-]/g, ''),
      platform: 'kick',
      name: `Kick (${channelName})`,
      accountName: channelName,
      enabled: true,
      status: 'valid',
      statusWarning: null,
      statusError: null,
      credentials: {
        channelSlug: channelName,
        streamKey: finalStreamKey,
        userToken,
        refreshToken: refreshToken || null,
        serverUrl: serverUrl || 'rtmps://fa723ac112e7.global-contribute.live-video.net:443/app/',
      },
    };

    const existingIdx = state.destinations.findIndex(
      (d) => d.platform === 'kick' && (
        d.credentials?.channelSlug === channelName ||
        d.accountName === channelName ||
        d.name === channelName ||
        d.name === `Kick (${channelName})` ||
        state.destinations.filter((x) => x.platform === 'kick').length === 1
      )
    );

    if (existingIdx >= 0) {
      const existing = state.destinations[existingIdx];
      state.destinations[existingIdx] = {
        ...existing,
        ...dest,
        id: existing.id,
        name: existing.name || dest.name,
        enabled: existing.enabled !== undefined ? existing.enabled : true,
        status: 'valid',
      statusWarning: null,
      statusError: null,
        statusWarning: null,
        statusError: null,
        credentials: {
          ...existing.credentials,
          ...dest.credentials,
        },
      };
    } else {
      state.destinations.push(dest);
    }

    saveDestinations();
    hideDiscovery();
    logDiag(`✓ Added Kick Channel: ${channelName}`);
    await validateAllDestinations();
  });

  const btnDash = document.getElementById('btnOpenKickDash');
  if (btnDash) {
    btnDash.onclick = () => openExternalUrl('https://kick.com/dashboard/settings/stream');
  }
}

/**
 * Prompt User to Configure YouTube Destination (Pro 1-Click OAuth or Manual Stream Key)
 */
function promptAddYouTube() {
  const isPro = Boolean(currentAccountSession && (currentAccountSession.isPro || currentAccountSession.is_founding_member));
  if (isPro) {
    startYouTubeOAuthFlow();
  } else {
    promptManualYouTubeKey(false);
  }
}

async function startYouTubeOAuthFlow() {
  prepareAuthSessions();
  await openExternalUrl(state.ytAuthUrl);
  logDiag('Waiting for YouTube authorization in browser...');
  startYouTubePoll(state.ytSessionId);
  showAlert(
    'CONNECTING YOUTUBE',
    'Opened Google sign-in in your browser. Select your YouTube channel to link your broadcast directly.',
    [
      { label: 'USE STREAM KEY INSTEAD', onClick: () => promptManualYouTubeKey(true) },
      { label: 'CANCEL', onClick: () => clearAlert() },
    ],
    'info'
  );
}

function promptManualYouTubeKey(isProUser = false) {
  const isPro = Boolean(isProUser || (currentAccountSession && (currentAccountSession.isPro || currentAccountSession.is_founding_member)));
  const offer = getProOffer();

  const headerNotice = isPro
    ? `
      <div style="background: rgba(59, 130, 246, 0.12); border: 1px solid rgba(59, 130, 246, 0.35); padding: 9px 12px; border-radius: 6px; font-size: 11px; color: #bfdbfe; line-height: 1.45;">
        ℹ️ <strong>Manual Stream Key Mode:</strong><br>
        Using a manual stream key bypasses automated 1-click broadcast creation.<br>
        <button type="button" id="btnSwitchToYtOAuth" style="margin-top: 6px; background: #1e3a8a; border: 1px solid #3b82f6; color: #93c5fd; font-weight: 700; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 11px; width: 100%;">⚡ Connect via Google 1-Click OAuth</button>
      </div>
    `
    : `
      <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); padding: 9px 12px; border-radius: 6px; font-size: 11px; color: #fde68a; line-height: 1.45;">
        ⚡ <strong>Want 1-click broadcasts?</strong><br>
        Start your live stream directly from OBS with your title, description, and thumbnail synced across platforms. <button type="button" id="btnYtUpgradePro" style="background: none; border: none; color: #fbbf24; font-weight: 800; cursor: pointer; text-decoration: underline; padding: 0;">Upgrade to Pro ↗</button><br>
        <span style="display: block; margin-top: 4px; color: #94a3b8;">Or enter your <strong>YouTube Stream Key</strong> below to stream for free:</span>
      </div>
    `;

  const html = `
    <div style="display: flex; flex-direction: column; gap: 10px;">
      ${headerNotice}

      <div>
        <label style="font-size: 11px; font-weight: 700; color: #cbd5e1; display: block; margin-bottom: 4px;">Channel / Destination Name</label>
        <input type="text" id="ytChannelName" placeholder="My YouTube Channel" value="YouTube Live" style="width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid #334155; color: #fff; border-radius: 6px; padding: 7px 10px; font-size: 12px;" />
      </div>

      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <label style="font-size: 11px; font-weight: 700; color: #cbd5e1;">YouTube Stream Key</label>
          <button type="button" id="btnOpenYtStudio" style="background: none; border: none; color: #38bdf8; font-size: 10px; cursor: pointer; text-decoration: underline; padding: 0;">Open YouTube Studio ↗</button>
        </div>
        <input type="password" id="ytStreamKey" placeholder="xxxx-xxxx-xxxx-xxxx-xxxx" style="width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid #334155; color: #fff; border-radius: 6px; padding: 7px 10px; font-size: 12px; font-family: monospace;" />
      </div>
    </div>
  `;

  showDiscovery('Add YouTube Destination', html, async () => {
    const channelName = (document.getElementById('ytChannelName')?.value || 'YouTube Live').trim();
    const streamKey = (document.getElementById('ytStreamKey')?.value || '').trim();

    if (!streamKey) {
      showAlert('STREAM KEY REQUIRED', 'Please enter your YouTube stream key from YouTube Studio Live dashboard.', [], 'warning');
      return;
    }

    const dest = {
      id: 'yt_' + Date.now(),
      platform: 'youtube',
      name: channelName,
      accountName: channelName,
      enabled: true,
      status: 'valid',
      statusWarning: null,
      statusError: null,
      credentials: {
        serverUrl: 'rtmp://a.rtmp.youtube.com/live2',
        streamKey,
      },
    };

    state.destinations.push(dest);
    if (!state.destinations.some((d) => d.isPrimary)) {
      dest.isPrimary = true;
    }
    saveDestinations();
    hideDiscovery();
    renderDestinationsList();
    renderDestinationsPills();
    syncNativePluginConfig();
    updateActionBtnState();
    logDiag(`✓ Added YouTube Stream Key Destination: ${channelName}`);
    showAlert('YOUTUBE ADDED', `Added ${channelName} to your broadcast destinations.`, [], 'success');
  });

  const btnUp = document.getElementById('btnYtUpgradePro');
  if (btnUp) {
    btnUp.onclick = () => openExternalUrl(offer.paymentUrl);
  }
  const btnStudio = document.getElementById('btnOpenYtStudio');
  if (btnStudio) {
    btnStudio.onclick = () => openExternalUrl('https://studio.youtube.com/channel/UC/livestreaming');
  }
  const btnSwitchOAuth = document.getElementById('btnSwitchToYtOAuth');
  if (btnSwitchOAuth) {
    btnSwitchOAuth.onclick = () => {
      hideDiscovery();
      startYouTubeOAuthFlow();
    };
  }
}

/**
 * Prompt User to Configure Facebook Destination (Pro 1-Click OAuth or Manual Stream Key)
 */
function promptAddFacebook() {
  const isPro = Boolean(currentAccountSession && (currentAccountSession.isPro || currentAccountSession.is_founding_member));
  if (isPro) {
    startFacebookOAuthFlow();
  } else {
    promptManualFacebookKey(false);
  }
}

async function startFacebookOAuthFlow() {
  prepareAuthSessions();
  await openExternalUrl(state.fbAuthUrl);
  logDiag('Waiting for Facebook authorization in browser...');
  startFacebookPoll(state.fbSessionId);
  showAlert(
    'CONNECTING FACEBOOK',
    'Opened Facebook sign-in in your browser. Select your Facebook Page to link 1-click live broadcasts.',
    [
      { label: 'USE STREAM KEY INSTEAD', onClick: () => promptManualFacebookKey(true) },
      { label: 'CANCEL', onClick: () => clearAlert() },
    ],
    'info'
  );
}

function promptManualFacebookKey(isProUser = false) {
  const isPro = Boolean(isProUser || (currentAccountSession && (currentAccountSession.isPro || currentAccountSession.is_founding_member)));
  const offer = getProOffer();

  const headerNotice = isPro
    ? `
      <div style="background: rgba(59, 130, 246, 0.12); border: 1px solid rgba(59, 130, 246, 0.35); padding: 9px 12px; border-radius: 6px; font-size: 11px; color: #bfdbfe; line-height: 1.45;">
        ℹ️ <strong>Manual Stream Key Mode:</strong><br>
        Using a manual stream key for Facebook Live.<br>
        <button type="button" id="btnSwitchToFbOAuth" style="margin-top: 6px; background: #1e3a8a; border: 1px solid #3b82f6; color: #93c5fd; font-weight: 700; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 11px; width: 100%;">⚡ Connect via Facebook 1-Click OAuth</button>
      </div>
    `
    : `
      <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); padding: 9px 12px; border-radius: 6px; font-size: 11px; color: #fde68a; line-height: 1.45;">
        ⚡ <strong>Want 1-click broadcasts?</strong><br>
        Start your live stream directly from OBS with your title, description, and thumbnail synced across platforms. <button type="button" id="btnFbUpgradePro" style="background: none; border: none; color: #fbbf24; font-weight: 800; cursor: pointer; text-decoration: underline; padding: 0;">Upgrade to Pro ↗</button><br>
        <span style="display: block; margin-top: 4px; color: #94a3b8;">Or enter your <strong>Facebook Stream Key</strong> below to stream for free:</span>
      </div>
    `;

  const html = `
    <div style="display: flex; flex-direction: column; gap: 10px;">
      ${headerNotice}

      <div>
        <label style="font-size: 11px; font-weight: 700; color: #cbd5e1; display: block; margin-bottom: 4px;">Page / Destination Name</label>
        <input type="text" id="fbPageName" placeholder="My Facebook Page" value="Facebook Live" style="width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid #334155; color: #fff; border-radius: 6px; padding: 7px 10px; font-size: 12px;" />
      </div>

      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <label style="font-size: 11px; font-weight: 700; color: #cbd5e1;">Facebook Stream Key (or Persistent Key)</label>
          <button type="button" id="btnOpenFbProducer" style="background: none; border: none; color: #38bdf8; font-size: 10px; cursor: pointer; text-decoration: underline; padding: 0;">Open Live Producer ↗</button>
        </div>
        <input type="password" id="fbStreamKey" placeholder="FB-..." style="width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid #334155; color: #fff; border-radius: 6px; padding: 7px 10px; font-size: 12px; font-family: monospace;" />
      </div>
    </div>
  `;

  showDiscovery('Add Facebook Destination', html, async () => {
    const pageName = (document.getElementById('fbPageName')?.value || 'Facebook Live').trim();
    const streamKey = (document.getElementById('fbStreamKey')?.value || '').trim();

    if (!streamKey) {
      showAlert('STREAM KEY REQUIRED', 'Please enter your Facebook stream key from Live Producer.', [], 'warning');
      return;
    }

    const dest = {
      id: 'fb_' + Date.now(),
      platform: 'facebook',
      name: pageName,
      accountName: pageName,
      enabled: true,
      status: 'valid',
      statusWarning: null,
      statusError: null,
      credentials: {
        serverUrl: 'rtmps://live-api-s.facebook.com:443/rtmp/',
        streamKey,
      },
    };

    state.destinations.push(dest);
    if (!state.destinations.some((d) => d.isPrimary)) {
      dest.isPrimary = true;
    }
    saveDestinations();
    hideDiscovery();
    renderDestinationsList();
    renderDestinationsPills();
    syncNativePluginConfig();
    updateActionBtnState();
    logDiag(`✓ Added Facebook Stream Key Destination: ${pageName}`);
    showAlert('FACEBOOK ADDED', `Added ${pageName} to your broadcast destinations.`, [], 'success');
  });

  const btnUp = document.getElementById('btnFbUpgradePro');
  if (btnUp) {
    btnUp.onclick = () => openExternalUrl(offer.paymentUrl);
  }
  const btnProd = document.getElementById('btnOpenFbProducer');
  if (btnProd) {
    btnProd.onclick = () => openExternalUrl('https://www.facebook.com/live/producer');
  }
  const btnSwitchOAuth = document.getElementById('btnSwitchToFbOAuth');
  if (btnSwitchOAuth) {
    btnSwitchOAuth.onclick = () => {
      hideDiscovery();
      startFacebookOAuthFlow();
    };
  }
}

/**
 * Prompt User to Configure Kick Destination via Stream Key
 */
function promptAddKick() {
  const html = `
    <div style="display: flex; flex-direction: column; gap: 10px;">
      <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); padding: 9px 12px; border-radius: 6px; font-size: 11px; color: #a7f3d0; line-height: 1.45;">
        ⚡ <strong>Free 1-Click Sign-In with Title Sync:</strong><br>
        Sign in with your Kick account to automatically sync your stream title from OBS.<br>
        <button type="button" id="btnKickOAuthConnect" style="margin-top: 6px; background: #059669; border: none; color: #fff; font-weight: 700; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 11px; width: 100%;">⚡ Sign In with Kick ↗</button>
      </div>

      <div style="font-size: 10px; color: #94a3b8; text-align: center; margin: 2px 0;">── or enter Stream Key manually ──</div>

      <div>
        <label style="font-size: 11px; font-weight: 700; color: #cbd5e1; display: block; margin-bottom: 4px;">Kick Channel Name (Username)</label>
        <input type="text" id="kickChannelName" placeholder="e.g. MyKickChannel" style="width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid #334155; color: #fff; border-radius: 6px; padding: 7px 10px; font-size: 12px;" />
      </div>

      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <label style="font-size: 11px; font-weight: 700; color: #cbd5e1;">Kick Stream Key</label>
          <button type="button" id="btnOpenKickDash" style="background: none; border: none; color: #38bdf8; font-size: 10px; cursor: pointer; text-decoration: underline; padding: 0;">Open Kick Dashboard ↗</button>
        </div>
        <input type="password" id="kickStreamKey" placeholder="sk_us-west-..." style="width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid #334155; color: #fff; border-radius: 6px; padding: 7px 10px; font-size: 12px; font-family: monospace;" />
      </div>

      <div style="font-size: 10px; color: #94a3b8; line-height: 1.4;">
        Find your stream key in Kick.com → Creator Dashboard → Settings → Stream.
      </div>
    </div>
  `;

  showDiscovery('Add Kick Destination', html, async () => {
    const channelName = (document.getElementById('kickChannelName')?.value || 'Kick Stream').trim();
    const streamKey = (document.getElementById('kickStreamKey')?.value || '').trim();

    if (!streamKey) {
      showAlert('STREAM KEY REQUIRED', 'Please enter your Kick stream key.');
      return;
    }

    const cleanSlug = channelName.replace(/[^a-zA-Z0-9_-]/g, '') || 'kick';
    const dest = {
      id: 'kick_' + Date.now(),
      platform: 'kick',
      name: `Kick (${channelName})`,
      accountName: channelName,
      enabled: true,
      status: 'valid',
      statusWarning: null,
      statusError: null,
      credentials: {
        channelSlug: cleanSlug,
        serverUrl: 'rtmps://fa723ac112e7.global-contribute.live-video.net:443/app/',
        streamKey,
      },
    };

    state.destinations.push(dest);
    if (!state.destinations.some((d) => d.isPrimary)) {
      dest.isPrimary = true;
    }
    saveDestinations();
    hideDiscovery();
    renderDestinationsList();
    renderDestinationsPills();
    syncNativePluginConfig();
    updateActionBtnState();
    logDiag(`✓ Added Kick Channel: ${channelName}`);
    showAlert('KICK ADDED', `Added Kick (${channelName}) to your broadcast destinations.`);
  });

  const btnOAuth = document.getElementById('btnKickOAuthConnect');
  if (btnOAuth) {
    btnOAuth.onclick = async () => {
      hideDiscovery();
      const sessionId = generateSecureSessionId('session_kc');
      await openExternalUrl(`${state.config.backendUrl}/auth/kick/start?session=${sessionId}`);
      logDiag('Waiting for Kick authorization in browser...');
      startKickPoll(sessionId);
    };
  }

  const btnDash = document.getElementById('btnOpenKickDash');
  if (btnDash) {
    btnDash.onclick = () => openExternalUrl('https://kick.com/dashboard/settings/stream');
  }
}

/**
 * Prompt User to Configure Twitch Destination via Stream Key
 */
function promptAddTwitch() {
  const html = `
    <div style="display: flex; flex-direction: column; gap: 10px;">
      <div style="background: rgba(147, 51, 234, 0.1); border: 1px solid rgba(147, 51, 234, 0.3); padding: 9px 12px; border-radius: 6px; font-size: 11px; color: #d8b4fe; line-height: 1.45;">
        ⚡ <strong>Free 1-Click Sign-In with Title Sync:</strong><br>
        Sign in with your Twitch account to automatically link your stream key and sync your stream title from OBS.<br>
        <button type="button" id="btnTwitchOAuthConnect" style="margin-top: 6px; background: #7c3aed; border: none; color: #fff; font-weight: 700; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 11px; width: 100%;">⚡ Sign In with Twitch ↗</button>
      </div>

      <div style="font-size: 10px; color: #94a3b8; text-align: center; margin: 2px 0;">── or enter Stream Key manually ──</div>

      <div>
        <label style="font-size: 11px; font-weight: 700; color: #cbd5e1; display: block; margin-bottom: 4px;">Twitch Channel Name</label>
        <input type="text" id="twitchChannelName" placeholder="e.g. MyTwitchChannel" style="width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid #334155; color: #fff; border-radius: 6px; padding: 7px 10px; font-size: 12px;" />
      </div>

      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <label style="font-size: 11px; font-weight: 700; color: #cbd5e1;">Twitch Primary Stream Key</label>
          <button type="button" id="btnOpenTwitchDash" style="background: none; border: none; color: #38bdf8; font-size: 10px; cursor: pointer; text-decoration: underline; padding: 0;">Open Twitch Settings ↗</button>
        </div>
        <input type="password" id="twitchStreamKey" placeholder="live_..." style="width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid #334155; color: #fff; border-radius: 6px; padding: 7px 10px; font-size: 12px; font-family: monospace;" />
      </div>

      <div style="font-size: 10px; color: #94a3b8; line-height: 1.4;">
        Find your stream key in Twitch Creator Dashboard → Settings → Stream.
      </div>
    </div>
  `;

  showDiscovery('Add Twitch Destination', html, async () => {
    const channelName = (document.getElementById('twitchChannelName')?.value || 'Twitch Stream').trim();
    const streamKey = (document.getElementById('twitchStreamKey')?.value || '').trim();

    if (!streamKey) {
      showAlert('STREAM KEY REQUIRED', 'Please enter your Twitch stream key.');
      return;
    }

    const dest = {
      id: 'twitch_' + Date.now(),
      platform: 'twitch',
      name: `Twitch (${channelName})`,
      accountName: channelName,
      enabled: true,
      status: 'valid',
      statusWarning: null,
      statusError: null,
      credentials: {
        channelName,
        serverUrl: 'rtmp://live.twitch.tv/app/',
        streamKey,
      },
    };

    state.destinations.push(dest);
    if (!state.destinations.some((d) => d.isPrimary)) {
      dest.isPrimary = true;
    }
    saveDestinations();
    hideDiscovery();
    renderDestinationsList();
    renderDestinationsPills();
    syncNativePluginConfig();
    updateActionBtnState();
    logDiag(`✓ Added Twitch Channel: ${channelName}`);
    showAlert('TWITCH ADDED', `Added Twitch (${channelName}) to your broadcast destinations.`);
  });

  const btnOAuth = document.getElementById('btnTwitchOAuthConnect');
  if (btnOAuth) {
    btnOAuth.onclick = async () => {
      hideDiscovery();
      const sessionId = generateSecureSessionId('session_tw');
      await openExternalUrl(`${state.config.backendUrl}/auth/twitch/start?session=${sessionId}`);
      logDiag('Waiting for Twitch authorization in browser...');
      startTwitchPoll(sessionId);
    };
  }

  const btnDash = document.getElementById('btnOpenTwitchDash');
  if (btnDash) {
    btnDash.onclick = () => openExternalUrl('https://dashboard.twitch.tv/settings/stream');
  }
}

/**
 * Prompt User to Configure Custom RTMP Destination (TikTok, X / Twitter, Rumble, etc.)
 */
function promptAddCustomRtmp() {
  const html = `
    <div style="display: flex; flex-direction: column; gap: 10px;">
      <div>
        <label style="font-size: 11px; font-weight: 700; color: #cbd5e1; display: block; margin-bottom: 4px;">${t('platformNameLabel')}</label>
        <input type="text" id="customRtmpName" placeholder="${t('platformNamePlaceholder')}" style="width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid #334155; color: #f8fafc; border-radius: 6px; padding: 7px 10px; font-size: 12px;" value="Custom RTMP" />
      </div>
      <div>
        <label style="font-size: 11px; font-weight: 700; color: #cbd5e1; display: block; margin-bottom: 4px;">${t('serverUrlLabel')}</label>
        <input type="text" id="customRtmpServer" placeholder="${t('serverUrlPlaceholder')}" style="width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid #334155; color: #f8fafc; border-radius: 6px; padding: 7px 10px; font-size: 12px; font-family: monospace;" />
      </div>
      <div>
        <label style="font-size: 11px; font-weight: 700; color: #cbd5e1; display: block; margin-bottom: 4px;">${t('streamKeyLabel')}</label>
        <input type="password" id="customRtmpKey" placeholder="${t('streamKeyPlaceholder')}" style="width: 100%; box-sizing: border-box; background: #0f172a; border: 1px solid #334155; color: #f8fafc; border-radius: 6px; padding: 7px 10px; font-size: 12px; font-family: monospace;" />
      </div>
      <div style="font-size: 10px; color: #94a3b8; line-height: 1.4;">
        ${t('customRtmpTip')}
      </div>
    </div>
  `;

  showDiscovery(t('addCustomRtmpTitle'), html, async () => {
    const nameEl = document.getElementById('customRtmpName');
    const serverEl = document.getElementById('customRtmpServer');
    const keyEl = document.getElementById('customRtmpKey');

    const name = (nameEl?.value || 'Custom RTMP').trim();
    const serverUrl = (serverEl?.value || '').trim();
    const streamKey = (keyEl?.value || '').trim();

    if (!serverUrl || (!serverUrl.startsWith('rtmp://') && !serverUrl.startsWith('rtmps://'))) {
      showAlert('INVALID SERVER URL', 'RTMP Server URL must start with rtmp:// or rtmps://');
      return;
    }

    if (!streamKey) {
      showAlert('STREAM KEY REQUIRED', 'Please enter a stream key for this destination.');
      return;
    }

    const dest = {
      id: 'custom_' + Date.now(),
      platform: 'custom',
      name: name,
      accountName: name,
      enabled: true,
      status: 'valid',
      statusWarning: null,
      statusError: null,
      credentials: {
        serverUrl,
        streamKey,
      },
    };

    state.destinations.push(dest);
    if (!state.destinations.some((d) => d.isPrimary)) {
      dest.isPrimary = true;
    }
    saveDestinations();
    hideDiscovery();
    renderDestinationsList();
    renderDestinationsPills();
    syncNativePluginConfig();
    updateActionBtnState();
    logDiag(`✓ Added Custom RTMP Destination: ${name} (${serverUrl})`);
    showAlert('DESTINATION ADDED', `Added ${name} to your broadcast destinations.`);
  });
}

/**
 * Checks whether user has edited the broadcast title or description while actively streaming.
 * Displays the "[🔄 Update Live Stream Info]" button if changes are pending.
 */
function checkLiveMetadataDirty() {
  if (!el.liveMetadataUpdateBar) return;
  if (!state.isStreaming || !state.activeBroadcast?.destinations?.length) {
    el.liveMetadataUpdateBar.style.display = 'none';
    return;
  }
  const title = (el.lessonTitle?.value || '').trim();
  const desc = (el.lessonDescription?.value || '').trim();
  const origTitle = (state.activeBroadcast?.title || '').trim();
  const origDesc = (state.activeBroadcast?.description || '').trim();
  const isChanged = (title !== origTitle || desc !== origDesc);

  const isPro = Boolean(currentAccountSession && (currentAccountSession.isPro || currentAccountSession.is_founding_member));
  if (isChanged && !isPro) {
    el.liveMetadataUpdateBar.style.display = 'block';
    if (el.btnUpdateLiveMetadata) {
      el.btnUpdateLiveMetadata.disabled = false;
      el.btnUpdateLiveMetadata.style.opacity = '0.9';
      el.btnUpdateLiveMetadata.style.cursor = 'pointer';
    }
    if (el.btnUpdateLiveMetadataText) {
      el.btnUpdateLiveMetadataText.textContent = '🔒 Mid-Stream Updates (Pro Only) — Upgrade';
    }
    return;
  }

  el.liveMetadataUpdateBar.style.display = isChanged ? 'block' : 'none';
  if (el.btnUpdateLiveMetadata) {
    el.btnUpdateLiveMetadata.disabled = false;
    el.btnUpdateLiveMetadata.style.opacity = '1';
    el.btnUpdateLiveMetadata.style.cursor = 'pointer';
  }
  if (el.btnUpdateLiveMetadataText) {
    el.btnUpdateLiveMetadataText.textContent = t('btnUpdateLiveInfo');
  }
}

/**
 * Pushes live title and description changes across all active destinations mid-broadcast.
 */
async function handleUpdateLiveMetadata() {
  if (!state.isStreaming || !state.activeBroadcast?.destinations?.length) return;
  const newTitle = (el.lessonTitle?.value || '').trim();
  const newDesc = (el.lessonDescription?.value || '').trim();

  if (!newTitle) {
    showAlert('TITLE REQUIRED', 'Please enter a valid title.');
    return;
  }

  const isPro = Boolean(currentAccountSession && (currentAccountSession.isPro || currentAccountSession.is_founding_member));
  if (!isPro) {
    const offer = getProOffer();
    showAlert('PRO FEATURE', 'Mid-stream title updates require Simple Streamer Pro.', [
      { label: offer.alertCtaLabel, onClick: () => openExternalUrl(offer.paymentUrl) },
      { label: 'SIGN IN', onClick: () => startAccountSignInFlow() },
    ]);
    checkLiveMetadataDirty();
    return;
  }

  if (el.btnUpdateLiveMetadata) el.btnUpdateLiveMetadata.disabled = true;
  if (el.btnUpdateLiveMetadataText) el.btnUpdateLiveMetadataText.textContent = t('updatingLiveInfo');

  try {
    const token = getAuthToken();
    const hwid = await syncDeviceHwidFromBridge();
    const res = await fetch(`${state.config.backendUrl}/reconcile-metadata`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(hwid ? { 'x-device-hwid': hwid } : {}),
        ...(state.config.apiKey ? { 'x-api-key': state.config.apiKey } : {}),
      },
      body: JSON.stringify({
        token,
        hwid,
        title: newTitle,
        description: newDesc,
        destinations: state.activeBroadcast.destinations.map((d) => ({
          id: d.id,
          platform: d.platform,
          broadcastId: d.broadcastId,
          liveVideoId: d.liveVideoId,
          broadcasterId: d.broadcasterId,
          channelSlug: d.channelSlug,
          refreshToken: d.refreshToken,
          accessToken: d.accessToken,
          userToken: d.userToken,
        })),
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    state.activeBroadcast.title = newTitle;
    state.activeBroadcast.description = newDesc;
    checkLiveMetadataDirty();
    syncMetadataToBridgeAndRemote(newTitle, newDesc);
    showAlert('LIVE INFO UPDATED', t('liveInfoUpdated'));
  } catch (err) {
    if (err.message === 'PRO_REQUIRED') {
      showAlert('PRO LICENSE REQUIRED', 'Mid-stream title updates require Simple Streamer Pro.', [
        { label: 'UNLOCK PRO', onClick: () => startAccountSignInFlow() },
      ]);
    } else {
      showAlert('UPDATE FAILED', t('liveInfoUpdateFailed', { error: err.message }));
    }
  } finally {
    if (el.btnUpdateLiveMetadata) el.btnUpdateLiveMetadata.disabled = false;
    if (el.btnUpdateLiveMetadataText) el.btnUpdateLiveMetadataText.textContent = t('btnUpdateLiveInfo');
    checkLiveMetadataDirty();
  }
}

/**
 * Synchronize secondary outputs with native C plugin via local bridge
 */
async function syncNativePluginConfig() {
  const enabledDests = state.destinations.filter((d) => d.enabled);
  // Secondaries are all destinations after the first enabled one
  const secondaries = enabledDests.slice(1);

  const outputs = secondaries.map((s, idx) => {
    let server = s.credentials?.serverUrl || s.credentials?.ingestionAddress || (s.platform === 'youtube' ? 'rtmp://a.rtmp.youtube.com/live2' : '');
    if (s.platform === 'kick' && server && !server.includes('/app')) {
      server = server.replace(/\/+$/, '') + ':443/app';
    }
    return {
      id: s.id,
      name: s.name,
      server,
      key: s.credentials?.streamKey || s.credentials?.streamName || '',
      enabled: true,
    };
  });

  try {
    await fetch('http://127.0.0.1:45455/save-destinations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outputs }),
      mode: 'cors',
    });

    // Also update legacy single-secondary for backward compatibility
    if (outputs.length > 0) {
      const firstSec = outputs[0];
      const url = `http://127.0.0.1:45455/save-secondary?enabled=1&server=${encodeURIComponent(firstSec.server)}&key=${encodeURIComponent(firstSec.key)}`;
      await fetch(url, { mode: 'cors' }).catch(() => {});
    }
  } catch (err) {
    logDiag(`Plugin sync notice: ${err.message}`);
  }
}

/**
 * Backup user's native OBS stream service settings before Simple Streamer overrides them.
 */
async function backupOriginalStreamServiceSettings() {
  if (!state.obs || !state.obs.isConnected) return;
  try {
    const existing = localStorage.getItem('simple_streamer_backup_stream_settings');
    if (existing) return; // Keep the original non-SimpleStreamer settings

    const current = await state.obs.call('GetStreamServiceSettings');
    if (current && current.streamServiceType && current.streamServiceSettings) {
      localStorage.setItem(
        'simple_streamer_backup_stream_settings',
        JSON.stringify({
          streamServiceType: current.streamServiceType,
          streamServiceSettings: current.streamServiceSettings,
        })
      );
      logDiag(`✓ Backed up user's original OBS stream settings (${current.streamServiceType}).`);
    }
  } catch (err) {
    logDiag(`Notice backing up original stream settings: ${err.message}`);
  }
}

/**
 * Restore user's native OBS stream service settings after Simple Streamer broadcast ends.
 */
async function restoreOriginalStreamServiceSettings() {
  const backupRaw = localStorage.getItem('simple_streamer_backup_stream_settings');
  if (!backupRaw || !state.obs || !state.obs.isConnected) return;
  try {
    const backup = JSON.parse(backupRaw);
    if (backup && backup.streamServiceType && backup.streamServiceSettings) {
      logDiag(`Restoring user's original OBS stream settings (${backup.streamServiceType})...`);
      await state.obs.call('SetStreamServiceSettings', {
        streamServiceType: backup.streamServiceType,
        streamServiceSettings: backup.streamServiceSettings,
      });
      localStorage.removeItem('simple_streamer_backup_stream_settings');
      logDiag("✓ User's original OBS stream settings restored successfully.");
    }
  } catch (err) {
    logDiag(`Notice restoring original stream settings: ${err.message}`);
  }
}

/**
 * Handle Go Live Initiation across N Multi-Destinations
 */
async function handleGoLive() {
  if (state.isPreparing || state.isStreaming) return;

  clearAlert();
  const title = el.lessonTitle.value.trim();
  const description = el.lessonDescription ? el.lessonDescription.value.trim() : '';

  if (!title) {
    el.lessonTitle.classList.add('pulse-border');
    setTimeout(() => el.lessonTitle.classList.remove('pulse-border'), 2000);
    showAlert('ENTER TITLE FIRST', 'Please enter a title for your stream.');
    return;
  }

  const activePrimary = getActivePrimaryDestination();
  const enabledTargets = state.destinations.filter((d) => d.enabled);
  // Sort so active runtime Primary platform is strictly Destination 0
  enabledTargets.sort((a, b) => (b.id === activePrimary?.id ? 1 : 0) - (a.id === activePrimary?.id ? 1 : 0));
  if (enabledTargets.length === 0) {
    navigateTo('destinations');
    showAlert(
      'SELECT DESTINATIONS FIRST',
      'Please enable at least one broadcast destination before starting your stream.'
    );
    return;
  }

  if (!state.obs.isConnected) {
    showAlert(
      'CONNECTING TO OBS...',
      'Simple Streamer is connecting to OBS Studio. Please ensure OBS is running.',
      [{ label: 'Connect Now', onClick: () => connectObs() }]
    );
    connectObs();
    return;
  }

  state.isPreparing = true;
  setStatus('PREPARING...', 'preparing');
  el.actionBtn.disabled = true;
  el.actionBtnText.textContent = 'PREPARING STREAM...';
  logDiag(`Initiating broadcast to ${enabledTargets.length} destination(s): "${title}"`);

  // Capture ephemeral thumbnail before clearing memory
  const outgoingThumbnail = state.ephemeralThumbnailBase64;
  clearThumbnail(); // Wipe UI and memory immediately to prevent future session leakage

  let gcpResponse = null;
  try {
    const token = getAuthToken();
    const hwid = await syncDeviceHwidFromBridge();
    const res = await fetch(`${state.config.backendUrl}/orchestrate-live`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(hwid ? { 'x-device-hwid': hwid } : {}),
        'x-device-name': 'OBS Studio Workstation',
        ...(state.config.apiKey ? { 'x-api-key': state.config.apiKey } : {}),
      },
      body: JSON.stringify({
        ...(token ? { token } : {}),
        ...(hwid ? { hwid } : {}),
        deviceName: 'OBS Studio Workstation',
        title,
        description,
        ...(outgoingThumbnail ? { thumbnailBase64: outgoingThumbnail } : {}),
        destinations: enabledTargets.map((d) => ({
          id: d.id,
          platform: d.platform,
          name: d.name,
          ...d.credentials,
        })),
      }),
    });

    gcpResponse = await res.json().catch(() => ({}));
    if (!res.ok && gcpResponse.status !== 'PARTIAL_SUCCESS') {
      const hasDirectDests = enabledTargets.some((d) => d.credentials?.streamKey);
      if (!hasDirectDests) {
        throw new Error(gcpResponse.error || `HTTP ${res.status}`);
      }
    }
  } catch (err) {
    logDiag(`Cloud orchestrator notice: ${err.message}`);
    const directTargets = enabledTargets.filter((d) => d.credentials?.streamKey);
    if (directTargets.length > 0) {
      logDiag(`Recovering with direct RTMP streaming for ${directTargets.length} target(s)...`);
      gcpResponse = {
        status: 'PARTIAL_SUCCESS',
        destinations: enabledTargets.map((d) => {
          if (d.credentials?.streamKey) {
            let serverUrl = d.credentials.serverUrl;
            if (d.platform === 'twitch') serverUrl = serverUrl || 'rtmp://live.twitch.tv/app/';
            if (d.platform === 'kick') {
              serverUrl = serverUrl || 'rtmps://fa723fc1b171.global-contribute.live-video.net:443/app';
              if (serverUrl && !serverUrl.includes('/app')) serverUrl = serverUrl.replace(/\/+$/, '') + ':443/app';
            }
            return {
              id: d.id,
              platform: d.platform,
              name: d.name,
              ok: true,
              serverUrl,
              streamKey: d.credentials.streamKey,
            };
          }
          return {
            id: d.id,
            platform: d.platform,
            name: d.name,
            ok: false,
            error: `${d.platform.toUpperCase()} requires active cloud connection (${err.message})`,
          };
        }),
      };
    } else {
      state.isPreparing = false;
      setStatus('ERROR', 'error');
      el.actionBtn.disabled = false;
      el.actionBtnText.textContent = 'GO LIVE';
      if (state.obs && state.obs.isConnected) {
        state.obs.call('BroadcastCustomEvent', {
          eventData: { action: 'LIVE_START_FAILED', error: err.message },
        }).catch(() => {});
      }
      if (err.message === 'PRO_REQUIRED' || err.message?.includes('PRO_REQUIRED')) {
        const offer = getProOffer();
        showAlert('PRO LICENSE REQUIRED', 'Automated YouTube & Facebook live sync requires Simple Streamer Pro. Switch to Stream Key mode or activate Pro.', [
          { label: offer.alertCtaLabel, onClick: () => openExternalUrl(offer.paymentUrl) },
          { label: 'SIGN IN', onClick: () => startAccountSignInFlow() },
        ]);
      } else if (err.message === 'DEVICE_LIMIT_REACHED' || err.message?.includes('DEVICE_LIMIT_REACHED')) {
        showAlert('DEVICE LIMIT REACHED', 'You have reached your 2 active computers limit. Deactivate a machine at simple-streamer.bdjlmn.com/account.', [
          { label: 'MANAGE DEVICES', onClick: () => openExternalUrl('https://simple-streamer.bdjlmn.com/account') },
        ]);
      } else {
        showAlert('ORCHESTRATION FAILED', `${err.message}. Check your internet connection.`, [
          { label: 'RETRY', onClick: () => handleGoLive() },
        ]);
      }
      return;
    }
  }

  const returnedDests = gcpResponse.destinations || [];

  // Resilient fallback: For any platform with stored direct RTMP credentials (Twitch, Kick, Custom RTMP),
  // ensure they can stream even if cloud metadata update had an issue.
  for (const t of enabledTargets) {
    if (t.credentials?.streamKey) {
      let d = returnedDests.find((item) => item.id === t.id);
      if (!d) {
        d = { id: t.id, platform: t.platform, name: t.name, ok: true };
        returnedDests.push(d);
      }
      if (!d.ok && (t.platform === 'twitch' || t.platform === 'kick')) {
        logDiag(`Direct RTMP fallback: Enabling ${t.name || t.platform} via stored stream key (Cloud notice: ${d.error || 'metadata update failed'})`);
        d.ok = true;
      }
      if (!d.serverUrl) {
        let srv = t.credentials.serverUrl;
        if (t.platform === 'twitch') srv = srv || 'rtmp://live.twitch.tv/app/';
        if (t.platform === 'kick') srv = srv || 'rtmps://fa723fc1b171.global-contribute.live-video.net:443/app';
        d.serverUrl = srv;
      }
      if (t.platform === 'kick' && d.serverUrl && !d.serverUrl.includes('/app')) {
        d.serverUrl = d.serverUrl.replace(/\/+$/, '') + ':443/app';
      }
      if (!d.streamKey) {
        d.streamKey = t.credentials.streamKey;
      }
      if (d.userToken && t.credentials) t.credentials.userToken = d.userToken;
      if (d.refreshToken && t.credentials) t.credentials.refreshToken = d.refreshToken;
    }
  }

  const successfulDests = returnedDests.filter((d) => d.ok);
  // Ensure active runtime Primary platform (if successful) is strictly at index 0 for OBS Core
  successfulDests.sort((a, b) => {
    return (b.id === activePrimary?.id ? 1 : 0) - (a.id === activePrimary?.id ? 1 : 0);
  });
  const failedDests = returnedDests.filter((d) => !d.ok);

  // Automatically clear any stale error status for destinations that succeeded
  let stateModified = false;
  successfulDests.forEach((sd) => {
    const orig = state.destinations.find((t) => t.id === sd.id);
    if (orig && orig.status !== 'valid') {
      orig.status = 'valid';
      orig.statusError = null;
      orig.statusWarning = null;
      stateModified = true;
    }
  });
  if (stateModified) {
    saveDestinations();
  }

  if (successfulDests.length === 0) {
    state.isPreparing = false;
    setStatus('ERROR', 'error');
    el.actionBtn.disabled = false;
    el.actionBtnText.textContent = 'GO LIVE';
    const firstErr = returnedDests.find((d) => !d.ok)?.error || 'Unknown error';
    if (state.obs && state.obs.isConnected) {
      state.obs.call('BroadcastCustomEvent', {
        eventData: { action: 'LIVE_START_FAILED', error: firstErr },
      }).catch(() => {});
    }
    showAlert('ALL DESTINATIONS FAILED', `Could not create broadcasts: ${firstErr}`);
    return;
  }

  if (failedDests.length > 0) {
    const failedNames = failedDests.map((f) => f.name || f.platform.toUpperCase()).join(', ');
    showAlert('PARTIAL STREAM START', `Live on ${successfulDests.length} target(s). Failed: ${failedNames} (${failedDests[0].error})`);
  }

  // 1. Primary Output configured directly in OBS
  await backupOriginalStreamServiceSettings();
  const primary = successfulDests[0];
  logDiag(`Configuring OBS Primary Stream: ${primary.name || primary.platform} (${primary.serverUrl})`);
  try {
    await state.obs.call('SetStreamServiceSettings', {
      streamServiceType: 'rtmp_custom',
      streamServiceSettings: {
        server: primary.serverUrl,
        key: primary.streamKey,
        use_auth: false,
      },
    });
  } catch (err) {
    logDiag(`Warning setting stream service: ${err.message}`);
  }

  // 2. Secondary Outputs configured in C native plugin via local bridge
  const secondaries = successfulDests.slice(1);
  if (secondaries.length > 0) {
    logDiag(`Configuring ${secondaries.length} secondary output(s) in native plugin...`);
    try {
      await fetch('http://127.0.0.1:45455/save-destinations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          armed: true,
          outputs: secondaries.map((s, idx) => {
            let server = s.serverUrl;
            if (s.platform === 'kick' && server && !server.includes('/app')) {
              server = server.replace(/\/+$/, '') + ':443/app';
            }
            return {
              id: s.id,
              name: s.name || s.platform,
              server,
              key: s.streamKey,
              enabled: true,
            };
          }),
        }),
        mode: 'cors',
      });
    } catch (e) {
      logDiag(`Secondary bridge notice: ${e.message}`);
    }
  } else {
    // Disable and disarm secondary plugin if only 1 target
    fetch('http://127.0.0.1:45455/save-destinations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ armed: false, outputs: [] }),
      mode: 'cors',
    }).catch(() => {});
  }

  // 3. Populate state.activeBroadcast BEFORE triggering OBS start so that any
  // instantaneous StreamStateChanged events have immediate access to destination cards.
  state.activeBroadcast = {
    title,
    description,
    destinations: returnedDests.map((d) => {
      const original = enabledTargets.find((t) => t.id === d.id);
      return {
        ...d,
        name: d.name || original?.name || d.platform.toUpperCase(),
        isLive: false,
        status: d.ok ? 'starting' : 'failed',
        errorMessage: d.error || null,
      };
    }),
  };

  try {
    logDiag('Starting OBS Stream...');
    sessionStorage.setItem('simple_streamer_stream_managed', 'true');
    state.isManagedStream = true;
    state.isExternalStream = false;
    await state.obs.call('StartStream');
    setLiveUI(true);
  } catch (err) {
    sessionStorage.removeItem('simple_streamer_stream_managed');
    state.isManagedStream = false;
    state.isPreparing = false;
    logDiag(`OBS Start failed: ${err.message}`);
    if (state.obs && state.obs.isConnected) {
      state.obs.call('BroadcastCustomEvent', {
        eventData: { action: 'LIVE_START_FAILED', error: `OBS encoder error: ${err.message}` },
      }).catch(() => {});
    }
    showAlert('OBS START FAILED', `OBS encoder error: ${err.message}`);
  }
}

/**
 * Transition UI for broadcasts initiated outside Simple Streamer
 */
function setExternalLiveUI(isLive) {
  state.isExternalStream = isLive;
  state.isStreaming = false;
  state.isPreparing = false;
  state.isEnding = false;

  if (isLive) {
    setStatus(t('obsStreamingExternal') || '● STREAMING (EXTERNAL)', 'amber');
    if (el.liveContainer) el.liveContainer.style.display = 'none';
    if (el.inputGroup) el.inputGroup.style.display = 'block';
    if (el.settingsLiveBar) el.settingsLiveBar.style.display = 'none';
    if (el.destLockedNotice) el.destLockedNotice.style.display = 'none';
    if (el.liveMetadataUpdateBar) el.liveMetadataUpdateBar.style.display = 'none';

    el.actionBtn.disabled = true;
    el.actionBtn.className = 'btn-primary external-live';
    el.actionBtnText.textContent = t('obsStreamingExternal') || '● OBS STREAMING (EXTERNAL)';
    el.actionBtn.title = t('externalStreamAlertMsg') || 'OBS is currently broadcasting via external controls or another plugin.';
  } else {
    setStatus('● CONNECTED', 'connected');
    el.actionBtn.title = '';
    updateActionBtnState();
  }

  // Notify mobile remote of external stream state change
  if (state.obs && state.obs.isConnected) {
    state.obs.call('BroadcastCustomEvent', {
      eventData: {
        action: 'STREAM_STATE_CHANGED',
        isLive: state.isStreaming,
        isExternalStream: state.isExternalStream,
      },
    }).catch(() => {});
  }
}

/**
 * Transition UI between Standby and Live states
 */
function setLiveUI(isLive) {
  state.isStreaming = isLive;
  state.isExternalStream = false;
  state.isPreparing = false;
  state.isEnding = false;

  if (isLive) {
    // Defensive fallback: If activeBroadcast.destinations is missing/empty, populate from enabled destinations
    if (!state.activeBroadcast?.destinations?.length) {
      const enabled = state.destinations.filter((d) => d.enabled);
      state.activeBroadcast = {
        title: state.activeBroadcast?.title || 'Live Stream',
        description: state.activeBroadcast?.description || '',
        destinations: enabled.map((d) => ({
          id: d.id,
          platform: d.platform,
          name: d.name || d.platform.toUpperCase(),
          isLive: false,
          status: 'starting',
          errorMessage: null,
        })),
      };
    }

    setStatus('LIVE', 'live');
    if (el.liveContainer) el.liveContainer.style.display = 'block';
    if (el.inputGroup) el.inputGroup.style.display = 'none';
    if (el.settingsLiveBar) el.settingsLiveBar.style.display = nav.currentView !== 'broadcast' ? 'flex' : 'none';
    if (el.destLockedNotice) el.destLockedNotice.style.display = 'block';

    el.actionBtn.disabled = false;
    el.actionBtn.className = 'btn-primary stop';
    el.actionBtnText.textContent = '⏹ STOP STREAM';

    // Populate Real-Time Platform Status Grid
    renderPlatformLiveGrid();
    startTimer();
    checkLiveMetadataDirty();

    // Schedule delayed metadata reconciliation watchdog (8s post-stream start)
    setTimeout(() => {
      if (state.isStreaming) {
        reconcileActiveBroadcastMetadata();
      }
    }, 8000);
  } else {
    stopTimer();
    setStatus('● CONNECTED', 'connected');
    if (el.liveContainer) el.liveContainer.style.display = 'none';
    if (el.inputGroup) el.inputGroup.style.display = 'block';
    if (el.liveMetadataUpdateBar) el.liveMetadataUpdateBar.style.display = 'none';
    if (el.settingsLiveBar) el.settingsLiveBar.style.display = 'none';
    if (el.destLockedNotice) el.destLockedNotice.style.display = 'none';

    updateActionBtnState();

    if (el.platformLiveGrid) el.platformLiveGrid.innerHTML = '';
    state.activeBroadcast.destinations = [];
  }
}

/**
 * Render Dynamic Platform Status Grid during Live Stream
 */
function renderPlatformLiveGrid() {
  if (!el.platformLiveGrid) return;
  el.platformLiveGrid.innerHTML = '';

  state.activeBroadcast.destinations.forEach((dest, idx) => {
    const card = document.createElement('div');
    card.className = 'platform-live-card';
    card.id = `liveCard_${dest.id}`;

    const isFailed = dest.status === 'failed';
    const icon = PLATFORM_ICONS[dest.platform] || '';
    card.innerHTML = `
      <div class="platform-live-title">
        ${icon}
        <span class="platform-live-name" title="${dest.name || dest.platform.toUpperCase()}">${dest.name || dest.platform.toUpperCase()}</span>
      </div>
      <div class="platform-live-actions">
        <button type="button" class="btn-retry-platform" id="btnRetry_${dest.id}" style="${isFailed ? 'display: inline-block;' : 'display: none;'}" onclick="retryDestination('${dest.id}')" title="Retry this platform">
          ↻ Retry
        </button>
        <span id="liveBadge_${dest.id}" class="platform-live-badge ${isFailed ? 'status-error' : 'status-connecting'}" title="${dest.errorMessage || ''}">
          <span class="live-dot">●</span>
          <span class="live-text">${isFailed ? 'FAILED' : 'STARTING...'}</span>
        </span>
      </div>
    `;

    el.platformLiveGrid.appendChild(card);
  });

  updateLiveHeaderDynamic();
}

/**
 * Update top header text based on active platforms
 */
function updateLiveHeaderDynamic() {
  if (!el.liveHeader) return;
  const dests = state.activeBroadcast.destinations;
  if (!dests || dests.length === 0) {
    el.liveHeader.textContent = '● OBS STREAMING (PRIMARY ONLY)';
    el.liveHeader.style.color = '#38bdf8';
    if (el.metricRecord) {
      el.metricRecord.textContent = 'OBS ACTIVE';
      el.metricRecord.style.color = '#38bdf8';
    }
    return;
  }

  const liveCount = dests.filter((d) => d.isLive).length;
  const totalCount = dests.length;

  if (liveCount === totalCount && totalCount > 0) {
    el.liveHeader.textContent = `● LIVE ON ${totalCount} PLATFORM${totalCount > 1 ? 'S' : ''}`;
    el.liveHeader.style.color = '#34d399';
    if (el.metricRecord) {
      el.metricRecord.textContent = 'ONLINE';
      el.metricRecord.style.color = '#34d399';
    }
  } else if (liveCount > 0) {
    el.liveHeader.textContent = `● LIVE ON ${liveCount}/${totalCount} PLATFORMS`;
    el.liveHeader.style.color = '#f59e0b';
    if (el.metricRecord) {
      el.metricRecord.textContent = 'PARTIAL';
      el.metricRecord.style.color = '#f59e0b';
    }
  } else {
    const elapsed = Date.now() - (state.streamStartTime || Date.now());
    if (elapsed < 6000) {
      el.liveHeader.textContent = 'CONNECTING DESTINATIONS...';
      el.liveHeader.style.color = '#60a5fa';
    } else {
      el.liveHeader.textContent = 'DISCONNECTED';
      el.liveHeader.style.color = '#ef4444';
      if (el.metricRecord) {
        el.metricRecord.textContent = 'OFFLINE';
        el.metricRecord.style.color = '#ef4444';
      }
    }
  }
}

/**
 * Helper to update live badge element and toggle retry button
 */
function updateCardBadge(destId, status, label) {
  const badge = document.getElementById(`liveBadge_${destId}`);
  if (!badge) return;
  badge.className = `platform-live-badge status-${status}`;
  const textEl = badge.querySelector('.live-text');
  if (textEl) textEl.textContent = label;

  const retryBtn = document.getElementById(`btnRetry_${destId}`);
  if (retryBtn) {
    retryBtn.style.display = (status === 'offline' || status === 'error') ? 'inline-flex' : 'none';
  }
}

/**
 * Retry a specific failed or offline platform destination while streaming
 */
async function retryDestination(destId) {
  const dest = state.activeBroadcast.destinations.find((d) => d.id === destId);
  if (!dest) return;

  const retryBtn = document.getElementById(`btnRetry_${destId}`);
  if (retryBtn) {
    retryBtn.disabled = true;
    retryBtn.textContent = 'Retrying...';
  }
  updateCardBadge(destId, 'connecting', 'STARTING...');
  logDiag(`↻ Retrying platform destination: ${dest.name || dest.platform}...`);

  try {
    let serverUrl = dest.serverUrl;
    let streamKey = dest.streamKey;

    // 1. If Facebook or YouTube, refresh live broadcast via backend if needed
    if (dest.platform === 'facebook' || dest.platform === 'youtube') {
      try {
        const title = el.lessonTitle ? el.lessonTitle.value.trim() : 'Live Stream';
        const res = await fetch(`${state.config.backendUrl}/orchestrate-live`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(state.config.apiKey ? { 'x-api-key': state.config.apiKey } : {}),
          },
          body: JSON.stringify({
            title,
            destinations: [{
              id: dest.id,
              platform: dest.platform,
              name: dest.name,
              ...(dest.credentials || {}),
            }],
          }),
        });
        const resData = await res.json().catch(() => ({}));
        const targetRes = (resData.destinations || []).find((d) => d.id === dest.id && d.ok);
        if (targetRes) {
          serverUrl = targetRes.serverUrl;
          streamKey = targetRes.streamKey;
          dest.serverUrl = serverUrl;
          dest.streamKey = streamKey;
          if (targetRes.liveVideoId) dest.liveVideoId = targetRes.liveVideoId;
          if (targetRes.broadcastId) dest.broadcastId = targetRes.broadcastId;
        }
      } catch (cloudErr) {
        logDiag(`Note on cloud re-orchestration: ${cloudErr.message}`);
      }
    }

    // 2. Normalize Kick URL
    if (dest.platform === 'kick' && serverUrl && !serverUrl.includes('/app')) {
      serverUrl = serverUrl.replace(/\/+$/, '') + ':443/app';
      dest.serverUrl = serverUrl;
    }

    // 3. Dispatch updated outputs to native C plugin via bridge
    const secondaries = state.activeBroadcast.destinations.slice(1);
    const outputs = secondaries.map((s) => {
      let srv = s.serverUrl || s.credentials?.serverUrl || '';
      if (s.platform === 'kick' && srv && !srv.includes('/app')) {
        srv = srv.replace(/\/+$/, '') + ':443/app';
      }
      return {
        id: s.id,
        name: s.name || s.platform,
        server: srv,
        key: s.streamKey || s.credentials?.streamKey || '',
        enabled: true,
      };
    });

    await fetch('http://127.0.0.1:45455/save-destinations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outputs }),
      mode: 'cors',
    });

    // 4. Signal OBS to start/restart the output
    if (dest.id === state.activeBroadcast.destinations[0]?.id) {
      await state.obs.call('StartStream');
      logDiag(`✓ Triggered StartStream for primary destination.`);
    } else {
      try {
        await state.obs.call('StartOutput', { outputName: `simple_streamer_out_${dest.id}` });
        logDiag(`✓ Triggered StartOutput for ${dest.name || dest.platform}.`);
      } catch (wsErr) {
        logDiag(`Note on output start: ${wsErr.message}`);
      }
    }

    logDiag(`✓ Re-queued ${dest.name || dest.platform} in native multi-output plugin.`);
  } catch (err) {
    logDiag(`Retry failed: ${err.message}`);
    updateCardBadge(destId, 'offline', 'FAILED');
  } finally {
    if (retryBtn) {
      retryBtn.disabled = false;
      retryBtn.textContent = '↻ Retry';
    }
  }
}
window.retryDestination = retryDestination;

/**
 * Real-Time Stream Metrics Polling via OBS WebSocket
 */
function startMetricsPolling() {
  stopMetricsPolling();
  state.metricsInterval = setInterval(async () => {
    if (!state.obs.isConnected || !state.isStreaming) return;
    try {
      // 1. Primary Output Status
      const stats = await state.obs.call('GetStreamStatus');
      if (stats) {
        if (stats.outputBytes && stats.outputDuration) {
          const kbits = (stats.outputBytes * 8) / (stats.outputDuration / 1000) / 1000;
          if (el.metricBitrate) el.metricBitrate.textContent = `${Math.round(kbits)} kbps`;
        }
        if (stats.outputSkippedFrames !== undefined && stats.outputTotalFrames !== undefined) {
          const pct = stats.outputTotalFrames > 0 ? ((stats.outputSkippedFrames / stats.outputTotalFrames) * 100).toFixed(1) : '0';
          if (el.metricDropped) el.metricDropped.textContent = `${stats.outputSkippedFrames} (${pct}%)`;
        }

        const primaryDest = state.activeBroadcast.destinations[0];
        if (primaryDest) {
          if (stats.outputActive) {
            if (stats.outputReconnecting) {
              updateCardBadge(primaryDest.id, 'reconnecting', 'RECONNECT');
              primaryDest.isLive = false;
            } else {
              updateCardBadge(primaryDest.id, 'live', 'LIVE');
              primaryDest.isLive = true;
            }
          } else {
            const elapsed = Date.now() - (state.streamStartTime || Date.now());
            if (elapsed < 5000) {
              updateCardBadge(primaryDest.id, 'connecting', 'STARTING...');
            } else {
              updateCardBadge(primaryDest.id, 'offline', 'OFFLINE');
            }
            primaryDest.isLive = false;
          }
        }
      }

      // 2. Query FPS
      try {
        const obsStats = await state.obs.call('GetStats');
        if (obsStats && obsStats.activeFps && el.metricFps) {
          el.metricFps.textContent = Math.round(obsStats.activeFps);
        }
      } catch (_) {}

      // 3. Query Secondary Outputs
      const secondaries = state.activeBroadcast.destinations.slice(1);
      for (let i = 0; i < secondaries.length; i++) {
        const secDest = secondaries[i];
        const outputName = `simple_streamer_out_${secDest.id}`;
        let secStatus = null;

        try {
          secStatus = await state.obs.call('GetOutputStatus', { outputName });
        } catch (_) {
          if (i === 0) {
            try {
              secStatus = await state.obs.call('GetOutputStatus', { outputName: 'simple_streamer_secondary' });
            } catch (_) {}
          }
        }

        if (secStatus && secStatus.outputActive) {
          if (secStatus.outputReconnecting) {
            updateCardBadge(secDest.id, 'reconnecting', 'RECONNECT');
            secDest.isLive = false;
          } else {
            updateCardBadge(secDest.id, 'live', 'LIVE');
            secDest.isLive = true;
          }
        } else {
          const elapsed = Date.now() - (state.streamStartTime || Date.now());
          if (elapsed < 6000) {
            updateCardBadge(secDest.id, 'connecting', 'STARTING...');
          } else {
            updateCardBadge(secDest.id, 'offline', 'OFFLINE');
          }
          secDest.isLive = false;
        }
      }

      // 4. Update Header dynamically
      updateLiveHeaderDynamic();

      // 5. Periodic cloud health confirmation (every 9s)
      const now = Date.now();
      if (!state.lastCloudPoll || now - state.lastCloudPoll > 9000) {
        state.lastCloudPoll = now;
        pollCloudStatus();
      }
    } catch (_) {}
  }, 1500);
}

function stopMetricsPolling() {
  if (state.metricsInterval) {
    clearInterval(state.metricsInterval);
    state.metricsInterval = null;
  }
}

/**
 * Periodically verifies platform lifecycle status directly via cloud backend
 */
async function pollCloudStatus() {
  const activeYT = state.activeBroadcast.destinations.find((d) => d.platform === 'youtube' && d.broadcastId);
  const activeFB = state.activeBroadcast.destinations.find((d) => d.platform === 'facebook' && d.liveVideoId);

  if (!activeYT && !activeFB) return;

  try {
    const res = await fetch(`${state.config.backendUrl}/broadcast-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(state.config.apiKey ? { 'x-api-key': state.config.apiKey } : {}),
      },
      body: JSON.stringify({
        liveVideoId: activeFB?.liveVideoId,
        broadcastId: activeYT?.broadcastId,
        fbToken: activeFB?.accessToken,
        ytRefreshToken: activeYT?.refreshToken,
      }),
    });
    if (!res.ok) return;
    const data = await res.json();

    if (activeFB && data.facebook) {
      if (data.facebook.isLive) {
        activeFB.isLive = true;
        updateCardBadge(activeFB.id, 'live', 'LIVE');
      } else if (data.facebook.status === 'VOD') {
        activeFB.isLive = false;
        updateCardBadge(activeFB.id, 'offline', 'ENDED');
      }
    }

    if (activeYT && data.youtube) {
      if (data.youtube.isLive) {
        activeYT.isLive = true;
        updateCardBadge(activeYT.id, 'live', 'LIVE');
      } else if (data.youtube.status === 'complete') {
        activeYT.isLive = false;
        updateCardBadge(activeYT.id, 'offline', 'ENDED');
      }
    }

    updateLiveHeaderDynamic();
  } catch (_) {}
}

/**
 * Post-start metadata reconciliation watchdog (Industry Best Practice)
 * Verifies titles/descriptions across all platforms 8s into the stream to catch edge cache lag
 */
async function reconcileActiveBroadcastMetadata() {
  if (!state.isStreaming || !state.activeBroadcast?.destinations?.length) return;

  logDiag('Watchdog: Verifying live stream metadata across destinations...');

  try {
    const res = await fetch(`${state.config.backendUrl}/reconcile-metadata`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(state.config.apiKey ? { 'x-api-key': state.config.apiKey } : {}),
      },
      body: JSON.stringify({
        title: state.activeBroadcast.title,
        description: state.activeBroadcast.description || '',
        destinations: state.activeBroadcast.destinations.map((d) => ({
          id: d.id,
          platform: d.platform,
          broadcastId: d.broadcastId,
          liveVideoId: d.liveVideoId,
          broadcasterId: d.broadcasterId,
          accessToken: d.accessToken,
          refreshToken: d.refreshToken,
          userToken: d.userToken,
        })),
      }),
    });

    if (!res.ok) return;
    const data = await res.json();
    if (data.ok) {
      const patched = (data.results || []).filter((r) => r.patched);
      if (patched.length > 0) {
        logDiag(`Watchdog: Reconciled and updated metadata on ${patched.map((p) => p.platform).join(', ')}.`);
      } else {
        logDiag('✓ Watchdog: Verified all live titles & descriptions match.');
      }
    }
  } catch (err) {
    logDiag(`Watchdog note: ${err.message}`);
  }
}

/**
 * Handle End Stream Termination
 */
async function handleEndStream() {
  if (state.isEnding) return;
  state.isEnding = true;
  sessionStorage.removeItem('simple_streamer_stream_managed');
  state.isManagedStream = false;

  el.actionBtn.disabled = true;
  el.actionBtnText.textContent = 'ENDING STREAM...';
  logDiag('Stopping stream and closing remote sessions...');

  try {
    await state.obs.call('StopStream');
  } catch (e) {
    logDiag(`StopStream note: ${e.message}`);
  }

  // Teardown remote broadcasts via backend
  if (state.activeBroadcast.destinations && state.activeBroadcast.destinations.length > 0) {
    fetch(`${state.config.backendUrl}/end-live`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(state.config.apiKey ? { 'x-api-key': state.config.apiKey } : {}),
      },
      body: JSON.stringify({
        destinations: state.activeBroadcast.destinations,
      }),
    }).catch((err) => logDiag(`Teardown warning: ${err.message}`));
  }

  // Disarm secondary outputs in native plugin
  fetch('http://127.0.0.1:45455/save-destinations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ armed: false, outputs: [] }),
    mode: 'cors',
  }).catch(() => {});

  setLiveUI(false);
  clearAlert();
  logDiag('Stream terminated cleanly.');

  // Restore user's native OBS stream settings after stopping encoders
  setTimeout(restoreOriginalStreamServiceSettings, 1000);
}

/**
 * Connect to OBS WebSocket with automatic recovery and bridge synchronization
 */
async function connectObs(isRetry = false) {
  if (state.obs.isConnected) return;

  if (!isRetry && state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
    state.reconnectAttempts = 0;
  }

  // Auto-sync with local bridge on initial connect or every 3rd retry
  if (!state.config.obsPass || state.reconnectAttempts % 3 === 0) {
    await refreshObsConfigFromBridge();
  }

  if (!isRetry) {
    logDiag(`Connecting to OBS at ${state.config.obsUrl}...`);
  }

  try {
    await state.obs.connect(state.config.obsUrl, state.config.obsPass);
    state.reconnectAttempts = 0;
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }

    logDiag('✓ Connected to OBS WebSocket v5');
    setStatus('● CONNECTED', 'connected');
    clearAlert();
    updateActionBtnState();
    validateAllDestinations();

    const streamStatus = await state.obs.call('GetStreamStatus');
    if (streamStatus.outputActive) {
      const isManaged = sessionStorage.getItem('simple_streamer_stream_managed') === 'true';
      if (isManaged) {
        logDiag('OBS is currently streaming (Managed Simple Streamer broadcast).');
        state.isManagedStream = true;
        state.isExternalStream = false;
        setLiveUI(true);
      } else {
        logDiag('OBS is currently streaming (External broadcast detected).');
        state.isManagedStream = false;
        state.isExternalStream = true;
        setExternalLiveUI(true);
      }
    } else {
      sessionStorage.removeItem('simple_streamer_stream_managed');
      state.isManagedStream = false;
      state.isExternalStream = false;
      // If OBS was closed mid-stream or previous session had pending backup, restore native settings
      restoreOriginalStreamServiceSettings();
    }
  } catch (err) {
    if (err.message && err.message.toLowerCase().includes('auth')) {
      const updated = await refreshObsConfigFromBridge();
      if (updated) {
        try {
          await state.obs.connect(state.config.obsUrl, state.config.obsPass);
          state.reconnectAttempts = 0;
          setStatus('● CONNECTED', 'connected');
          clearAlert();
          return;
        } catch (_) {}
      }
    }

    setStatus('WAITING FOR OBS...', 'preparing');
    updateActionBtnState();
    scheduleObsReconnect();
  }
}

/**
 * Schedule background auto-reconnect to OBS WebSocket
 */
function scheduleObsReconnect() {
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
  if (state.obs.isConnected) return;

  state.reconnectAttempts = (state.reconnectAttempts || 0) + 1;
  const delay = Math.min(1000 * state.reconnectAttempts, 3000);

  state.reconnectTimer = setTimeout(async () => {
    state.reconnectTimer = null;
    if (!state.obs.isConnected) {
      await connectObs(true);
    }
  }, delay);
}

/**
 * Refresh OBS WebSocket config from local bridge
 */
async function refreshObsConfigFromBridge() {
  try {
    const res = await fetch('http://127.0.0.1:45455/obs-config', { mode: 'cors' });
    if (res.ok) {
      const cfg = await res.json();
      let updated = false;

      if (cfg.server_password !== undefined && cfg.server_password !== state.config.obsPass) {
        state.config.obsPass = cfg.server_password || '';
        localStorage.setItem('obs_orchestrator_ws_pass', state.config.obsPass);
        updated = true;
      }

      if (cfg.server_port) {
        const expectedUrl = `ws://127.0.0.1:${cfg.server_port}`;
        if (expectedUrl !== state.config.obsUrl) {
          state.config.obsUrl = expectedUrl;
          localStorage.setItem('obs_orchestrator_ws_url', state.config.obsUrl);
          updated = true;
        }
      }
      return updated;
    }
  } catch (_) {}
  return false;
}

/**
 * Generates a cryptographically secure session ID using crypto.randomUUID().
 */
function generateSecureSessionId(prefix = 'session') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return `${prefix}_` + Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `${prefix}_` + Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Pre-generate session IDs and configure anchor tags for OAuth
 */
function prepareAuthSessions() {
  state.ytSessionId = generateSecureSessionId('session_yt');
  state.fbSessionId = generateSecureSessionId('session_fb');

  const ytClientId = '259167398353-p58h9lnpfcinuq8rqssn753td1n3a4n9.apps.googleusercontent.com';
  const fbAppId = '4451619335167759';

  const ytRedirectUri = encodeURIComponent(`${state.config.backendUrl}/auth/callback/youtube`);
  const ytScope = encodeURIComponent('https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.force-ssl');
  state.ytAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${ytClientId}&redirect_uri=${ytRedirectUri}&response_type=code&scope=${ytScope}&access_type=offline&prompt=consent&state=${state.ytSessionId}`;

  const fbRedirectUri = encodeURIComponent(`${state.config.backendUrl}/auth/callback/facebook`);
  const fbScope = encodeURIComponent('pages_show_list,pages_manage_posts,publish_video,pages_read_engagement,public_profile,business_management');
  state.fbAuthUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${fbAppId}&redirect_uri=${fbRedirectUri}&scope=${fbScope}&response_type=code&auth_type=rerequest&state=${state.fbSessionId}`;
}

/**
 * Initialize Event Handlers
 */
function initEvents() {
  // Language Initialization & Dropdown Sync
  const initialLang = getLanguage();
  setLanguage(initialLang);
  if (el.langSelector) {
    el.langSelector.value = initialLang;
    el.langSelector.onchange = (e) => {
      const selected = e.target.value;
      setLanguage(selected);
      renderNavigation();
      renderTemplateOptions();
      renderDestinationsList();
      renderDestinationsPills();
      updateAccountUI(currentAccountSession);
      updateActionBtnState();
    };
  }

  // Close / Dismiss Alert Banner
  if (el.alertCloseBtn) {
    el.alertCloseBtn.onclick = () => clearAlert();
  }

  // Close / Dismiss Update Banner
  if (el.btnCloseUpdateBanner && el.updateBanner) {
    el.btnCloseUpdateBanner.onclick = () => {
      el.updateBanner.style.display = 'none';
      const versionText = el.updateBannerText ? el.updateBannerText.textContent : '';
      const match = versionText.match(/v(\d+\.\d+\.\d+)/);
      if (match) {
        sessionStorage.setItem('dismissed_update_version', match[1]);
      }
    };
  }

  // Check for app updates
  checkForAppUpdates();

  // Main Broadcast Action Button
  el.actionBtn.onclick = () => {
    if (state.isExternalStream) {
      showAlert(t('externalStreamAlertTitle') || 'EXTERNAL STREAM ACTIVE', t('externalStreamAlertMsg') || 'OBS is currently broadcasting via external controls or another plugin.');
      return;
    }
    if (state.isStreaming) {
      if (confirm(t('confirmEndStream'))) {
        handleEndStream();
      }
    } else {
      handleGoLive();
    }
  };

  // Thumbnail Dropzone & File Ingestion
  if (el.thumbnailDropzone && el.thumbnailInput) {
    el.thumbnailDropzone.onclick = (e) => {
      if (e.target === el.thumbnailClearBtn) return;
      el.thumbnailInput.click();
    };

    el.thumbnailInput.onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) processThumbnailFile(file);
    };

    el.thumbnailDropzone.ondragover = (e) => {
      e.preventDefault();
      el.thumbnailDropzone.classList.add('dragover');
    };

    el.thumbnailDropzone.ondragleave = () => {
      el.thumbnailDropzone.classList.remove('dragover');
    };

    el.thumbnailDropzone.ondrop = (e) => {
      e.preventDefault();
      el.thumbnailDropzone.classList.remove('dragover');
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) processThumbnailFile(file);
    };
  }

  if (el.thumbnailClearBtn) {
    el.thumbnailClearBtn.onclick = (e) => {
      e.stopPropagation();
      clearThumbnail();
    };
  }

  // Broadcast Template Selector & Title Counter Init
  if (el.templateSelector) {
    renderTemplateOptions();
    el.templateSelector.onchange = handleTemplateSelect;
    syncPresetsWithCloud(false);
  }
  updateTitleCounter();

  // Settings Navigation & Subpages
  if (el.toggleDiagBtn) {
    el.toggleDiagBtn.onclick = () => handleTopRightAction();
  }
  if (el.btnHeaderAccount) {
    el.btnHeaderAccount.onclick = () => navigateTo('account');
  }
  if (el.btnMenuDestinations) {
    el.btnMenuDestinations.onclick = () => navigateTo('destinations');
  }
  if (el.btnMenuRemote) {
    el.btnMenuRemote.onclick = () => navigateTo('remote');
  }
  if (el.btnMenuAccount) {
    el.btnMenuAccount.onclick = () => navigateTo('account');
  }
  if (el.btnMenuGeneral) {
    el.btnMenuGeneral.onclick = () => navigateTo('general');
  }
  if (el.btnReconnectObsSettings) {
    el.btnReconnectObsSettings.onclick = () => {
      showAlert('RECONNECTING OBS...', 'Attempting to reconnect to OBS Studio WebSocket...');
      connectObs();
    };
  }
  if (el.btnResetLocalData) {
    el.btnResetLocalData.onclick = () => resetAllLocalState();
  }

  // Account & Device Entitlement Verification
  loadCachedAccountSession();
  verifyAccountSession();

  // Toggle Add Platform Options Grid
  const collapseAddPlatforms = () => {
    if (el.addPlatformsGrid) el.addPlatformsGrid.style.display = 'none';
    if (el.btnToggleAddPlatforms) el.btnToggleAddPlatforms.textContent = t('btnAddPlatform');
  };

  if (el.btnToggleAddPlatforms && el.addPlatformsGrid) {
    el.btnToggleAddPlatforms.onclick = () => {
      const isHidden = el.addPlatformsGrid.style.display === 'none';
      el.addPlatformsGrid.style.display = isHidden ? 'grid' : 'none';
      el.btnToggleAddPlatforms.textContent = isHidden ? t('btnClosePlatforms') : t('btnAddPlatform');
    };
  }

  // Discovery Card Actions
  if (el.btnConfirmDiscovery) {
    el.btnConfirmDiscovery.onclick = () => {
      if (typeof state.discoveryCallback === 'function') {
        state.discoveryCallback();
      }
    };
  }
  if (el.btnCancelDiscovery) {
    el.btnCancelDiscovery.onclick = () => hideDiscovery();
  }
  if (el.btnCloseDiscovery) {
    el.btnCloseDiscovery.onclick = () => hideDiscovery();
  }

  // Add YouTube Channel
  if (el.btnAddYt) {
    el.btnAddYt.onclick = () => {
      collapseAddPlatforms();
      promptAddYouTube();
    };
  }

  // Add Facebook Page
  if (el.btnAddFb) {
    el.btnAddFb.onclick = () => {
      collapseAddPlatforms();
      promptAddFacebook();
    };
  }

  // Add Twitch Channel (1-Click OAuth Sign-In - Free)
  if (el.btnAddTwitch) {
    el.btnAddTwitch.onclick = async () => {
      collapseAddPlatforms();
      const sessionId = generateSecureSessionId('session_tw');
      await openExternalUrl(`${state.config.backendUrl}/auth/twitch/start?session=${sessionId}`);
      logDiag('Waiting for Twitch authorization in browser...');
      startTwitchPoll(sessionId);
    };
  }

  // Add Kick Channel (1-Click OAuth Sign-In - Free)
  if (el.btnAddKick) {
    el.btnAddKick.onclick = async () => {
      collapseAddPlatforms();
      const sessionId = generateSecureSessionId('session_kc');
      await openExternalUrl(`${state.config.backendUrl}/auth/kick/start?session=${sessionId}`);
      logDiag('Waiting for Kick authorization in browser...');
      startKickPoll(sessionId);
    };
  }

  // Add Custom RTMP (TikTok, X / Twitter, Rumble, etc.)
  if (el.btnAddCustomRtmp) {
    el.btnAddCustomRtmp.onclick = () => {
      collapseAddPlatforms();
      promptAddCustomRtmp();
    };
  }

  // Update Live Stream Info
  if (el.btnUpdateLiveMetadata) {
    el.btnUpdateLiveMetadata.onclick = () => {
      handleUpdateLiveMetadata();
    };
  }

  // OBS WebSocket Events
  state.obs.on('StreamStateChanged', (data) => {
    if (data.outputActive) {
      const isManaged = state.isManagedStream || sessionStorage.getItem('simple_streamer_stream_managed') === 'true';
      if (isManaged) {
        state.isManagedStream = true;
        state.isExternalStream = false;
        if (!state.isStreaming) setLiveUI(true);
      } else {
        state.isManagedStream = false;
        state.isExternalStream = true;
        setExternalLiveUI(true);
      }
    } else {
      const wasManaged = state.isManagedStream || sessionStorage.getItem('simple_streamer_stream_managed') === 'true' || state.isStreaming;
      sessionStorage.removeItem('simple_streamer_stream_managed');
      state.isManagedStream = false;

      if (wasManaged) {
        // If stream was stopped via OBS native button or external hotkey,
        // trigger clean teardown across remote cloud platforms
        if (state.activeBroadcast?.destinations?.length > 0) {
          fetch(`${state.config.backendUrl}/end-live`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(state.config.apiKey ? { 'x-api-key': state.config.apiKey } : {}),
            },
            body: JSON.stringify({
              destinations: state.activeBroadcast.destinations,
            }),
          }).catch(() => {});
        }
        setLiveUI(false);
        setTimeout(restoreOriginalStreamServiceSettings, 1000);
      } else if (state.isExternalStream) {
        setExternalLiveUI(false);
      }
      state.isExternalStream = false;
    }
  });

  state.obs.on('RecordStateChanged', (data) => {
    state.isRecording = data.outputActive;
    if (el.metricRecord) el.metricRecord.textContent = data.outputActive ? 'ACTIVE' : 'OFF';
  });

  state.obs.on('disconnected', () => {
    logDiag('OBS WebSocket disconnected. Scheduling auto-reconnect...');
    setStatus('WAITING FOR OBS...', 'preparing');
    updateActionBtnState();
    scheduleObsReconnect();
  });

  // Mobile Remote Custom Events Handshake
  state.obs.on('CustomEvent', async (eventData) => {
    if (!eventData || !eventData.action) return;

    if (eventData.action === 'SYNC_REQUEST') {
      const titleEl = document.getElementById('lessonTitle');
      const descEl = document.getElementById('lessonDescription');
      const curTitle = titleEl ? titleEl.value.trim() : '';
      const curDesc = descEl ? descEl.value.trim() : '';

      await state.obs.call('BroadcastCustomEvent', {
        eventData: {
          action: 'SYNC_RESPONSE',
          title: curTitle,
          description: curDesc,
          destinations: (state.destinations || []).map((d) => ({
            id: d.id,
            name: d.name || d.platform,
            platform: d.platform,
            enabled: d.enabled,
          })),
          isLive: state.isStreaming,
          isExternalStream: state.isExternalStream,
          isPreparing: state.isPreparing,
          pin: state.sessionPin,
        },
      }).catch(() => {});
    } else if (eventData.action === 'UPDATE_DETAILS' || eventData.action === 'UPDATE_TITLE') {
      const newTitle = eventData.title;
      const newDesc = eventData.description;
      const titleEl = document.getElementById('lessonTitle');
      const descEl = document.getElementById('lessonDescription');

      if (newTitle !== undefined && titleEl) {
        titleEl.value = newTitle;
        localStorage.setItem('dock_lessonTitle', newTitle);
        updateTitleCounter();
      }
      if (newDesc !== undefined && descEl) {
        descEl.value = newDesc;
        localStorage.setItem('dock_lessonDescription', newDesc);
      }
      if (newTitle) logDiag(`📱 Broadcast title updated from Remote: "${newTitle}"`);
      checkLiveMetadataDirty();
    } else if (eventData.action === 'TOGGLE_DESTINATION') {
      if (state.isStreaming || state.isPreparing) {
        logDiag('⚠️ Cannot toggle platforms while broadcast is active/preparing.');
        return;
      }
      const destId = eventData.id;
      const target = (state.destinations || []).find((d) => d.id === destId || d.name === destId || d.platform === destId);
      if (target) {
        target.enabled = (eventData.enabled !== undefined) ? !!eventData.enabled : !target.enabled;
        saveDestinations();
        logDiag(`📱 Platform "${target.name || target.platform}" ${target.enabled ? 'ENABLED' : 'DISABLED'} from Mobile Remote.`);
      }
    } else if (eventData.action === 'REMOTE_GO_LIVE') {
      if (state.sessionPin && eventData.pin && eventData.pin !== state.sessionPin) {
        logDiag('⚠️ Mobile Remote GO_LIVE rejected: Invalid PIN.');
        return;
      }
      if (eventData.titleOverride) {
        const titleEl = document.getElementById('lessonTitle');
        if (titleEl) {
          titleEl.value = eventData.titleOverride;
          localStorage.setItem('dock_lessonTitle', eventData.titleOverride);
          updateTitleCounter();
        }
      }
      if (!state.isStreaming && !state.isPreparing) {
        logDiag('📱 Mobile Remote triggered START BROADCAST');
        handleGoLive();
      }
    } else if (eventData.action === 'REMOTE_STOP') {
      if (state.sessionPin && eventData.pin && eventData.pin !== state.sessionPin) {
        logDiag('⚠️ Mobile Remote STOP rejected: Invalid PIN.');
        return;
      }
      if (state.isStreaming) {
        logDiag('📱 Mobile Remote triggered STOP BROADCAST');
        handleEndStream();
      }
    }
  });

  // Auto-save form inputs & live sync on typing
  let syncDebounceTimer = null;
  ['lessonTitle', 'lessonDescription'].forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    const saved = localStorage.getItem('dock_' + id);
    if (saved && !saved.includes('[object')) input.value = saved;
    if (id === 'lessonTitle') updateTitleCounter();
    input.addEventListener('input', () => {
      const val = input.value.trim();
      if (!val.includes('[object')) {
        localStorage.setItem('dock_' + id, val);
      }
      clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => syncMetadataToBridgeAndRemote(), 200);
      if (id === 'lessonTitle') updateTitleCounter();
      if (activePresetId) renderTemplateOptions();
      checkLiveMetadataDirty();
    });
    input.addEventListener('change', () => {
      syncMetadataToBridgeAndRemote();
      checkLiveMetadataDirty();
    });
    input.addEventListener('blur', () => {
      syncMetadataToBridgeAndRemote();
      checkLiveMetadataDirty();
    });
  });

  // Pull initial title from bridge if local is empty
  fetch('http://127.0.0.1:45455/remote-config')
    .then((r) => r.json())
    .then((cfg) => {
      if (!cfg) return;
      if (cfg.authToken && cfg.authToken.trim() && cfg.authToken.trim() !== getAuthToken()) {
        localStorage.setItem('simple_streamer_auth_token', cfg.authToken.trim());
        verifyAccountSession();
      }
      const titleEl = document.getElementById('lessonTitle');
      const descEl = document.getElementById('lessonDescription');
      if (titleEl && (!titleEl.value || titleEl.value.includes('[object')) && cfg.title && !cfg.title.includes('[object')) {
        titleEl.value = cfg.title;
        localStorage.setItem('dock_lessonTitle', cfg.title);
        updateTitleCounter();
      }
      if (descEl && (!descEl.value || descEl.value.includes('[object')) && cfg.description !== undefined && !cfg.description.includes('[object')) {
        descEl.value = cfg.description;
        localStorage.setItem('dock_lessonDescription', cfg.description);
      }
    })
    .catch(() => {});

  // Continuous bidirectional sync loop (syncs edits from phone every 1.5s if not currently typing on PC)
  setInterval(() => {
    const titleEl = document.getElementById('lessonTitle');
    const descEl = document.getElementById('lessonDescription');
    const isTypingTitle = (document.activeElement === titleEl);
    const isTypingDesc = (document.activeElement === descEl);

    fetch('http://127.0.0.1:45455/remote-config')
      .then((r) => r.json())
      .then((cfg) => {
        if (!cfg || !cfg.ok) return;
        if (cfg.authToken && cfg.authToken.trim() && cfg.authToken.trim() !== getAuthToken()) {
          logDiag('Auto-applying bridge license token...');
          localStorage.setItem('simple_streamer_auth_token', cfg.authToken.trim());
          verifyAccountSession();
        }
        if (!isTypingTitle && titleEl && cfg.title !== undefined && !cfg.title.includes('[object') && cfg.title !== titleEl.value) {
          titleEl.value = cfg.title;
          localStorage.setItem('dock_lessonTitle', cfg.title);
          updateTitleCounter();
        }
        if (!isTypingDesc && descEl && cfg.description !== undefined && !cfg.description.includes('[object') && cfg.description !== descEl.value) {
          descEl.value = cfg.description;
          localStorage.setItem('dock_lessonDescription', cfg.description);
        }
      })
      .catch(() => {});
  }, 1500);

  // Heartbeat local rig presence to cloud orchestrator (Disabled by default; enable if cloud routing needed)
  const ENABLE_PRESENCE_HEARTBEAT = false;
  async function heartbeatPresence() {
    if (!ENABLE_PRESENCE_HEARTBEAT) return;
    try {
      const res = await fetch('http://127.0.0.1:45455/remote-config');
      if (!res.ok) return;
      const cfg = await res.json();
      if (cfg && cfg.hostIp && cfg.hostIp !== '127.0.0.1') {
        await fetch(`${state.config.backendUrl}/api/presence`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lanIp: cfg.hostIp,
            bridgePort: cfg.bridgePort || 45455,
            obsPort: cfg.obsPort || 4455,
          }),
        });
      }
    } catch (_) {}
  }
  if (ENABLE_PRESENCE_HEARTBEAT) {
    setInterval(heartbeatPresence, 15000);
    setTimeout(heartbeatPresence, 2000);
  }
}

// Initial Boot Sequence
loadCachedAccountSession();
syncDeviceHwidFromBridge().catch(() => {});
updateActionBtnState();
initEvents();
prepareAuthSessions();
connectObs();
loadDestinations();
validateAllDestinations();
