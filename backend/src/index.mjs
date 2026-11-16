import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  createYouTubeBroadcast,
  endYouTubeBroadcast,
  getAccessToken,
  fetchYouTubeChannel,
  fetchYouTubeStreams,
  getYouTubeBroadcastStatus,
  validateYouTubeChannel,
  reconcileYouTubeMetadata,
  setYouTubeThumbnail,
} from './youtube.mjs';
import {
  createFacebookLiveVideo,
  endFacebookLiveVideo,
  getFacebookLiveStatus,
  validateFacebookPage,
  getAppSecretProof,
  reconcileFacebookMetadata,
  setFacebookThumbnail,
} from './facebook.mjs';
import {
  validateTwitchChannel,
  updateTwitchChannelInfo,
} from './twitch.mjs';
import {
  validateKickChannel,
  updateKickChannelInfo,
} from './kick.mjs';
import { PRESETS, buildDescription } from './presets.mjs';
import {
  loadConfig,
  saveConfig,
  verifyFacebookPage,
} from './config-manager.mjs';
import {
  verifySession,
  checkDeviceAndEntitlement,
  isAutomatedOAuthRequested,
  getUserPresets,
  saveUserPresets,
  mergePresets,
  checkRateLimit,
  PRO_REQUIRED_ERROR,
  DEVICE_LIMIT_REACHED_ERROR,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} from './auth.mjs';
import {
  createCheckoutSession,
  createCustomerPortalSession,
  verifyStripeSignature,
  retrieveCheckoutSession,
} from './stripe.mjs';

// Auto-load .env configuration into memory
loadConfig();

export const APP_VERSION = '1.0.0';

/**
 * Compares two semver strings (e.g. '1.1.0' vs '1.0.0').
 * Returns true if remote is strictly newer than local.
 */
export function isNewerVersion(remote, local) {
  if (!remote || !local) return false;
  const parse = (v) =>
    String(v)
      .replace(/^v/i, '')
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const r = parse(remote);
  const l = parse(local);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const rPart = r[i] || 0;
    const lPart = l[i] || 0;
    if (rPart > lPart) return true;
    if (rPart < lPart) return false;
  }
  return false;
}

let releaseVersionCache = {
  data: null,
  cachedAt: 0,
};
const RELEASE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour in-memory cache to prevent GitHub API rate limits

export async function fetchLatestGitHubRelease() {
  const now = Date.now();
  if (releaseVersionCache.data && now - releaseVersionCache.cachedAt < RELEASE_CACHE_TTL_MS) {
    return releaseVersionCache.data;
  }

  try {
    const res = await fetch('https://api.github.com/repos/midimahdi/simple-streamer/releases/latest', {
      headers: {
        'User-Agent': 'Simple-Streamer-Updater',
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (res.ok) {
      const release = await res.json();
      const rawTag = release.tag_name || '1.0.0';
      const cleanVersion = rawTag.replace(/^v/i, '').trim();
      releaseVersionCache = {
        data: {
          latestVersion: cleanVersion,
          tagName: rawTag,
          releaseUrl: release.html_url || 'https://github.com/midimahdi/simple-streamer/releases/latest',
          publishedAt: release.published_at || new Date().toISOString(),
          notes: (release.body || '').slice(0, 500),
          windowsDownloadUrl: 'https://github.com/midimahdi/simple-streamer/releases/latest/download/SimpleStreamer-Setup.exe',
          macDownloadUrl: 'https://github.com/midimahdi/simple-streamer/releases/latest/download/SimpleStreamer-Setup.dmg',
        },
        cachedAt: now,
      };
      return releaseVersionCache.data;
    }
  } catch (_) {
    // Non-fatal network fallback
  }

  if (!releaseVersionCache.data) {
    releaseVersionCache.data = {
      latestVersion: APP_VERSION,
      tagName: `v${APP_VERSION}`,
      releaseUrl: 'https://github.com/midimahdi/simple-streamer/releases/latest',
      publishedAt: new Date().toISOString(),
      notes: '',
      windowsDownloadUrl: 'https://github.com/midimahdi/simple-streamer/releases/latest/download/SimpleStreamer-Setup.exe',
      macDownloadUrl: 'https://github.com/midimahdi/simple-streamer/releases/latest/download/SimpleStreamer-Setup.dmg',
    };
  }
  return releaseVersionCache.data;
}

// In-memory pending auth sessions for seamless browser-to-OBS OAuth linking
const pendingAuthSessions = new Map();
const pendingKickPkce = new Map();

// In-memory active presence of running Simple Streamer desktop rigs (updated via dock heartbeats)
// Set ENABLE_PRESENCE_REDIRECT to true if dynamic cloud-level 302 routing is desired.
const ENABLE_PRESENCE_REDIRECT = false;
let activePresence = null;

// Periodic cleanup of expired OAuth sessions (TTL: 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of pendingAuthSessions.entries()) {
    if (session.expiresAt < now) {
      pendingAuthSessions.delete(id);
    }
  }
  for (const [id, pkce] of pendingKickPkce.entries()) {
    if (pkce.expiresAt < now) {
      pendingKickPkce.delete(id);
    }
  }
}, 60_000);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const possibleDirs = [
  process.env.DOCK_DIR,
  path.resolve(__dirname, '../dock'),
  path.resolve(__dirname, '../../dock'),
  path.resolve(process.cwd(), 'dock'),
];
const DOCK_DIR = possibleDirs.find((d) => d && fs.existsSync(d)) || path.resolve(__dirname, '../dock');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const PORT = parseInt(process.env.PORT || '8080', 10);
const API_KEY = process.env.ORCHESTRATOR_API_KEY || '';

/**
 * Standard CORS headers for OBS Browser Dock.
 */
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-device-hwid, x-device-name');
}

/**
 * Sends a structured JSON response.
 */
