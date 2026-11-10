import { ObsWebSocketClient } from './obs-client.js';

// Platform SVG Icons (Clean & Scalable)
const PLATFORM_ICONS = {
  youtube: `<svg class="platform-svg yt" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
  facebook: `<svg class="platform-svg fb" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
  twitch: `<svg class="platform-svg twitch" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2.149 0l-1.612 4.119v16.8h5.9v3.081h3.081l3.08-3.081h4.632l6.219-6.219V0H2.149zm19.231 13.638l-3.693 3.693h-5.228l-3.081 3.081v-3.081H4.632V2.149h16.748v11.489zm-4.632-6.529h-2.149v5.901h2.149V7.109zm-5.9 0H8.699v5.901h2.149V7.109z"/></svg>`,
  kick: `<svg class="platform-svg kick" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M1.333 0h7.62v7.619h3.809V3.81h3.81V0h7.618v11.429h-3.81v3.809h3.81V24h-7.619v-3.81h-3.81v-3.809H8.952V24H1.333V0z"/></svg>`,
};

// Application State
const state = {
  obs: new ObsWebSocketClient(),
  isStreaming: false,
  isRecording: false,
  isPreparing: false,
  isEnding: false,
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
    backendUrl: localStorage.getItem('obs_orchestrator_backend_url') || (window.location.origin.startsWith('http') ? window.location.origin : 'https://simple-streamer.bdjlmn.com'),
    apiKey: localStorage.getItem('obs_orchestrator_api_key') || '',
  },
  discoveryCallback: null,
};

// DOM References
const el = {
  statusBadge: document.getElementById('statusBadge'),
  toggleDiagBtn: document.getElementById('toggleDiagBtn'),
  brandTitle: document.getElementById('brandTitle'),
  brandSub: document.getElementById('brandSub'),
  actionContainer: document.querySelector('.action-container'),
  alertBox: document.getElementById('alertBox'),
  alertTitle: document.getElementById('alertTitle'),
  alertMsg: document.getElementById('alertMsg'),
  alertActions: document.getElementById('alertActions'),
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
  actionBtn: document.getElementById('actionBtn'),
  actionBtnText: document.getElementById('actionBtnText'),
  diagPanel: document.getElementById('diagPanel'),

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
  if (state.isStreaming) {
    el.actionBtn.disabled = false;
    el.actionBtn.className = 'btn-primary stop';
    el.actionBtnText.textContent = '⏹ STOP STREAM';
    return;
  }

  if (state.isPreparing) {
    el.actionBtn.disabled = true;
    el.actionBtn.className = 'btn-primary';
    el.actionBtnText.textContent = 'PREPARING STREAM...';
    return;
  }

  if (state.isEnding) {
    el.actionBtn.disabled = true;
    el.actionBtn.className = 'btn-primary';
    el.actionBtnText.textContent = 'ENDING STREAM...';
    return;
  }

  if (!state.obs.isConnected) {
    el.actionBtn.disabled = true;
    el.actionBtn.className = 'btn-primary';
    el.actionBtnText.textContent = 'CONNECTING TO OBS...';
    return;
  }

  // Check destination readiness
  const enabledTargets = state.destinations.filter((d) => d.enabled);
  if (enabledTargets.length === 0) {
    el.actionBtn.disabled = true;
    el.actionBtn.className = 'btn-primary';
    el.actionBtnText.textContent = 'SELECT DESTINATION FIRST';
    return;
  }

  const hasInvalid = enabledTargets.some((d) => d.status === 'invalid');
  if (hasInvalid) {
    el.actionBtn.disabled = true;
    el.actionBtn.className = 'btn-primary';
    el.actionBtnText.textContent = 'DESTINATION ERROR - CHECK SETTINGS';
    return;
  }

  // Ready to stream
  el.actionBtn.disabled = false;
  el.actionBtn.className = 'btn-primary';
  el.actionBtnText.textContent = '▶ GO LIVE';
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
}

