import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENV_PATH = path.resolve(__dirname, '../.env');

/**
 * Loads current configuration from .env or process.env
 */
export function loadConfig() {
  const config = {
    YOUTUBE_CLIENT_ID: process.env.YOUTUBE_CLIENT_ID || '',
    YOUTUBE_CLIENT_SECRET: process.env.YOUTUBE_CLIENT_SECRET || '',
    YOUTUBE_REFRESH_TOKEN: process.env.YOUTUBE_REFRESH_TOKEN || '',
    YOUTUBE_STREAM_ID: process.env.YOUTUBE_STREAM_ID || '',
    YOUTUBE_PRIVACY_STATUS: process.env.YOUTUBE_PRIVACY_STATUS || 'public',
    FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID || '',
    FACEBOOK_PAGE_ID: process.env.FACEBOOK_PAGE_ID || '',
    FACEBOOK_ACCESS_TOKEN: process.env.FACEBOOK_ACCESS_TOKEN || '',
    MOSQUE_NAME: process.env.MOSQUE_NAME || '',
    MOSQUE_FACEBOOK_URL: process.env.MOSQUE_FACEBOOK_URL || '',
    MOSQUE_YOUTUBE_URL: process.env.MOSQUE_YOUTUBE_URL || '',
    MOSQUE_DONATION_URL: process.env.MOSQUE_DONATION_URL || '',
  };

  if (fs.existsSync(ENV_PATH)) {
    try {
      const content = fs.readFileSync(ENV_PATH, 'utf-8');
      content.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          config[key] = val;
          process.env[key] = val; // Sync in-memory environment
        }
      });
    } catch (_) {}
  }

  return config;
}

/**
 * Updates or creates the .env file with new key-value pairs
 */
export function saveConfig(updates) {
  const current = loadConfig();
  const merged = { ...current, ...updates };

  // Sync process.env in-memory immediately
  Object.entries(merged).forEach(([k, v]) => {
    if (v !== undefined) process.env[k] = String(v);
  });

  const lines = [
    '# Simple Streamer Configuration',
    `# Updated: ${new Date().toISOString()}`,
    '',
    'PORT=8080',
    'NODE_ENV=production',
    '',
    '# YouTube Configuration',
    `YOUTUBE_CLIENT_ID="${merged.YOUTUBE_CLIENT_ID || ''}"`,
    `YOUTUBE_CLIENT_SECRET="${merged.YOUTUBE_CLIENT_SECRET || ''}"`,
    `YOUTUBE_REFRESH_TOKEN="${merged.YOUTUBE_REFRESH_TOKEN || ''}"`,
    `YOUTUBE_STREAM_ID="${merged.YOUTUBE_STREAM_ID || ''}"`,
    `YOUTUBE_PRIVACY_STATUS="${merged.YOUTUBE_PRIVACY_STATUS || 'public'}"`,
    '',
    '# Facebook Configuration',
    `FACEBOOK_PAGE_ID="${merged.FACEBOOK_PAGE_ID || ''}"`,
    `FACEBOOK_ACCESS_TOKEN="${merged.FACEBOOK_ACCESS_TOKEN || ''}"`,
    '',
    '# Mosque Information',
    `MOSQUE_NAME="${merged.MOSQUE_NAME || ''}"`,
    `MOSQUE_FACEBOOK_URL="${merged.MOSQUE_FACEBOOK_URL || ''}"`,
    `MOSQUE_YOUTUBE_URL="${merged.MOSQUE_YOUTUBE_URL || ''}"`,
    `MOSQUE_DONATION_URL="${merged.MOSQUE_DONATION_URL || ''}"`,
    '',
  ];

  fs.writeFileSync(ENV_PATH, lines.join('\n'), 'utf-8');
  return merged;
}

/**
 * Exchange OAuth authorization code for YouTube refresh token and list streams
 */
export async function handleYouTubeOAuthCode(code, redirectUri) {
  const config = loadConfig();
  const clientId = config.YOUTUBE_CLIENT_ID;
  const clientSecret = config.YOUTUBE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Google Client ID and Client Secret must be saved before connecting.');
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

  if (refreshToken) {
    saveConfig({ YOUTUBE_REFRESH_TOKEN: refreshToken });
  }

  // Fetch YouTube streams for this channel
  const streams = await fetchYouTubeStreams(accessToken);
  return { streams, refreshTokenSaved: Boolean(refreshToken) };
}

/**
 * Query YouTube for existing liveStreams
 */
export async function fetchYouTubeStreams(accessToken) {
  const res = await fetch(
    'https://youtube.googleapis.com/youtube/v3/liveStreams?part=id,snippet,cdn&mine=true&maxResults=10',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.warn('Could not fetch YouTube streams:', errText);
    return [];
  }

  const data = await res.json();
  return (data.items || []).map((item) => ({
    id: item.id,
    title: item.snippet?.title || 'Default Stream',
    resolution: item.cdn?.resolution || '1080p',
    streamKey: item.cdn?.ingestionInfo?.streamName || '',
    rtmpServer: item.cdn?.ingestionInfo?.ingestionAddress || 'rtmp://a.rtmp.youtube.com/live2',
  }));
}

/**
 * Verify Facebook Page ID and Token
 */
export async function verifyFacebookPage(pageId, token) {
  if (!pageId || !token) {
    throw new Error('Page ID and Access Token are required.');
  }

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(pageId)}?fields=name,id,verification_status&access_token=${encodeURIComponent(token)}`
  );

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const msg = errData?.error?.message || `HTTP ${res.status}`;
    throw new Error(`Facebook verification failed: ${msg}`);
  }

  const data = await res.json();
  return { ok: true, name: data.name, id: data.id };
}