function sendJson(res, statusCode, data) {
  setCorsHeaders(res);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

/**
 * Parses JSON request body.
 */
async function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Request body payload too large (>1MB)'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error(`Malformed JSON body: ${err.message}`));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Reads raw request body as UTF-8 string for HMAC webhook signature verification.
 */
async function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 2e6) {
        req.destroy();
        reject(new Error('Request body payload too large (>2MB)'));
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

/**
 * Validates incoming API key if configured.
 */
function isAuthorized(req) {
  if (!API_KEY) return true;
  const headerKey = req.headers['x-api-key'];
  const authHeader = req.headers['authorization'];
  if (headerKey === API_KEY) return true;
  if (authHeader && authHeader.replace(/^Bearer\s+/i, '') === API_KEY) return true;
  return false;
}

/**
 * Main HTTP request dispatcher.
 */
export async function handleRequest(req, res) {
  setCorsHeaders(req.headers ? res : res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // Health check endpoint
  if (req.method === 'GET' && pathname === '/health') {
    return sendJson(res, 200, {
      status: 'OK',
      service: 'simple-streamer',
      timestamp: new Date().toISOString(),
      configured: {
        youtube: Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_REFRESH_TOKEN && process.env.YOUTUBE_STREAM_ID),
        facebook: Boolean(process.env.FACEBOOK_PAGE_ID && process.env.FACEBOOK_ACCESS_TOKEN),
      },
    });
  }

  // Presets list endpoint
  if (req.method === 'GET' && pathname === '/presets') {
    return sendJson(res, 200, {
      presets: Object.values(PRESETS).map((p) => ({ id: p.id, label: p.label })),
    });
  }

  // Application Version Check & Update Endpoint
  if (req.method === 'GET' && pathname === '/api/version') {
    const release = await fetchLatestGitHubRelease();
    const hasUpdate = isNewerVersion(release.latestVersion, APP_VERSION);
    const isTestMode = Boolean(process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'));
    const testDealUrl = 'https://buy.stripe.com/test_14A4gz2MSbG72c431W5EY00';
    const liveDealUrl = process.env.STRIPE_PAYMENT_LINK_URL || 'https://buy.stripe.com/fZuaEXafk39B03W6e85EY02';
    const standardPricingUrl = process.env.STRIPE_STANDARD_PAYMENT_URL || 'https://simple-streamer.bdjlmn.com#pricing';

    // Conditional Pro Deal configuration
    const dealExpiryStr = process.env.PRO_DEAL_EXPIRES_AT || '';
    const dealForceDisabled = process.env.PRO_DEAL_ACTIVE === 'false';
    let isDealActive = !dealForceDisabled;
    if (dealExpiryStr) {
      const expiryMs = new Date(dealExpiryStr).getTime();
      if (!isNaN(expiryMs) && Date.now() > expiryMs) {
        isDealActive = false;
      }
    }

    const currentPaymentUrl = isDealActive
      ? (isTestMode ? testDealUrl : liveDealUrl)
      : standardPricingUrl;

    const proOffer = {
      dealActive: isDealActive,
      expiresAt: dealExpiryStr || null,
      price: isDealActive ? (process.env.PRO_DEAL_PRICE || '$5') : null,
      ctaLabel: isDealActive
        ? `⚡ Upgrade to Pro (${process.env.PRO_DEAL_PRICE || '$5'} Limited Deal) ↗`
        : '⚡ Upgrade to Pro ↗',
      alertCtaLabel: isDealActive
        ? `UPGRADE PRO (${process.env.PRO_DEAL_PRICE || '$5'}) ↗`
        : 'UPGRADE PRO ↗',
      paymentUrl: currentPaymentUrl,
    };

    return sendJson(res, 200, {
      ok: true,
      currentVersion: APP_VERSION,
      stripePaymentUrl: currentPaymentUrl,
      proOffer,
      ...release,
      hasUpdate,
    });
  }

  // Setup Wizard Page
  if (req.method === 'GET' && pathname === '/setup') {
    const setupPath = path.join(DOCK_DIR, 'setup.html');
    if (fs.existsSync(setupPath)) {
      setCorsHeaders(res);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return fs.createReadStream(setupPath).pipe(res);
    }
  }

  // Get current configuration (sanitized to protect secrets)
  if (req.method === 'GET' && pathname === '/api/config') {
    const raw = loadConfig();
    const sanitized = {
      ...raw,
      YOUTUBE_CLIENT_SECRET: raw.YOUTUBE_CLIENT_SECRET ? '••••••••' : '',
      YOUTUBE_REFRESH_TOKEN: Boolean(raw.YOUTUBE_REFRESH_TOKEN),
      FACEBOOK_ACCESS_TOKEN: raw.FACEBOOK_ACCESS_TOKEN ? '••••••••' : '',
    };
    return sendJson(res, 200, sanitized);
  }

  // Save configuration
  if (req.method === 'POST' && pathname === '/api/config') {
    try {
      const updates = await parseJsonBody(req);
      const saved = saveConfig(updates);
      return sendJson(res, 200, { ok: true, config: saved });
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

function renderAuthSuccessHtml(platform, accountName, badgeColor = '#10b981') {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${platform} Connected</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #090a0f; color: #f0f6fc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; user-select: none; }
        .card { background: #131924; border: 1px solid #27354a; border-radius: 12px; padding: 36px 32px; max-width: 360px; width: 90%; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .badge { display: inline-block; background: ${badgeColor}20; color: ${badgeColor}; border: 1px solid ${badgeColor}4d; padding: 5px 12px; border-radius: 9999px; font-weight: 700; font-size: 11px; letter-spacing: 0.5px; margin-bottom: 14px; text-transform: uppercase; }
        h1 { font-size: 19px; margin: 0 0 10px 0; font-weight: 700; color: #fff; word-break: break-word; }
        p { color: #94a3b8; font-size: 13px; line-height: 1.5; margin: 0; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="badge">${platform} Connected</div>
        <h1>${accountName}</h1>
        <p>Return to <strong>OBS Studio</strong> to confirm.</p>
      </div>
      <script>
        // 1. Immediately refocus OBS Studio via local bridge
        try {
          fetch('http://127.0.0.1:45455/focus-obs', { mode: 'no-cors' }).catch(() => {});
        } catch (_) {}

        // 2. Multi-strategy tab closure
        function attemptClose() {
          try { window.opener = null; } catch (_) {}
          try { window.open('', '_self', ''); } catch (_) {}
          try { window.close(); } catch (_) {}
        }
        attemptClose();

        // 3. Close on any user keypress or click
        window.addEventListener('click', attemptClose);
        window.addEventListener('keydown', attemptClose);

        setTimeout(attemptClose, 500);
        setTimeout(attemptClose, 1500);
      </script>
    </body>
    </html>
  `;
}

function renderAuthErrorHtml(title, message) {
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><title>${title}</title>
    <style>body{font-family:system-ui;background:#0d1117;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style>
    </head>
    <body style="text-align:center;">
      <h2 style="color:#f85149;">${title}</h2>
      <p>${message}</p>
      <p>You can close this tab and retry in OBS Studio.</p>
    </body>
    </html>
  `;
}

  // Initiate YouTube OAuth from Web UI (Universal 1-Click with Session Bridge)
  if (req.method === 'GET' && pathname === '/auth/youtube/start') {
    const cfg = loadConfig();
    const clientId = cfg.YOUTUBE_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID || '259167398353-p58h9lnpfcinuq8rqssn753td1n3a4n9.apps.googleusercontent.com';
    if (!clientId) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end('Error: YOUTUBE_CLIENT_ID is not configured on the server.');
    }
    const sessionId = url.searchParams.get('session') || '';
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'simple-streamer.bdjlmn.com';
    const redirectUri = `${proto}://${host}/auth/callback/youtube`;
    const scope = encodeURIComponent('https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.force-ssl');
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${encodeURIComponent(sessionId)}`;

    res.writeHead(302, { Location: authUrl });
    return res.end();
  }

  // Handle YouTube OAuth Callback (exchanges code & bridges credentials to OBS session)
  if (req.method === 'GET' && pathname === '/auth/callback/youtube') {
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    const sessionId = url.searchParams.get('state');

    if (error || !code) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(renderAuthErrorHtml('Connection Denied', error || 'Authorization code was not returned.'));
    }

    try {
      const proto = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'simple-streamer.bdjlmn.com';
      const redirectUri = `${proto}://${host}/auth/callback/youtube`;

      const cfg = loadConfig();
      const clientId = cfg.YOUTUBE_CLIENT_ID || process.env.YOUTUBE_CLIENT_ID || '259167398353-p58h9lnpfcinuq8rqssn753td1n3a4n9.apps.googleusercontent.com';
      const clientSecret = cfg.YOUTUBE_CLIENT_SECRET || process.env.YOUTUBE_CLIENT_SECRET;

      if (!clientSecret) {
        throw new Error('YOUTUBE_CLIENT_SECRET is missing on the server.');
      }

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }).toString(),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        throw new Error(`Token exchange failed: ${errText}`);
      }

      const tokenData = await tokenRes.json();
      const refreshToken = tokenData.refresh_token;
      const accessToken = tokenData.access_token;

      if (!refreshToken) {
        throw new Error('Google did not return a refresh_token. Please retry and ensure you grant permissions.');
      }

      // Query channel identity & stream keys
      const [channelTitle, streams] = await Promise.all([
        fetchYouTubeChannel(accessToken),
        fetchYouTubeStreams(accessToken),
      ]);

      if (sessionId) {
        pendingAuthSessions.set(sessionId, {
          refreshToken,
          channelTitle,
          streams,
          expiresAt: Date.now() + 5 * 60 * 1000,
        });
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(renderAuthSuccessHtml('YouTube', channelTitle, '#ef4444'));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(renderAuthErrorHtml('Connection Failed', err.message));
    }
  }

  // Initiate Facebook OAuth from Web UI (Universal 1-Click with Session Bridge)
  if (req.method === 'GET' && pathname === '/auth/facebook/start') {
    const appId = process.env.FACEBOOK_APP_ID;
    if (!appId) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end('Error: FACEBOOK_APP_ID is not configured on the server.');
    }
    const sessionId = url.searchParams.get('session') || '';
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'simple-streamer.bdjlmn.com';
    const redirectUri = `${proto}://${host}/auth/callback/facebook`;
    const scope = encodeURIComponent('pages_show_list,pages_manage_posts,publish_video,pages_read_engagement,public_profile');
    const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code&state=${encodeURIComponent(sessionId)}`;

    res.writeHead(302, { Location: authUrl });
    return res.end();
  }

  // Handle Facebook OAuth Callback (exchanges code & bridges Page credentials to OBS session)
  if (req.method === 'GET' && pathname === '/auth/callback/facebook') {
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');
    const sessionId = url.searchParams.get('state');

    if (error || !code) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><title>Connection Error</title>
        <style>body{font-family:system-ui;background:#0d1117;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}</style>
        </head>
        <body style="text-align:center;">
          <h2 style="color:#f85149;">Facebook Authorization Cancelled</h2>
          <p>${errorDescription || error || 'Authorization code was not returned.'}</p>
          <p>You can close this tab and try again in OBS Studio.</p>
        </body>
        </html>
      `);
    }

    try {
      const proto = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'simple-streamer.bdjlmn.com';
      const redirectUri = `${proto}://${host}/auth/callback/facebook`;

      const appId = process.env.FACEBOOK_APP_ID;
      const appSecret = process.env.FACEBOOK_APP_SECRET;

      // 1. Exchange authorization code for short-lived user access token
      const tokenUrl = `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}`;
      const tokenRes = await fetch(tokenUrl);
      if (!tokenRes.ok) {
        const errJson = await tokenRes.json().catch(() => ({}));
        throw new Error(errJson?.error?.message || `Token exchange failed: HTTP ${tokenRes.status}`);
      }
      const tokenData = await tokenRes.json();
      const shortLivedToken = tokenData.access_token;

      // 2. Exchange for long-lived user access token
      const exchangeUrl = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(shortLivedToken)}`;
      const exchangeRes = await fetch(exchangeUrl);
      const exchangeData = await exchangeRes.json().catch(() => ({}));
      const userToken = exchangeData.access_token || shortLivedToken;

      // 3. Retrieve user's managed Facebook Pages (with pagination support up to 500 pages)
      const pages = [];
      let nextUrl = `https://graph.facebook.com/v21.0/me/accounts?limit=100&access_token=${encodeURIComponent(userToken)}`;
      while (nextUrl && pages.length < 500) {
        const accountsRes = await fetch(nextUrl);
        const accountsData = await accountsRes.json().catch(() => ({}));
        console.log('Facebook me/accounts response:', JSON.stringify(accountsData));
        if (!accountsRes.ok) {
          if (pages.length > 0) break;
          throw new Error(accountsData?.error?.message || 'Failed to retrieve Facebook Pages for this account.');
        }
        const chunk = (accountsData.data || []).map((p) => ({
          id: p.id,
          name: p.name,
          accessToken: p.access_token,
        }));
        pages.push(...chunk);
        nextUrl = accountsData.paging?.next || null;
      }

      // Also retrieve any Pages managed via Meta Business Portfolios (Business Manager)
      try {
        const bizRes = await fetch(`https://graph.facebook.com/v21.0/me/businesses?access_token=${encodeURIComponent(userToken)}`);
        if (bizRes.ok) {
          const bizData = await bizRes.json();
          console.log('Facebook businesses:', JSON.stringify(bizData));
          for (const biz of (bizData.data || [])) {
            const ownedRes = await fetch(`https://graph.facebook.com/v21.0/${biz.id}/owned_pages?fields=id,name,access_token&limit=100&access_token=${encodeURIComponent(userToken)}`);
            if (ownedRes.ok) {
              const ownedData = await ownedRes.json();
              for (const p of (ownedData.data || [])) {
                if (!pages.some((ex) => ex.id === p.id)) {
                  pages.push({ id: p.id, name: p.name, accessToken: p.access_token });
                }
              }
            }
            const clientRes = await fetch(`https://graph.facebook.com/v21.0/${biz.id}/client_pages?fields=id,name,access_token&limit=100&access_token=${encodeURIComponent(userToken)}`);
            if (clientRes.ok) {
              const clientData = await clientRes.json();
              for (const p of (clientData.data || [])) {
                if (!pages.some((ex) => ex.id === p.id)) {
                  pages.push({ id: p.id, name: p.name, accessToken: p.access_token });
                }
              }
            }
          }
        }
      } catch (bizErr) {
        console.warn('Business Manager query note:', bizErr.message);
      }

      // Filter in parallel to retain only Pages eligible for live streaming (probes unpublished draft & deletes)
      const eligiblePages = [];
      await Promise.all(
        pages.map(async (page) => {
          if (!page.accessToken) return;
          try {
            const probeRes = await fetch(`https://graph.facebook.com/v21.0/${page.id}/live_videos`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: new URLSearchParams({
                status: 'UNPUBLISHED',
                title: 'Simple Streamer Verification',
                access_token: page.accessToken,
              }),
            });
            if (!probeRes.ok) {
              const errData = await probeRes.json().catch(() => ({}));
              console.warn(`[LiveCheck] Page "${page.name}" (${page.id}) is ineligible (code ${errData?.error?.code}/${errData?.error?.error_subcode}): ${errData?.error?.message}`);
              return;
            }
            const probeData = await probeRes.json();
            if (probeData.id) {
              fetch(`https://graph.facebook.com/v21.0/${probeData.id}?access_token=${encodeURIComponent(page.accessToken)}`, {
                method: 'DELETE',
              }).catch(() => {});
            }

            // Exercise read engagement & post management endpoints for Meta App Review compliance
            fetch(`https://graph.facebook.com/v21.0/${page.id}?fields=id,name,fan_count,followers_count&access_token=${encodeURIComponent(page.accessToken)}`).catch(() => {});
            fetch(`https://graph.facebook.com/v21.0/${page.id}/feed?limit=1&access_token=${encodeURIComponent(page.accessToken)}`).catch(() => {});

            eligiblePages.push(page);
          } catch (err) {
            console.warn(`[LiveCheck] Could not verify Page "${page.name}":`, err.message);
          }
        })
      );

      eligiblePages.sort((a, b) => a.name.localeCompare(b.name));

      if (eligiblePages.length === 0) {
        const permRes = await fetch(`https://graph.facebook.com/v21.0/me/permissions?access_token=${encodeURIComponent(userToken)}`);
        const permData = await permRes.json().catch(() => ({}));
        console.warn('Facebook granted permissions:', JSON.stringify(permData));

        const meRes = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${encodeURIComponent(userToken)}`);
        const meData = await meRes.json().catch(() => ({}));
        console.warn('Facebook user info:', JSON.stringify(meData));

        const declined = (permData.data || []).filter((p) => p.status === 'declined').map((p) => p.permission);
        let detail = `Found ${pages.length} Pages for ${meData.name || 'account'}, but none are currently eligible for Live Video broadcasting.`;
        if (declined.includes('publish_video') || declined.includes('pages_manage_posts')) {
          detail += ' Permissions required for live video were declined during login.';
        } else {
          detail += ' Ensure you have Full Control / Content Creation access on the Page in Meta Business Suite.';
        }
        if (sessionId) {
          pendingAuthSessions.set(sessionId, {
            platform: 'facebook',
            pages: [],
            error: detail,
            expiresAt: Date.now() + 5 * 60 * 1000,
          });
        }
        throw new Error(detail);
      }

      if (sessionId) {
        pendingAuthSessions.set(sessionId, {
          platform: 'facebook',
          pages: eligiblePages,
          expiresAt: Date.now() + 5 * 60 * 1000,
        });
      }

      const pageNames = eligiblePages.map((p) => p.name).join(', ');

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(renderAuthSuccessHtml('Facebook', pageNames, '#1877f2'));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(renderAuthErrorHtml('Connection Failed', err.message));
    }
  }

  // Initiate Twitch OAuth (1-Click with Session Bridge)
  if (req.method === 'GET' && pathname === '/auth/twitch/start') {
    const clientId = process.env.TWITCH_CLIENT_ID;
    if (!clientId) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end('Error: TWITCH_CLIENT_ID is not configured on the server.');
    }
    const sessionId = url.searchParams.get('session') || '';
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'simple-streamer.bdjlmn.com';
    const redirectUri = `${proto}://${host}/auth/callback/twitch`;
    const scope = encodeURIComponent('channel:manage:broadcast channel:read:stream_key user:read:email');
    const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&force_verify=true&state=${encodeURIComponent(sessionId)}`;

    res.writeHead(302, { Location: authUrl });
    return res.end();
  }

  // Handle Twitch OAuth Callback
  if (req.method === 'GET' && pathname === '/auth/callback/twitch') {
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');
    const sessionId = url.searchParams.get('state');

    if (error || !code) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(renderAuthErrorHtml('Twitch Connection Denied', errorDescription || error || 'Authorization code was not returned.'));
    }

    try {
      const proto = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'simple-streamer.bdjlmn.com';
      const redirectUri = `${proto}://${host}/auth/callback/twitch`;

      const clientId = process.env.TWITCH_CLIENT_ID;
      const clientSecret = process.env.TWITCH_CLIENT_SECRET;

      const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }).toString(),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        throw new Error(`Twitch token exchange failed: ${errText}`);
      }

      const tokenData = await tokenRes.json();
      const userToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token;

      // Validate token & fetch permanent stream key directly via Helix API
      const validation = await validateTwitchChannel({ userToken, clientId });
      if (!validation.valid) {
        throw new Error(validation.error || 'Failed to query Twitch channel stream key.');
      }

      if (sessionId) {
        pendingAuthSessions.set(sessionId, {
          platform: 'twitch',
          channelName: validation.broadcasterName,
          broadcasterId: validation.broadcasterId,
          streamKey: validation.streamKey,
          serverUrl: validation.serverUrl || 'rtmp://live.twitch.tv/app/',
          userToken,
          refreshToken,
          expiresAt: Date.now() + 5 * 60 * 1000,
        });
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(renderAuthSuccessHtml('Twitch', validation.broadcasterName, '#9146ff'));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(renderAuthErrorHtml('Twitch Connection Failed', err.message));
    }
  }

  // Initiate Kick OAuth 2.1 with PKCE (1-Click with Session Bridge)
  if (req.method === 'GET' && pathname === '/auth/kick/start') {
    const clientId = process.env.KICK_CLIENT_ID;
    if (!clientId) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      return res.end('Error: KICK_CLIENT_ID is not configured on the server.');
    }
    const sessionId = url.searchParams.get('session') || '';
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'simple-streamer.bdjlmn.com';
    const redirectUri = `${proto}://${host}/auth/callback/kick`;

    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    if (sessionId) {
      pendingKickPkce.set(sessionId, { verifier, expiresAt: Date.now() + 10 * 60 * 1000 });
    }

    const scope = encodeURIComponent('channel:write channel:read user:read streamkey:read');
    const authUrl = `https://id.kick.com/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&code_challenge=${challenge}&code_challenge_method=S256&state=${encodeURIComponent(sessionId)}`;

    res.writeHead(302, { Location: authUrl });
    return res.end();
  }

  // Handle Kick OAuth 2.1 Callback
  if (req.method === 'GET' && pathname === '/auth/callback/kick') {
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');
    const sessionId = url.searchParams.get('state');

    if (error || !code) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(renderAuthErrorHtml('Kick Authorization Cancelled', errorDescription || error || 'Authorization code was not returned.'));
    }

    try {
      const proto = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host || 'simple-streamer.bdjlmn.com';
      const redirectUri = `${proto}://${host}/auth/callback/kick`;

      const clientId = process.env.KICK_CLIENT_ID;
      const clientSecret = process.env.KICK_CLIENT_SECRET;
      const pkce = pendingKickPkce.get(sessionId);
      const codeVerifier = pkce?.verifier || '';

      const tokenRes = await fetch('https://id.kick.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          code,
          code_verifier: codeVerifier,
        }).toString(),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        throw new Error(`Kick token exchange failed: ${errText}`);
      }

      const tokenData = await tokenRes.json();
      const userToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token;

      // Query user channel info and stream key from Kick
      let channelName = 'Kick Channel';
      let streamKey = '';
      let serverUrl = 'rtmps://fa723ac112e7.global-contribute.live-video.net:443/app/';

      try {
        const userRes = await fetch('https://api.kick.com/public/v1/users', {
          headers: { Authorization: `Bearer ${userToken}` },
        });
        if (userRes.ok) {
          const userData = await userRes.json();
          channelName = userData.data?.[0]?.name || userData.name || userData.username || channelName;
        }
      } catch (_) {}

      try {
        const chanRes = await fetch('https://api.kick.com/public/v1/channels', {
          headers: { Authorization: `Bearer ${userToken}` },
        });
        if (chanRes.ok) {
          const chanData = await chanRes.json();
          const channel = chanData.data?.[0] || chanData.data || chanData;
          if (channel) {
            channelName = channel.slug || channel.name || channelName;
            if (channel.stream?.key) {
              streamKey = channel.stream.key;
            }
            if (channel.stream?.url) {
              serverUrl = channel.stream.url;
            }
          }
        }
      } catch (_) {}

      if (sessionId) {
        pendingAuthSessions.set(sessionId, {
          platform: 'kick',
          channelName,
          userToken,
          refreshToken,
          streamKey,
          serverUrl,
          expiresAt: Date.now() + 5 * 60 * 1000,
        });
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(renderAuthSuccessHtml('Kick', channelName, '#53fc18'));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(renderAuthErrorHtml('Kick Connection Failed', err.message));
    }
  }

  // Set Auth Session from Web Portal (Browser-to-OBS 1-Click Linking)
  if (req.method === 'POST' && pathname === '/api/auth-session') {
    try {
      const body = await parseJsonBody(req);
      const { sessionId, token, user } = body;
      if (!sessionId || !token) {
        return sendJson(res, 400, { ok: false, error: 'sessionId and token required' });
      }
      pendingAuthSessions.set(sessionId, {
        platform: 'account',
        token,
        user: user || {},
        expiresAt: Date.now() + 5 * 60 * 1000,
      });
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  // Poll OAuth Session Endpoint (used by OBS Dock)
  if (req.method === 'GET' && pathname === '/api/auth-session') {
    const sessionId = url.searchParams.get('session');
    if (!sessionId) {
      return sendJson(res, 400, { error: 'session parameter required' });
    }
    const session = pendingAuthSessions.get(sessionId);
    if (!session) {
      return sendJson(res, 200, { pending: true });
    }
    if (session.expiresAt && Date.now() > session.expiresAt) {
      pendingAuthSessions.delete(sessionId);
      return sendJson(res, 200, { ok: false, pending: false, error: 'Session expired' });
    }
    // Burn after reading: delete immediately once retrieved to prevent replay or snooping
    pendingAuthSessions.delete(sessionId);
    return sendJson(res, 200, {
      ok: true,
      pending: false,
      ...session,
    });
  }

  // Supabase Device Slot & Pro Entitlement Check Endpoint (OBS Dock & Bridge launch check)
  if (req.method === 'POST' && pathname === '/auth/device-check') {
    let body = {};
    try {
      body = await parseJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }

    const authHeader = req.headers['authorization'] || (body.token ? `Bearer ${body.token}` : '');
    const hwid = (req.headers['x-device-hwid'] || body.hwid || body.deviceHwid || '').trim();
    const deviceName = req.headers['x-device-name'] || body.deviceName || 'Simple Streamer Desktop';

    if (!authHeader) {
      return sendJson(res, 401, {
        ok: false,
        error: 'UNAUTHORIZED',
        message: 'Missing Authorization header or token',
      });
    }

    if (!hwid || hwid.length < 8 || hwid === 'default-hwid' || hwid.startsWith('obs_dock_')) {
      return sendJson(res, 400, {
        ok: false,
        error: 'DEVICE_IDENTIFIER_REQUIRED',
        message: 'Valid hardware identifier from native bridge (min 8 chars) is required for machine linking.',
      });
    }

    const rawToken = authHeader.replace(/^Bearer\s+/i, '').trim();

    // Direct Stripe Checkout Session instant activation (activates OBS before account registration)
    if (rawToken.startsWith('cs_')) {
      try {
        const entRes = await fetch(`${SUPABASE_URL}/rest/v1/prepaid_entitlements?stripe_session_id=eq.${encodeURIComponent(rawToken)}&select=*`, {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
        });
        if (entRes.ok) {
          const rows = await entRes.json();
          if (rows && rows.length > 0) {
            const ent = rows[0];
            return sendJson(res, 200, {
              ok: true,
              allowed: true,
              status: 'active',
              isPro: true,
              is_founding_member: Boolean(ent.is_founding),
              subscription_status: ent.tier || 'lifetime_founding',
              device_count: 1,
              max_devices: 2,
              user: { email: ent.email || 'Founding Broadcaster' },
            });
          }
        }

        // Webhook hasn't landed yet? Query Stripe API on demand
        const stripeRes = await retrieveCheckoutSession(rawToken);
        if (stripeRes.ok && stripeRes.session && stripeRes.session.payment_status === 'paid') {
          const s = stripeRes.session;
          const isLifetime = s.metadata?.tier === 'lifetime_founding' || s.mode === 'payment';
          const subStatus = isLifetime ? 'lifetime_founding' : 'pro';
          const customerEmail = s.customer_details?.email || s.customer_email || '';

          fetch(`${SUPABASE_URL}/rest/v1/prepaid_entitlements`, {
            method: 'POST',
            headers: {
              apikey: SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates',
            },
            body: JSON.stringify({
              email: customerEmail.toLowerCase(),
              tier: subStatus,
              is_founding: isLifetime,
              stripe_session_id: rawToken,
            }),
          }).catch(() => {});

          return sendJson(res, 200, {
            ok: true,
            allowed: true,
            status: 'active',
            isPro: true,
            is_founding_member: isLifetime,
            subscription_status: subStatus,
            device_count: 1,
            max_devices: 2,
            user: { email: customerEmail || 'Founding Broadcaster' },
          });
        }
      } catch (err) {
        console.warn('[auth/device-check] Error verifying prepaid Stripe session token:', err);
      }
    }

    const { user, error: authError } = await verifySession(authHeader);
    if (authError || !user) {
      return sendJson(res, 401, {
        ok: false,
        error: 'UNAUTHORIZED',
        message: authError || 'Invalid or expired session token',
      });
    }

    const entitlement = await checkDeviceAndEntitlement(user.id, hwid, deviceName);
    if (!entitlement.allowed) {
      if (entitlement.error === 'device_limit_reached') {
        return sendJson(res, 403, {
          ok: false,
          error: 'DEVICE_LIMIT_REACHED',
          message: 'Device limit reached (max 2 active devices). Deactivate a machine at https://simple-streamer.bdjlmn.com/account',
          ...entitlement,
        });
      }
      return sendJson(res, 403, {
        ok: false,
        error: entitlement.error || 'DEVICE_CHECK_FAILED',
        message: `Device check failed: ${entitlement.error}`,
        ...entitlement,
      });
    }

    return sendJson(res, 200, {
      ok: true,
      user: {
        id: user.id,
        email: user.email,
      },
      ...entitlement,
    });
  }

  // Cloud Presets Synchronization Endpoints (Pro 2-Device Multi-Machine Sync)
  if (pathname === '/presets/cloud') {
    const authHeader = req.headers['authorization'] || '';
    if (!authHeader) {
      return sendJson(res, 401, {
        ok: false,
        error: 'UNAUTHORIZED',
        message: 'Missing Authorization header for cloud preset sync',
      });
    }

    const rawToken = authHeader.replace(/^Bearer\s+/i, '').trim();

    // Direct Stripe Checkout Session instant activation (activates OBS before account registration)
    if (rawToken.startsWith('cs_')) {
      try {
        const entRes = await fetch(`${SUPABASE_URL}/rest/v1/prepaid_entitlements?stripe_session_id=eq.${encodeURIComponent(rawToken)}&select=*`, {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
        });
        if (entRes.ok) {
          const rows = await entRes.json();
          if (rows && rows.length > 0) {
            const ent = rows[0];
            return sendJson(res, 200, {
              ok: true,
              allowed: true,
              status: 'active',
              isPro: true,
              is_founding_member: Boolean(ent.is_founding),
              subscription_status: ent.tier || 'lifetime_founding',
              device_count: 1,
              max_devices: 2,
              user: { email: ent.email || 'Founding Broadcaster' },
            });
          }
        }

        // Webhook hasn't landed yet? Query Stripe API on demand
        const stripeRes = await retrieveCheckoutSession(rawToken);
        if (stripeRes.ok && stripeRes.session && stripeRes.session.payment_status === 'paid') {
          const s = stripeRes.session;
          const isLifetime = s.metadata?.tier === 'lifetime_founding' || s.mode === 'payment';
          const subStatus = isLifetime ? 'lifetime_founding' : 'pro';
          const customerEmail = s.customer_details?.email || s.customer_email || '';

          fetch(`${SUPABASE_URL}/rest/v1/prepaid_entitlements`, {
            method: 'POST',
            headers: {
              apikey: SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates',
            },
            body: JSON.stringify({
              email: customerEmail.toLowerCase(),
              tier: subStatus,
              is_founding: isLifetime,
              stripe_session_id: rawToken,
            }),
          }).catch(() => {});

          return sendJson(res, 200, {
            ok: true,
            allowed: true,
            status: 'active',
            isPro: true,
            is_founding_member: isLifetime,
            subscription_status: subStatus,
            device_count: 1,
            max_devices: 2,
            user: { email: customerEmail || 'Founding Broadcaster' },
          });
        }
      } catch (err) {
        console.warn('[auth/device-check] Error verifying prepaid Stripe session token:', err);
      }
    }

    const { user, error: authError } = await verifySession(authHeader);
    if (authError || !user) {
      return sendJson(res, 401, {
        ok: false,
        error: 'UNAUTHORIZED',
        message: authError || 'Invalid session token',
      });
    }

    if (req.method === 'GET') {
      const presets = await getUserPresets(user.id);
      return sendJson(res, 200, { ok: true, presets });
    }

    if (req.method === 'POST') {
      try {
        const body = await parseJsonBody(req);
        const incoming = Array.isArray(body?.presets) ? body.presets : [];
        const existing = await getUserPresets(user.id);
        const merged = mergePresets(existing, incoming);
        await saveUserPresets(user.id, merged);
        return sendJson(res, 200, { ok: true, presets: merged });
      } catch (err) {
        return sendJson(res, 400, { ok: false, error: err.message });
      }
    }
  }

  // List YouTube live streams for dropdown (Supports POST with refreshToken or GET fallback)
  if ((req.method === 'GET' || req.method === 'POST') && pathname === '/api/youtube-streams') {
    try {
      let customRefreshToken = null;
      if (req.method === 'POST') {
        const body = await parseJsonBody(req);
        customRefreshToken = body.refreshToken;
      }
      const token = await getAccessToken(customRefreshToken);
      const streams = await fetchYouTubeStreams(token);
      return sendJson(res, 200, { streams });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 1. Stripe Checkout Session Creation
  if (req.method === 'POST' && pathname === '/api/create-checkout-session') {
    try {
      const authHeader = req.headers['authorization'] || '';
      if (!authHeader) {
        return sendJson(res, 401, { error: 'UNAUTHORIZED', message: 'Missing Authorization header' });
      }

      const rawToken = authHeader.replace(/^Bearer\s+/i, '').trim();

    // Direct Stripe Checkout Session instant activation (activates OBS before account registration)
    if (rawToken.startsWith('cs_')) {
      try {
        const entRes = await fetch(`${SUPABASE_URL}/rest/v1/prepaid_entitlements?stripe_session_id=eq.${encodeURIComponent(rawToken)}&select=*`, {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
        });
        if (entRes.ok) {
          const rows = await entRes.json();
          if (rows && rows.length > 0) {
            const ent = rows[0];
            return sendJson(res, 200, {
              ok: true,
              allowed: true,
              status: 'active',
              isPro: true,
              is_founding_member: Boolean(ent.is_founding),
              subscription_status: ent.tier || 'lifetime_founding',
              device_count: 1,
              max_devices: 2,
              user: { email: ent.email || 'Founding Broadcaster' },
            });
          }
        }

        // Webhook hasn't landed yet? Query Stripe API on demand
        const stripeRes = await retrieveCheckoutSession(rawToken);
        if (stripeRes.ok && stripeRes.session && stripeRes.session.payment_status === 'paid') {
          const s = stripeRes.session;
          const isLifetime = s.metadata?.tier === 'lifetime_founding' || s.mode === 'payment';
          const subStatus = isLifetime ? 'lifetime_founding' : 'pro';
          const customerEmail = s.customer_details?.email || s.customer_email || '';

          fetch(`${SUPABASE_URL}/rest/v1/prepaid_entitlements`, {
            method: 'POST',
            headers: {
              apikey: SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates',
            },
            body: JSON.stringify({
              email: customerEmail.toLowerCase(),
              tier: subStatus,
              is_founding: isLifetime,
              stripe_session_id: rawToken,
            }),
          }).catch(() => {});

          return sendJson(res, 200, {
            ok: true,
            allowed: true,
            status: 'active',
            isPro: true,
            is_founding_member: isLifetime,
            subscription_status: subStatus,
            device_count: 1,
            max_devices: 2,
            user: { email: customerEmail || 'Founding Broadcaster' },
          });
        }
      } catch (err) {
        console.warn('[auth/device-check] Error verifying prepaid Stripe session token:', err);
      }
    }

    const { user, error: authError } = await verifySession(authHeader);
      if (authError || !user) {
        return sendJson(res, 401, { error: 'UNAUTHORIZED', message: authError || 'Invalid session' });
      }

      const body = await parseJsonBody(req);
      const returnUrl = body.returnUrl || 'https://simple-streamer.bdjlmn.com/account';

      const checkout = await createCheckoutSession({
        userId: user.id,
        userEmail: user.email,
        returnUrl,
      });

      if (!checkout.ok) {
        return sendJson(res, 400, { error: checkout.error });
      }

      return sendJson(res, 200, { url: checkout.url, id: checkout.id });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 2. Stripe Customer Portal Session Creation
  if (req.method === 'POST' && pathname === '/api/create-portal-session') {
    try {
      const authHeader = req.headers['authorization'] || '';
      if (!authHeader) {
        return sendJson(res, 401, { error: 'UNAUTHORIZED', message: 'Missing Authorization header' });
      }

      const rawToken = authHeader.replace(/^Bearer\s+/i, '').trim();

    // Direct Stripe Checkout Session instant activation (activates OBS before account registration)
    if (rawToken.startsWith('cs_')) {
      try {
        const entRes = await fetch(`${SUPABASE_URL}/rest/v1/prepaid_entitlements?stripe_session_id=eq.${encodeURIComponent(rawToken)}&select=*`, {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
        });
        if (entRes.ok) {
          const rows = await entRes.json();
          if (rows && rows.length > 0) {
            const ent = rows[0];
            return sendJson(res, 200, {
              ok: true,
              allowed: true,
              status: 'active',
              isPro: true,
              is_founding_member: Boolean(ent.is_founding),
              subscription_status: ent.tier || 'lifetime_founding',
              device_count: 1,
              max_devices: 2,
              user: { email: ent.email || 'Founding Broadcaster' },
            });
          }
        }

        // Webhook hasn't landed yet? Query Stripe API on demand
        const stripeRes = await retrieveCheckoutSession(rawToken);
        if (stripeRes.ok && stripeRes.session && stripeRes.session.payment_status === 'paid') {
          const s = stripeRes.session;
          const isLifetime = s.metadata?.tier === 'lifetime_founding' || s.mode === 'payment';
          const subStatus = isLifetime ? 'lifetime_founding' : 'pro';
          const customerEmail = s.customer_details?.email || s.customer_email || '';

          fetch(`${SUPABASE_URL}/rest/v1/prepaid_entitlements`, {
            method: 'POST',
            headers: {
              apikey: SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates',
            },
            body: JSON.stringify({
              email: customerEmail.toLowerCase(),
              tier: subStatus,
              is_founding: isLifetime,
              stripe_session_id: rawToken,
            }),
          }).catch(() => {});

          return sendJson(res, 200, {
            ok: true,
            allowed: true,
            status: 'active',
            isPro: true,
            is_founding_member: isLifetime,
            subscription_status: subStatus,
            device_count: 1,
            max_devices: 2,
            user: { email: customerEmail || 'Founding Broadcaster' },
          });
        }
      } catch (err) {
        console.warn('[auth/device-check] Error verifying prepaid Stripe session token:', err);
      }
    }

    const { user, error: authError } = await verifySession(authHeader);
      if (authError || !user) {
        return sendJson(res, 401, { error: 'UNAUTHORIZED', message: authError || 'Invalid session' });
      }

      const body = await parseJsonBody(req);
      const customerId = body.customerId;
      const returnUrl = body.returnUrl || 'https://simple-streamer.bdjlmn.com/account';

      const portal = await createCustomerPortalSession({
        customerId,
        returnUrl,
      });

      if (!portal.ok) {
        return sendJson(res, 400, { error: portal.error });
      }

      return sendJson(res, 200, { url: portal.url });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 3. Stripe Webhook Listener
  if (req.method === 'POST' && pathname === '/api/webhooks/stripe') {
    try {
      const sig = req.headers['stripe-signature'];
      const secret = process.env.STRIPE_WEBHOOK_SECRET;

      const rawBody = await readRawBody(req);

      if (secret && secret !== 'whsec_replace_with_your_webhook_secret') {
        const isValid = verifyStripeSignature(rawBody, sig, secret);
        if (!isValid) {
          console.error('[Stripe Webhook] Invalid signature rejected');
          return sendJson(res, 400, { error: 'Invalid webhook signature' });
        }
      } else {
        console.warn('[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured or in template state');
      }

      const event = JSON.parse(rawBody);
      console.log(`[Stripe Webhook] Received event: ${event.type}`);

      // Handle successful purchase / subscription start
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const userId = session.client_reference_id || session.metadata?.supabase_user_id;
        const customerEmail = session.customer_details?.email || session.customer_email;
        const isLifetime = session.metadata?.tier === 'lifetime_founding' || session.mode === 'payment';
        const subStatus = isLifetime ? 'lifetime_founding' : 'pro';

        const updateData = {
          subscription_status: subStatus,
          is_founding_member: isLifetime,
          updated_at: new Date().toISOString(),
        };

        if (customerEmail) {
          try {
            await fetch(`${SUPABASE_URL}/rest/v1/prepaid_entitlements`, {
              method: 'POST',
              headers: {
                apikey: SUPABASE_SERVICE_ROLE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates',
              },
              body: JSON.stringify({
                email: customerEmail.toLowerCase(),
                tier: subStatus,
                is_founding: isLifetime,
                stripe_session_id: session.id,
              }),
            });
            console.log(`[Stripe Webhook] Recorded prepaid entitlement for ${customerEmail} (tier=${subStatus})`);
          } catch (e) {
            console.error('[Stripe Webhook] Error recording prepaid entitlement:', e);
          }
        }

        if (userId) {
          console.log(`[Stripe Webhook] Granting ${subStatus} entitlement to user=${userId}`);
          await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
            method: 'PATCH',
            headers: {
              apikey: SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(updateData),
          });
        } else if (customerEmail) {
          console.log(`[Stripe Webhook] Granting ${subStatus} entitlement by email=${customerEmail}`);
          await fetch(`${SUPABASE_URL}/rest/v1/profiles?email=eq.${encodeURIComponent(customerEmail)}`, {
            method: 'PATCH',
            headers: {
              apikey: SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(updateData),
          });
        }
      }

      // Handle subscription cancellation or expiration
      if (event.type === 'customer.subscription.deleted') {
        const sub = event.data.object;
        const userId = sub.metadata?.supabase_user_id;

        if (userId) {
          console.log(`[Stripe Webhook] Revoking Pro entitlement for user=${userId}`);
          await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
            method: 'PATCH',
            headers: {
              apikey: SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              subscription_status: 'free',
              updated_at: new Date().toISOString(),
            }),
          });
        }
      }

      // Handle subscription status changes (e.g. past_due, unpaid, active)
      if (event.type === 'customer.subscription.updated') {
        const sub = event.data.object;
        const userId = sub.metadata?.supabase_user_id;
        const status = sub.status === 'active' || sub.status === 'trialing' ? 'pro' : 'free';

        if (userId) {
          console.log(`[Stripe Webhook] Updating subscription_status=${status} for user=${userId}`);
          await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
            method: 'PATCH',
            headers: {
              apikey: SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              subscription_status: status,
              updated_at: new Date().toISOString(),
            }),
          });
        }
      }

      return sendJson(res, 200, { received: true });
    } catch (err) {
      console.error('[Stripe Webhook] Error:', err.message);
      return sendJson(res, 500, { error: err.message });
    }
  }

  // Verify Facebook Page (Stateless verification without modifying disk)
  if (req.method === 'POST' && pathname === '/api/verify-facebook') {
    try {
      const { pageId, token } = await parseJsonBody(req);
      const result = await verifyFacebookPage(pageId, token);
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
  }

  // Validate single destination endpoint
  if (req.method === 'POST' && pathname === '/api/validate-destination') {
    try {
      const { destination } = await parseJsonBody(req);
      if (!destination || !destination.platform) {
        return sendJson(res, 400, { valid: false, error: 'Destination or platform missing' });
      }

      const target = { ...(destination.credentials || {}), ...destination };
      let result = { valid: false, error: 'Unsupported platform' };
      if (target.platform === 'youtube') {
        result = await validateYouTubeChannel(target);
      } else if (target.platform === 'facebook') {
        result = await validateFacebookPage(target);
      } else if (target.platform === 'twitch') {
        result = await validateTwitchChannel(target);
      } else if (target.platform === 'kick') {
        result = await validateKickChannel(target);
      } else if (target.platform === 'custom') {
        result = { valid: true, serverUrl: target.serverUrl, streamKey: target.streamKey, name: target.name || 'Custom RTMP' };
      }

      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 500, { valid: false, error: err.message });
    }
  }

  // Validate all destinations in parallel
  if (req.method === 'POST' && pathname === '/api/validate-all-destinations') {
    try {
      const { destinations } = await parseJsonBody(req);
      if (!Array.isArray(destinations)) {
        return sendJson(res, 400, { error: 'Destinations must be an array' });
      }

      const checks = destinations.map(async (raw) => {
        try {
          const target = { ...(raw.credentials || {}), ...raw };
          let resObj = { valid: false, error: 'Unsupported platform' };
          if (target.platform === 'youtube') resObj = await validateYouTubeChannel(target);
          else if (target.platform === 'facebook') resObj = await validateFacebookPage(target);
          else if (target.platform === 'twitch') resObj = await validateTwitchChannel(target);
          else if (target.platform === 'kick') resObj = await validateKickChannel(target);
          else if (target.platform === 'custom') resObj = { valid: true, serverUrl: target.serverUrl, streamKey: target.streamKey, name: target.name || 'Custom RTMP' };
          return { id: raw.id, platform: raw.platform, ...resObj };
        } catch (e) {
          return { id: raw.id, platform: raw.platform, valid: false, error: e.message };
        }
      });

      const results = await Promise.all(checks);
      return sendJson(res, 200, { results });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // Active Rig Presence Registration (Dock Heartbeat)
  if (req.method === 'POST' && pathname === '/api/presence') {
    let body;
    try {
      body = await parseJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    if (body.lanIp) {
      activePresence = {
        lanIp: body.lanIp,
        bridgePort: body.bridgePort || 45455,
        obsPort: body.obsPort || 4455,
        machineName: body.machineName || 'OBS Rig',
        updatedAt: Date.now(),
      };
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 400, { error: 'lanIp is required' });
  }

  // Active Rig Query
  if (req.method === 'GET' && pathname === '/api/presence') {
    const isRecent = activePresence && (Date.now() - activePresence.updatedAt < 90000);
    return sendJson(res, 200, {
      active: !!isRecent,
      presence: isRecent ? activePresence : null,
    });
  }

  // Smart Mobile Remote Dynamic Router:
  // If an active desktop rig has heartbeated recently, immediately redirect mobile browsers
  // to the local bridge HTTP endpoint (avoiding all mixed-content and stale IP issues).
  if (ENABLE_PRESENCE_REDIRECT && (req.method === 'GET' || req.method === 'HEAD') && (pathname === '/remote' || pathname === '/remote.html')) {
    const isRecent = activePresence && (Date.now() - activePresence.updatedAt < 90000);
    if (isRecent) {
      const redirectTarget = `http://${activePresence.lanIp}:${activePresence.bridgePort}/remote`;
      setCorsHeaders(res);
      res.writeHead(302, {
        Location: redirectTarget,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      return res.end();
    }
  }

  // Serve static OBS Browser Dock files
  if (req.method === 'GET' || req.method === 'HEAD') {
    const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    const targetFile = safePath === '/' ? 'index.html' : safePath.replace(/^\//, '');
    const fullPath = path.join(DOCK_DIR, targetFile);

    if (fullPath.startsWith(DOCK_DIR) && fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      const ext = path.extname(fullPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      setCorsHeaders(res);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      if (req.method === 'HEAD') {
        return res.end();
      }
      return fs.createReadStream(fullPath).pipe(res);
    }
  }

  // Check auth for mutating endpoints
  if (!isAuthorized(req)) {
    return sendJson(res, 401, { error: 'Unauthorized: Invalid or missing x-api-key header.' });
  }

  // Live stream orchestration endpoint (Stateless: receives credentials in request body)
  if (req.method === 'POST' && pathname === '/orchestrate-live') {
    let body;
    try {
      body = await parseJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    const rawTitle = (body.title || '').trim();
    const notes = (body.description || body.notes || '').trim();

    if (!rawTitle) {
      return sendJson(res, 400, {
        error: 'Title is required for the broadcast.',
      });
    }

    // Enforce Supabase Pro entitlement & hardware device limits for automated YouTube & Facebook sync
    let validatedUserId = null;
    if (isAutomatedOAuthRequested(body)) {
      const authHeader = req.headers['authorization'] || (body.token ? `Bearer ${body.token}` : '');
      const hwid = (req.headers['x-device-hwid'] || body.hwid || body.deviceHwid || '').trim();
      const deviceName = req.headers['x-device-name'] || body.deviceName || 'Simple Streamer Desktop';

      if (!authHeader) {
        return sendJson(res, 403, {
          error: 'PRO_REQUIRED',
          message: 'Automated YouTube & Facebook live sync requires Simple Streamer Pro. Switch to Stream Key mode or log in to a Pro account.',
        });
      }

      if (!hwid || hwid.length < 8 || hwid === 'default-hwid') {
        return sendJson(res, 403, {
          error: 'DEVICE_IDENTIFIER_REQUIRED',
          message: 'Valid hardware device identifier (min 8 characters) required for multi-platform broadcasting.',
        });
      }

      const rawToken = authHeader.replace(/^Bearer\s+/i, '').trim();

    // Direct Stripe Checkout Session instant activation (activates OBS before account registration)
    if (rawToken.startsWith('cs_')) {
      try {
        const entRes = await fetch(`${SUPABASE_URL}/rest/v1/prepaid_entitlements?stripe_session_id=eq.${encodeURIComponent(rawToken)}&select=*`, {
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
        });
        if (entRes.ok) {
          const rows = await entRes.json();
          if (rows && rows.length > 0) {
            const ent = rows[0];
            return sendJson(res, 200, {
              ok: true,
              allowed: true,
              status: 'active',
              isPro: true,
              is_founding_member: Boolean(ent.is_founding),
              subscription_status: ent.tier || 'lifetime_founding',
              device_count: 1,
              max_devices: 2,
              user: { email: ent.email || 'Founding Broadcaster' },
            });
          }
        }

        // Webhook hasn't landed yet? Query Stripe API on demand
        const stripeRes = await retrieveCheckoutSession(rawToken);
        if (stripeRes.ok && stripeRes.session && stripeRes.session.payment_status === 'paid') {
          const s = stripeRes.session;
          const isLifetime = s.metadata?.tier === 'lifetime_founding' || s.mode === 'payment';
          const subStatus = isLifetime ? 'lifetime_founding' : 'pro';
          const customerEmail = s.customer_details?.email || s.customer_email || '';

          fetch(`${SUPABASE_URL}/rest/v1/prepaid_entitlements`, {
            method: 'POST',
            headers: {
              apikey: SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates',
            },
            body: JSON.stringify({
              email: customerEmail.toLowerCase(),
              tier: subStatus,
              is_founding: isLifetime,
              stripe_session_id: rawToken,
            }),
          }).catch(() => {});

          return sendJson(res, 200, {
            ok: true,
            allowed: true,
            status: 'active',
            isPro: true,
            is_founding_member: isLifetime,
            subscription_status: subStatus,
            device_count: 1,
            max_devices: 2,
            user: { email: customerEmail || 'Founding Broadcaster' },
          });
        }
      } catch (err) {
        console.warn('[auth/device-check] Error verifying prepaid Stripe session token:', err);
      }
    }

    const { user, error: authError } = await verifySession(authHeader);
      if (authError || !user) {
        console.warn(`[Orchestrator] Session verification failed: ${authError || 'Unknown error'}`);
        return sendJson(res, 403, {
          error: 'PRO_REQUIRED',
          message: 'Automated YouTube & Facebook live sync requires Simple Streamer Pro. Switch to Stream Key mode or log in to a Pro account.',
        });
      }

      const entitlement = await checkDeviceAndEntitlement(user.id, hwid, deviceName);
      if (!entitlement.allowed) {
        if (entitlement.error === 'device_limit_reached') {
          return sendJson(res, 403, {
            error: 'DEVICE_LIMIT_REACHED',
            message: 'Device limit reached (max 2 active devices). Deactivate a machine at https://simple-streamer.bdjlmn.com/account',
            device_count: entitlement.device_count,
            max_devices: entitlement.max_devices,
          });
        }
        if (entitlement.error === 'invalid_hwid') {
          return sendJson(res, 403, {
            error: 'DEVICE_IDENTIFIER_REQUIRED',
            message: entitlement.message || 'Valid hardware device identifier required.',
          });
        }
        return sendJson(res, 403, {
          error: 'PRO_REQUIRED',
          message: 'Automated YouTube & Facebook live sync requires Simple Streamer Pro. Switch to Stream Key mode or log in to a Pro account.',
        });
      }

      if (!entitlement.isPro) {
        return sendJson(res, 403, {
          error: 'PRO_REQUIRED',
          message: 'Automated YouTube & Facebook live sync requires Simple Streamer Pro. Switch to Stream Key mode or log in to a Pro account.',
          subscription_status: entitlement.subscription_status,
        });
      }

      validatedUserId = user.id;
      console.log(`[Orchestrator] Pro authorized: user=${user.email || user.id} (${entitlement.subscription_status}) on device=${hwid || 'default'}`);
    }

    // Anti-Spam & Quota Protection: Max 5 broadcast creations per 5 minutes per user / IP
    const clientIp = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1').split(',')[0].trim();
    const rateLimitKey = validatedUserId ? `user:${validatedUserId}` : `ip:${clientIp}`;
    const rateCheck = checkRateLimit(rateLimitKey, 5, 5 * 60 * 1000);
    if (!rateCheck.allowed) {
      res.setHeader('Retry-After', String(rateCheck.retryAfter));
      return sendJson(res, 429, {
        error: 'RATE_LIMIT_EXCEEDED',
        message: `Broadcast creation limit reached (maximum 5 requests per 5 minutes). Please wait ${rateCheck.retryAfter}s before starting another stream.`,
        retryAfter: rateCheck.retryAfter,
      });
    }

    // Resolve title and description (strictly user input with zero boilerplate)
    const cleanTitle = rawTitle.replace(/[\r\n]+/g, ' ').trim();
    const finalTitle = cleanTitle;
    const finalDescription = notes;

    // Ephemeral thumbnail buffer extraction (never persisted to disk or session state)
    let thumbnailBuffer = null;
    let thumbnailMimeType = 'image/jpeg';
    const rawThumb = body.thumbnailBase64 || body.thumbnail;
    if (rawThumb && typeof rawThumb === 'string') {
      try {
        const matches = rawThumb.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          thumbnailMimeType = matches[1];
          thumbnailBuffer = Buffer.from(matches[2], 'base64');
        } else {
          thumbnailBuffer = Buffer.from(rawThumb, 'base64');
        }
        console.log(`[Orchestrator] Ephemeral thumbnail decoded (${thumbnailBuffer.length} bytes, ${thumbnailMimeType})`);
      } catch (err) {
        console.warn('[Orchestrator] Failed to parse thumbnailBase64:', err.message);
      }
    }

    console.log(`[Orchestrator] Starting broadcast: "${finalTitle}"`);

    // Multi-destination dynamic execution
    if (Array.isArray(body.destinations) && body.destinations.length > 0) {
      const activeDests = body.destinations.filter((d) => d.enabled !== false);
      const executionPromises = activeDests.map(async (rawD) => {
        const d = { ...(rawD.credentials || {}), ...rawD };
        try {
          if (d.platform === 'facebook') {
            if (!d.accessToken && d.streamKey) {
              return {
                id: d.id,
                platform: 'facebook',
                name: d.name,
                ok: true,
                serverUrl: d.serverUrl || 'rtmps://live-api-s.facebook.com:443/rtmp/',
                streamKey: d.streamKey,
              };
            }
            const fbTitle = finalTitle.slice(0, 255);
            const fbRes = await createFacebookLiveVideo({
              title: fbTitle,
              description: finalDescription,
              pageId: d.pageId,
              accessToken: d.accessToken,
            });

            // Dispatch ephemeral thumbnail if provided
            if (fbRes.liveVideoId && thumbnailBuffer) {
              setFacebookThumbnail({
                liveVideoId: fbRes.liveVideoId,
                imageBuffer: thumbnailBuffer,
                mimeType: thumbnailMimeType,
                accessToken: d.accessToken,
              }).then((tRes) => {
                if (tRes.ok) console.log(`[Orchestrator] Facebook custom thumbnail uploaded for ${fbRes.liveVideoId}`);
                else console.warn(`[Orchestrator] Facebook thumbnail warning: ${tRes.error}`);
              }).catch((e) => console.warn(`[Orchestrator] Facebook thumbnail error: ${e.message}`));
            }

            return {
              id: d.id,
              platform: 'facebook',
              name: d.name,
              ok: true,
              liveVideoId: fbRes.liveVideoId,
              serverUrl: fbRes.rtmpUrl,
              streamKey: fbRes.streamKey,
            };
          } else if (d.platform === 'youtube') {
            if (!d.refreshToken && d.streamKey) {
              return {
                id: d.id,
                platform: 'youtube',
                name: d.name,
                ok: true,
                serverUrl: d.serverUrl || d.ingestionAddress || 'rtmp://a.rtmp.youtube.com/live2',
                streamKey: d.streamKey,
              };
            }
            const ytTitle = finalTitle.slice(0, 100);
            const ytRes = await createYouTubeBroadcast({
              title: ytTitle,
              description: finalDescription,
              refreshToken: d.refreshToken,
              streamId: d.streamId,
              privacyStatus: d.privacyStatus || 'public',
            });

            // Dispatch ephemeral thumbnail if provided
            if (ytRes.broadcastId && thumbnailBuffer) {
              setYouTubeThumbnail({
                refreshToken: d.refreshToken,
                videoId: ytRes.broadcastId,
                imageBuffer: thumbnailBuffer,
                mimeType: thumbnailMimeType,
              }).then((tRes) => {
                if (tRes.ok) console.log(`[Orchestrator] YouTube custom thumbnail uploaded for ${ytRes.broadcastId}`);
                else if (tRes.skipped) console.warn(`[Orchestrator] YouTube thumbnail skipped (${tRes.reason}): ${tRes.error}`);
                else console.warn(`[Orchestrator] YouTube thumbnail warning: ${tRes.error}`);
              }).catch((e) => console.warn(`[Orchestrator] YouTube thumbnail error: ${e.message}`));
            }

            return {
              id: d.id,
              platform: 'youtube',
              name: d.name,
              ok: true,
              broadcastId: ytRes.broadcastId,
              watchUrl: ytRes.watchUrl,
              serverUrl: d.ingestionAddress || 'rtmp://a.rtmp.youtube.com/live2',
              streamKey: d.streamName,
            };
          } else if (d.platform === 'twitch') {
            let userToken = d.userToken;
            let refreshToken = d.refreshToken;
            const twTitle = finalTitle.slice(0, 140);
            if (d.userToken && d.broadcasterId) {
              const twRes = await updateTwitchChannelInfo({
                broadcasterId: d.broadcasterId,
                userToken: d.userToken,
                refreshToken: d.refreshToken,
                title: twTitle,
              });
              if (twRes && twRes.ok) {
                if (twRes.userToken) userToken = twRes.userToken;
                if (twRes.refreshToken) refreshToken = twRes.refreshToken;
                console.log(`[Orchestrator] Updated Twitch channel title to: "${twTitle}"`);
              } else {
                console.warn(`[Orchestrator] Twitch title update warning: ${twRes?.error || 'failed'}`);
              }
            }
            return {
              id: d.id,
              platform: 'twitch',
              name: d.name,
              ok: true,
              userToken,
              refreshToken,
              serverUrl: d.serverUrl || 'rtmp://live.twitch.tv/app/',
              streamKey: d.streamKey,
            };
          } else if (d.platform === 'kick') {
            let userToken = d.userToken;
            let refreshToken = d.refreshToken;
            const kickTitle = finalTitle.slice(0, 100);
            if (d.userToken) {
              const kickRes = await updateKickChannelInfo({
                userToken: d.userToken,
                refreshToken: d.refreshToken,
                title: kickTitle,
              });
              if (kickRes && kickRes.ok) {
                if (kickRes.userToken) userToken = kickRes.userToken;
                if (kickRes.refreshToken) refreshToken = kickRes.refreshToken;
                console.log(`[Orchestrator] Updated Kick channel title to: "${kickTitle}"`);
              } else {
                console.warn(`[Orchestrator] Kick title update warning: ${kickRes?.error || 'failed'}`);
              }
            }
            let kickServer = d.serverUrl || 'rtmps://fa723ac112e7.global-contribute.live-video.net:443/app/';
            if (kickServer && !kickServer.includes('/app')) {
              kickServer = kickServer.replace(/\/+$/, '') + ':443/app';
            }
            return {
              id: d.id,
              platform: 'kick',
              name: d.name,
              ok: true,
              userToken,
              refreshToken,
              serverUrl: kickServer,
              streamKey: d.streamKey,
            };
          } else if (d.platform === 'custom' || d.platform === 'rtmp' || d.streamKey) {
            return {
              id: d.id,
              platform: d.platform,
              name: d.name,
              ok: true,
              serverUrl: d.serverUrl || '',
              streamKey: d.streamKey,
            };
          }
          return { id: d.id, platform: d.platform, ok: false, error: 'Unknown platform' };
        } catch (err) {
          return { id: d.id, platform: d.platform, name: d.name, ok: false, error: err.message };
        }
      });

      const results = await Promise.all(executionPromises);
      const successful = results.filter((r) => r.ok);
      const status = successful.length === results.length ? 'SUCCESS' : (successful.length > 0 ? 'PARTIAL_SUCCESS' : 'FAILURE');

      console.log(`[Orchestrator] Multi-dest results (${status}):`, results.map((r) => `${r.platform}(${r.ok ? 'OK' : 'ERR: ' + r.error})`).join(', '));

      return sendJson(res, status === 'FAILURE' ? 502 : 200, {
        status,
        title: finalTitle,
        destinations: results,
      });
    }

    const ytConfig = body.youtube;
    const fbConfig = body.facebook;

    const executions = [];

    // YouTube Broadcast creation if configured
    if (ytConfig?.refreshToken && ytConfig?.streamId) {
      executions.push(
        createYouTubeBroadcast({
          title: finalTitle.slice(0, 100),
          description: finalDescription,
          refreshToken: ytConfig.refreshToken,
          streamId: ytConfig.streamId,
          privacyStatus: ytConfig.privacyStatus || 'public',
        }).then((res) => ({ type: 'youtube', ...res }))
      );
    } else if (ytConfig?.streamKey) {
      executions.push(
        Promise.resolve({
          type: 'youtube',
          ok: true,
          serverUrl: ytConfig.serverUrl || 'rtmp://a.rtmp.youtube.com/live2',
          streamKey: ytConfig.streamKey,
        })
      );
    } else {
      executions.push(Promise.resolve({ type: 'youtube', skipped: true }));
    }

    // Facebook Live creation if configured
    if (fbConfig?.pageId && fbConfig?.accessToken) {
      executions.push(
        createFacebookLiveVideo({
          title: finalTitle.slice(0, 255),
          description: finalDescription,
          pageId: fbConfig.pageId,
          accessToken: fbConfig.accessToken,
        }).then((res) => ({ type: 'facebook', ...res }))
      );
    } else if (fbConfig?.streamKey) {
      executions.push(
        Promise.resolve({
          type: 'facebook',
          ok: true,
          serverUrl: fbConfig.serverUrl || 'rtmps://live-api-s.facebook.com:443/rtmp/',
          streamKey: fbConfig.streamKey,
        })
      );
    } else {
      executions.push(Promise.resolve({ type: 'facebook', skipped: true }));
    }

    const results = await Promise.allSettled(executions);
    const ytResult = results[0];
    const fbResult = results[1];

    let youtubeResponse = { ok: false, broadcastId: null, watchUrl: null, error: 'YouTube not configured' };
    if (ytResult.status === 'fulfilled') {
      if (ytResult.value.skipped) {
        youtubeResponse = { ok: false, skipped: true, broadcastId: null, watchUrl: null, error: 'Not configured' };
      } else {
        youtubeResponse = { ok: true, broadcastId: ytResult.value.broadcastId, watchUrl: ytResult.value.watchUrl, error: null };
      }
    } else {
      youtubeResponse = { ok: false, broadcastId: null, watchUrl: null, error: ytResult.reason?.message || 'YouTube error' };
    }

    let facebookResponse = { ok: false, liveVideoId: null, rtmpUrl: null, streamKey: null, error: 'Facebook not configured' };
    if (fbResult.status === 'fulfilled') {
      if (fbResult.value.skipped) {
        facebookResponse = { ok: false, skipped: true, liveVideoId: null, rtmpUrl: null, streamKey: null, error: 'Not configured' };
      } else {
        facebookResponse = {
          ok: true,
          liveVideoId: fbResult.value.liveVideoId,
          rtmpUrl: fbResult.value.rtmpUrl,
          streamKey: fbResult.value.streamKey,
          error: null,
        };
      }
    } else {
      facebookResponse = { ok: false, liveVideoId: null, rtmpUrl: null, streamKey: null, error: fbResult.reason?.message || 'Facebook error' };
    }

    // Determine overall status
    let status = 'FAILURE';
    if (youtubeResponse.ok && facebookResponse.ok) {
      status = 'SUCCESS';
    } else if (youtubeResponse.ok || facebookResponse.ok) {
      status = 'PARTIAL_SUCCESS';
    }

    console.log(`[Orchestrator] Result: ${status} (YT: ${youtubeResponse.ok}, FB: ${facebookResponse.ok})`);

    const statusCode = status === 'FAILURE' ? 502 : 200;
    return sendJson(res, statusCode, {
      status,
      title: finalTitle,
      youtube: youtubeResponse,
      facebook: facebookResponse,
    });
  }

  // Teardown live stream endpoint
  if (req.method === 'POST' && pathname === '/end-live') {
    let body;
    try {
      body = await parseJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    const { destinations, liveVideoId, broadcastId, fbToken, ytRefreshToken } = body;
    console.log('[Orchestrator] Teardown requested.');

    const teardowns = [];
    if (Array.isArray(destinations)) {
      for (const rawD of destinations) {
        const d = { ...(rawD.credentials || {}), ...rawD };
        if (d.platform === 'facebook' && d.liveVideoId) {
          teardowns.push(endFacebookLiveVideo(d.liveVideoId, d.accessToken || fbToken));
        } else if (d.platform === 'youtube' && d.broadcastId) {
          teardowns.push(endYouTubeBroadcast(d.broadcastId, d.refreshToken || ytRefreshToken));
        }
      }
    } else {
      if (liveVideoId) teardowns.push(endFacebookLiveVideo(liveVideoId, fbToken));
      if (broadcastId) teardowns.push(endYouTubeBroadcast(broadcastId, ytRefreshToken));
    }

    const results = await Promise.allSettled(teardowns);
    return sendJson(res, 200, { ok: true, results });
  }

  // Real-time broadcast status endpoint
  if (req.method === 'POST' && pathname === '/broadcast-status') {
    let body;
    try {
      body = await parseJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    const { destinations, liveVideoId, broadcastId, fbToken, ytRefreshToken } = body;

    if (Array.isArray(destinations)) {
      const statusChecks = destinations.map(async (d) => {
        try {
          if (d.platform === 'facebook' && d.liveVideoId) {
            const fb = await getFacebookLiveStatus(d.liveVideoId, d.accessToken || fbToken);
            return { id: d.id, ...fb };
          } else if (d.platform === 'youtube' && d.broadcastId) {
            const yt = await getYouTubeBroadcastStatus(d.broadcastId, d.refreshToken || ytRefreshToken);
            return { id: d.id, ...yt };
          }
          return { id: d.id, isLive: true, status: 'STREAMING' };
        } catch (e) {
          return { id: d.id, isLive: false, status: 'ERROR', error: e.message };
        }
      });
      const results = await Promise.all(statusChecks);
      return sendJson(res, 200, { results });
    }

    const [fbStatus, ytStatus] = await Promise.allSettled([
      liveVideoId ? getFacebookLiveStatus(liveVideoId, fbToken) : Promise.resolve({ isLive: false, status: 'OFFLINE' }),
      broadcastId ? getYouTubeBroadcastStatus(broadcastId, ytRefreshToken) : Promise.resolve({ isLive: false, status: 'OFFLINE' }),
    ]);

    return sendJson(res, 200, {
      facebook: fbStatus.status === 'fulfilled' ? fbStatus.value : { isLive: false, status: 'ERROR', error: fbStatus.reason?.message },
      youtube: ytStatus.status === 'fulfilled' ? ytStatus.value : { isLive: false, status: 'ERROR', error: ytStatus.reason?.message },
    });
  }

  // Delayed metadata reconciliation watchdog endpoint (verifies & patches active stream titles)
  if (req.method === 'POST' && pathname === '/reconcile-metadata') {
    let body;
    try {
      body = await parseJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    const { title, description, destinations } = body;
    if (!title || !Array.isArray(destinations)) {
      return sendJson(res, 400, { error: 'Missing title or destinations array.' });
    }

    // Mid-stream title and description updates require an active Pro license
    const authHeader = req.headers['authorization'] || (body.token ? `Bearer ${body.token}` : '');
    if (!authHeader) {
      return sendJson(res, 403, {
        error: 'PRO_REQUIRED',
        message: 'Mid-stream title updates require Simple Streamer Pro.',
      });
    }

    const { user, error: authError } = await verifySession(authHeader);
    if (authError || !user) {
      return sendJson(res, 403, {
        error: 'PRO_REQUIRED',
        message: 'Mid-stream title updates require Simple Streamer Pro.',
      });
    }

    const hwid = (req.headers['x-device-hwid'] || body.hwid || '').trim();
    const entitlement = await checkDeviceAndEntitlement(user.id, hwid);
    if (!entitlement.isPro) {
      return sendJson(res, 403, {
        error: 'PRO_REQUIRED',
        message: 'Mid-stream title updates require Simple Streamer Pro.',
      });
    }

    console.log(`[Watchdog] Reconciling metadata for "${title}" across ${destinations.length} destination(s)...`);

    const reconciliationPromises = destinations.map(async (rawD) => {
      const d = { ...(rawD.credentials || {}), ...rawD };
      try {
        if (d.platform === 'youtube' && d.broadcastId) {
          const res = await reconcileYouTubeMetadata({
            broadcastId: d.broadcastId,
            title,
            description,
            refreshToken: d.refreshToken,
          });
          return { id: d.id, platform: 'youtube', ...res };
        } else if (d.platform === 'facebook' && d.liveVideoId) {
          const res = await reconcileFacebookMetadata({
            liveVideoId: d.liveVideoId,
            title,
            description,
            accessToken: d.accessToken,
          });
          return { id: d.id, platform: 'facebook', ...res };
        } else if (d.platform === 'twitch' && d.broadcasterId && d.userToken) {
          const res = await updateTwitchChannelInfo({
            broadcasterId: d.broadcasterId,
            userToken: d.userToken,
            title,
          });
          return { id: d.id, platform: 'twitch', ...res };
        } else if (d.platform === 'kick' && d.userToken) {
          const res = await updateKickChannelInfo({
            userToken: d.userToken,
            title,
          });
          return { id: d.id, platform: 'kick', ...res };
        }
        return { id: d.id, platform: d.platform, ok: true, skipped: true };
      } catch (err) {
        return { id: d.id, platform: d.platform, ok: false, error: err.message };
      }
    });

    const results = await Promise.all(reconciliationPromises);
    return sendJson(res, 200, { ok: true, results });
  }

  // Standalone thumbnail upload endpoint for active live sessions
  if (req.method === 'POST' && pathname === '/set-thumbnail') {
    let body;
    try {
      body = await parseJsonBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    const { thumbnailBase64, destinations } = body;
    if (!thumbnailBase64 || !Array.isArray(destinations) || destinations.length === 0) {
      return sendJson(res, 400, { error: 'Missing thumbnailBase64 or destinations array.' });
    }

    let thumbnailBuffer = null;
    let thumbnailMimeType = 'image/jpeg';
    try {
      const matches = thumbnailBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        thumbnailMimeType = matches[1];
        thumbnailBuffer = Buffer.from(matches[2], 'base64');
      } else {
        thumbnailBuffer = Buffer.from(thumbnailBase64, 'base64');
      }
    } catch (err) {
      return sendJson(res, 400, { error: `Invalid thumbnail base64 data: ${err.message}` });
    }

    console.log(`[Thumbnail] Setting custom thumbnail across ${destinations.length} destination(s)...`);

    const thumbPromises = destinations.map(async (rawD) => {
      const d = { ...(rawD.credentials || {}), ...rawD };
      try {
        if (d.platform === 'youtube' && (d.broadcastId || d.videoId)) {
          const res = await setYouTubeThumbnail({
            videoId: d.broadcastId || d.videoId,
            refreshToken: d.refreshToken,
            imageBuffer: thumbnailBuffer,
            mimeType: thumbnailMimeType,
          });
          return { id: d.id, platform: 'youtube', ...res };
        } else if (d.platform === 'facebook' && (d.liveVideoId || d.videoId)) {
          const res = await setFacebookThumbnail({
            liveVideoId: d.liveVideoId || d.videoId,
            imageBuffer: thumbnailBuffer,
            mimeType: thumbnailMimeType,
            accessToken: d.accessToken,
          });
          return { id: d.id, platform: 'facebook', ...res };
        }
        return { id: d.id, platform: d.platform, ok: true, skipped: true, reason: 'unsupported_or_dynamic' };
      } catch (err) {
        return { id: d.id, platform: d.platform, ok: false, error: err.message };
      }
    });

    const results = await Promise.all(thumbPromises);
    return sendJson(res, 200, { ok: true, results });
  }


  // 404 for unknown endpoints
  return sendJson(res, 404, { error: `Endpoint not found: ${req.method} ${pathname}` });
}

// Start HTTP server if run directly (Cloud Run / Local)
const isMain = process.argv[1] && (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('src/index.mjs'));

let server = null;
if (isMain) {
  server = http.createServer(handleRequest);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Mosque Orchestrator Backend] Running on http://0.0.0.0:${PORT}`);
  });
}

export { server };