/**
 * Show Alert Banner with optional action buttons
 */
function showAlert(title, message, actions = []) {
  if (!el.alertBox) return;
  el.alertTitle.textContent = title;
  el.alertMsg.textContent = message;
  el.alertActions.innerHTML = '';

  actions.forEach((act) => {
    const btn = document.createElement('button');
    btn.className = 'alert-btn';
    btn.textContent = act.label;
    btn.onclick = act.onClick;
    el.alertActions.appendChild(btn);
  });

  el.alertBox.style.display = 'block';
}

function clearAlert() {
  if (el.alertBox) {
    el.alertBox.style.display = 'none';
    el.alertActions.innerHTML = '';
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
  state.timerInterval = setInterval(() => {
    const elapsed = Date.now() - state.streamStartTime;
    if (el.liveTimer) el.liveTimer.textContent = formatElapsed(elapsed);
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

/**
 * Toggle Settings Drawer View
 */
function toggleSettingsPanel(forceState) {
  const isCurrentlyOpen = el.diagPanel.style.display === 'block';
  const shouldOpen = forceState !== undefined ? forceState : !isCurrentlyOpen;

  el.diagPanel.style.display = shouldOpen ? 'block' : 'none';
  if (el.inputGroup) {
    el.inputGroup.style.display = shouldOpen ? 'none' : 'block';
  }
  if (el.liveContainer && state.isStreaming) {
    el.liveContainer.style.display = shouldOpen ? 'none' : 'block';
  }
  if (el.actionContainer) {
    el.actionContainer.style.display = shouldOpen ? 'none' : 'block';
  }
  if (el.toggleDiagBtn) {
    el.toggleDiagBtn.classList.toggle('active', shouldOpen);
    el.toggleDiagBtn.textContent = shouldOpen ? '✕' : '⚙';
    el.toggleDiagBtn.title = shouldOpen ? 'Back to Simple Streamer' : 'Platform Settings & Connections';
  }
  if (el.brandTitle) {
    el.brandTitle.textContent = shouldOpen ? 'SETTINGS' : 'SIMPLE STREAMER';
  }
  if (el.brandSub) {
    el.brandSub.textContent = '';
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
}

/**
 * Load Destinations from LocalStorage with Seamless Legacy Migration
 */
function loadDestinations() {
  const raw = localStorage.getItem('simple_streamer_destinations');
  if (raw) {
    try {
      state.destinations = JSON.parse(raw);
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

  renderDestinationsPills();
  renderDestinationsList();
  syncNativePluginConfig();
}

/**
 * Save Destinations to LocalStorage and update UI
 */
function saveDestinations() {
  localStorage.setItem('simple_streamer_destinations', JSON.stringify(state.destinations));
  renderDestinationsPills();
  renderDestinationsList();
  syncNativePluginConfig();
  updateActionBtnState();
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
    emptyBtn.innerHTML = '+ Connect your first platform';
    emptyBtn.onclick = () => toggleSettingsPanel(true);
    el.destinationsPills.appendChild(emptyBtn);
    return;
  }

  state.destinations.forEach((dest) => {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = `dest-pill ${dest.enabled ? 'active' : 'disabled'}`;
    pill.title = `${dest.name} - Click to toggle`;

    const icon = PLATFORM_ICONS[dest.platform] || '';
    pill.innerHTML = `${icon} <span>${dest.name}</span>`;
    pill.onclick = () => {
      dest.enabled = !dest.enabled;
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
        No broadcast destinations configured.<br>Click "+ Add Platform" above to link a channel or page.
      </div>
    `;
    return;
  }

  state.destinations.forEach((dest) => {
    const card = document.createElement('div');
    card.className = 'destination-card';

    const icon = PLATFORM_ICONS[dest.platform] || '';

    card.innerHTML = `
      <div class="destination-card-left">
        ${icon}
        <span class="destination-name">${dest.name}</span>
      </div>
      <div class="destination-card-right">
        <button type="button" class="btn-icon-del" id="del_${dest.id}" title="Remove destination">✕</button>
      </div>
    `;

    // Delete destination
    const delBtn = card.querySelector(`#del_${dest.id}`);
    delBtn.onclick = () => {
      if (confirm(`Remove "${dest.name}" from Simple Streamer?`)) {
        state.destinations = state.destinations.filter((d) => d.id !== dest.id);
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
    dest.status = data.valid ? 'valid' : 'invalid';
    dest.statusError = data.error || null;
    if (data.channelName && !dest.name) dest.name = data.channelName;
    if (data.streamKey && !dest.credentials.streamKey) dest.credentials.streamKey = data.streamKey;
    if (data.streamName && !dest.credentials.streamName) dest.credentials.streamName = data.streamName;
    if (data.ingestionAddress && !dest.credentials.ingestionAddress) dest.credentials.ingestionAddress = data.ingestionAddress;
  } catch (err) {
    dest.status = 'invalid';
    dest.statusError = err.message;
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
          found.status = r.valid ? 'valid' : 'invalid';
          found.statusError = r.error || null;
          if (r.channelName && !found.name) found.name = r.channelName;
          if (r.streamKey && !found.credentials.streamKey) found.credentials.streamKey = r.streamKey;
          if (r.streamName && !found.credentials.streamName) found.credentials.streamName = r.streamName;
          if (r.ingestionAddress && !found.credentials.ingestionAddress) found.credentials.ingestionAddress = r.ingestionAddress;
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
  toggleSettingsPanel(true);
  el.discoveryTitle.textContent = title;
  el.discoveryBody.innerHTML = contentHtml;
  el.discoveryCard.style.display = 'block';
  state.discoveryCallback = onConfirm;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideDiscovery() {
  el.discoveryCard.style.display = 'none';
  el.discoveryBody.innerHTML = '';
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
      credentials: {
        refreshToken,
        streamId: selectedStreamId,
        streamName: matchedStream?.streamName || '',
        ingestionAddress: matchedStream?.ingestionAddress || 'rtmp://a.rtmp.youtube.com/live2',
      },
    };

    // Replace if existing channel id exists, otherwise add
    const existingIdx = state.destinations.findIndex((d) => d.platform === 'youtube' && d.name === channelTitle);
    if (existingIdx >= 0) {
      state.destinations[existingIdx] = dest;
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
        credentials: {
          pageId,
          accessToken,
        },
      };

      const existingIdx = state.destinations.findIndex((d) => d.id === dest.id);
      if (existingIdx >= 0) {
        state.destinations[existingIdx] = dest;
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
        fetch('http://127.0.0.1:45455/focus-obs', { mode: 'no-cors' }).catch(() => {});
        promptConfirmTwitch(data);
      } else if (data.error) {
        clearInterval(poll);
        showAlert('TWITCH ERROR', data.error);
      }
    } catch (_) {}
  }, 1500);
}

function promptConfirmTwitch(data) {
  const { channelName, broadcasterId, streamKey, userToken, serverUrl } = data;
  const html = `
    <div style="margin-bottom: 10px;">
      <div style="font-weight: 700; color: #fff; margin-bottom: 4px;">Twitch Channel Authorized:</div>
      <div style="background: #0f172a; padding: 8px 10px; border-radius: 6px; border: 1px solid #334155; font-size: 13px; font-weight: 800; color: #9146ff;">
        ${channelName}
      </div>
      <p style="font-size: 10px; color: #94a3b8; margin: 8px 0 0 0;">
        ✓ Stream key linked automatically.<br>
        ✓ Automatic title updates enabled.
      </p>
    </div>
  `;

  showDiscovery('Confirm Twitch Channel', html, async () => {
    const dest = {
      id: 'twitch_' + (broadcasterId || Date.now()),
      platform: 'twitch',
      name: channelName,
      accountName: channelName,
      enabled: true,
      status: 'valid',
      credentials: {
        broadcasterId,
        channelName,
        streamKey,
        userToken,
        serverUrl: serverUrl || 'rtmp://live.twitch.tv/app/',
      },
    };

    const existingIdx = state.destinations.findIndex((d) => d.platform === 'twitch' && d.name === channelName);
    if (existingIdx >= 0) {
      state.destinations[existingIdx] = dest;
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
        fetch('http://127.0.0.1:45455/focus-obs', { mode: 'no-cors' }).catch(() => {});
        promptConfirmKick(data);
      } else if (data.error) {
        clearInterval(poll);
        showAlert('KICK ERROR', data.error);
      }
    } catch (_) {}
  }, 1500);
}

function promptConfirmKick(data) {
  const { channelName, userToken, serverUrl, streamKey: fetchedStreamKey } = data;
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
          ✓ Automatic title updates enabled.
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
      id: 'kick_' + Date.now(),
      platform: 'kick',
      name: channelName,
      accountName: channelName,
      enabled: true,
      status: 'valid',
      credentials: {
        channelSlug: channelName,
        streamKey: finalStreamKey,
        userToken,
        serverUrl: serverUrl || 'rtmps://fa723ac112e7.global-contribute.live-video.net:443/app/',
      },
    };

    const existingIdx = state.destinations.findIndex((d) => d.platform === 'kick' && d.name === channelName);
    if (existingIdx >= 0) {
      state.destinations[existingIdx] = dest;
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

  const enabledTargets = state.destinations.filter((d) => d.enabled);
  if (enabledTargets.length === 0) {
    toggleSettingsPanel(true);
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

  let gcpResponse = null;
  try {
    const res = await fetch(`${state.config.backendUrl}/orchestrate-live`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(state.config.apiKey ? { 'x-api-key': state.config.apiKey } : {}),
      },
      body: JSON.stringify({
        title,
        description,
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
      throw new Error(gcpResponse.error || `HTTP ${res.status}`);
    }
  } catch (err) {
    state.isPreparing = false;
    setStatus('ERROR', 'error');
    el.actionBtn.disabled = false;
    el.actionBtnText.textContent = 'GO LIVE';
    showAlert('ORCHESTRATION FAILED', `${err.message}. Check your internet connection.`, [
      { label: 'RETRY', onClick: () => handleGoLive() },
    ]);
    return;
  }

  const returnedDests = gcpResponse.destinations || [];
  const successfulDests = returnedDests.filter((d) => d.ok);
  const failedDests = returnedDests.filter((d) => !d.ok);

  if (successfulDests.length === 0) {
    state.isPreparing = false;
    setStatus('ERROR', 'error');
    el.actionBtn.disabled = false;
    el.actionBtnText.textContent = 'GO LIVE';
    const firstErr = returnedDests.find((d) => !d.ok)?.error || 'Unknown error';
    showAlert('ALL DESTINATIONS FAILED', `Could not create broadcasts: ${firstErr}`);
    return;
  }

  if (failedDests.length > 0) {
    const failedNames = failedDests.map((f) => f.name || f.platform.toUpperCase()).join(', ');
    showAlert('PARTIAL STREAM START', `Live on ${successfulDests.length} target(s). Failed: ${failedNames} (${failedDests[0].error})`);
  }

  // 1. Primary Output configured directly in OBS
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

  // 3. Start OBS Stream
  try {
    logDiag('Starting OBS Stream...');
    await state.obs.call('StartStream');

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

    setLiveUI(true);
  } catch (err) {
    state.isPreparing = false;
    logDiag(`OBS Start failed: ${err.message}`);
    showAlert('OBS START FAILED', `OBS encoder error: ${err.message}`);
  }
}

/**
 * Transition UI between Standby and Live states
 */
function setLiveUI(isLive) {
  state.isStreaming = isLive;
  state.isPreparing = false;
  state.isEnding = false;

  if (isLive) {
    setStatus('LIVE', 'live');
    if (el.liveContainer) el.liveContainer.style.display = 'block';
    if (el.inputGroup) el.inputGroup.style.display = 'none';

    el.actionBtn.disabled = false;
    el.actionBtn.className = 'btn-primary stop';
    el.actionBtnText.textContent = '⏹ STOP STREAM';

    // Populate Real-Time Platform Status Grid
    renderPlatformLiveGrid();
    startTimer();

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
      logDiag('OBS is currently streaming.');
      setLiveUI(true);
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
  // Main Broadcast Action Button
  el.actionBtn.onclick = () => {
    if (state.isStreaming) {
      handleEndStream();
    } else {
      handleGoLive();
    }
  };

  // Toggle Settings
  el.toggleDiagBtn.onclick = () => toggleSettingsPanel();

  // Toggle Add Platform Options Grid
  const collapseAddPlatforms = () => {
    if (el.addPlatformsGrid) el.addPlatformsGrid.style.display = 'none';
    if (el.btnToggleAddPlatforms) el.btnToggleAddPlatforms.textContent = '+ Add Platform';
  };

  if (el.btnToggleAddPlatforms && el.addPlatformsGrid) {
    el.btnToggleAddPlatforms.onclick = () => {
      const isHidden = el.addPlatformsGrid.style.display === 'none';
      el.addPlatformsGrid.style.display = isHidden ? 'grid' : 'none';
      el.btnToggleAddPlatforms.textContent = isHidden ? '✕ Close Platform Options' : '+ Add Platform';
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
    el.btnAddYt.onclick = async () => {
      collapseAddPlatforms();
      prepareAuthSessions();
      await openExternalUrl(state.ytAuthUrl);
      logDiag('Waiting for YouTube Google authorization...');
      startYouTubePoll(state.ytSessionId);
    };
  }

  // Add Facebook Page
  if (el.btnAddFb) {
    el.btnAddFb.onclick = async () => {
      collapseAddPlatforms();
      prepareAuthSessions();
      await openExternalUrl(state.fbAuthUrl);
      logDiag('Waiting for Facebook authorization...');
      startFacebookPoll(state.fbSessionId);
    };
  }

  // Add Twitch Channel (1-Click OAuth)
  if (el.btnAddTwitch) {
    el.btnAddTwitch.onclick = async () => {
      collapseAddPlatforms();
      const sessionId = generateSecureSessionId('session_tw');
      await openExternalUrl(`${state.config.backendUrl}/auth/twitch/start?session=${sessionId}`);
      logDiag('Waiting for Twitch authorization in browser...');
      startTwitchPoll(sessionId);
    };
  }

  // Add Kick Channel (1-Click OAuth)
  if (el.btnAddKick) {
    el.btnAddKick.onclick = async () => {
      collapseAddPlatforms();
      const sessionId = generateSecureSessionId('session_kc');
      await openExternalUrl(`${state.config.backendUrl}/auth/kick/start?session=${sessionId}`);
      logDiag('Waiting for Kick authorization in browser...');
      startKickPoll(sessionId);
    };
  }

  // OBS WebSocket Events
  state.obs.on('StreamStateChanged', (data) => {
    if (data.outputActive && !state.isStreaming) {
      setLiveUI(true);
    } else if (!data.outputActive && state.isStreaming) {
      setLiveUI(false);
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

  // Auto-save form inputs
  ['lessonTitle', 'lessonDescription'].forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    const saved = localStorage.getItem('dock_' + id);
    if (saved) input.value = saved;
    input.addEventListener('input', () => {
      localStorage.setItem('dock_' + id, input.value.trim());
    });
  });
}

// Initial Boot Sequence
updateActionBtnState();
initEvents();
prepareAuthSessions();
connectObs();
loadDestinations();
validateAllDestinations();
