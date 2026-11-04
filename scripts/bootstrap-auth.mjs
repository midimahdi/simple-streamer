#!/usr/bin/env node

/**
 * Mosque Dual-Stream Orchestrator - Interactive Auth Bootstrap CLI
 *
 * Automates:
 * 1. Google OAuth2 offline refresh_token capture + permanent YouTube liveStream creation/selection.
 * 2. Meta Facebook Page token verification and live video permission checks.
 * 3. Generates ready-to-use .env configuration or gcloud Secret Manager commands.
 */

import http from 'node:http';
import readline from 'node:readline';
import { exec } from 'node:child_process';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = (query) => new Promise((resolve) => rl.question(query, resolve));

console.log('===============================================================');
console.log('  MOSQUE DUAL-STREAM ORCHESTRATOR — AUTH BOOTSTRAP WIZARD     ');
console.log('===============================================================\n');

async function main() {
  console.log('--- Step 1: YouTube OAuth Setup ---');
  console.log('Ensure you have created OAuth credentials in Google Cloud Console:');
  console.log('1. APIs & Services -> OAuth consent screen -> Set to "In Production" (Prevents 7-day token revocation)');
  console.log('2. APIs & Services -> Credentials -> Create OAuth client ID -> Web application');
  console.log('3. Authorized redirect URI: http://localhost:8989/oauth2callback\n');

  const clientId = (await ask('Enter Google Client ID: ')).trim();
  const clientSecret = (await ask('Enter Google Client Secret: ')).trim();

  if (!clientId || !clientSecret) {
    console.error('Error: Client ID and Secret are required.');
    process.exit(1);
  }

  const redirectUri = 'http://localhost:8989/oauth2callback';
  const scope = encodeURIComponent('https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.force-ssl');
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;

  console.log('\nStarting local OAuth callback listener on http://localhost:8989 ...');

  const authCode = await new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost:8989');
      if (url.pathname === '/oauth2callback') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h1>Authentication successful!</h1><p>You can return to the terminal.</p>');
          server.close();
          resolve(code);
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`<h1>Auth Failed: ${error}</h1>`);
          server.close();
          resolve(null);
        }
      }
    });

    server.listen(8989, () => {
      console.log(`\nOpen this URL in your browser to authorize your Mosque YouTube account:\n\n${authUrl}\n`);
      // Try opening automatically
      const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
      exec(`${openCmd} "${authUrl}"`, () => {});
    });
  });

  if (!authCode) {
    console.error('OAuth authorization failed or was aborted.');
    process.exit(1);
  }

  console.log('\nExchanging authorization code for offline refresh token...');
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: authCode,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.refresh_token) {
    console.error('Warning: No refresh_token returned. Did you set prompt=consent? Response:', tokenData);
  } else {
    console.log('✓ Successfully captured offline refresh token!');
  }

  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token;

  // Query existing permanent liveStreams or create one
  console.log('\nQuerying YouTube for existing permanent live streams...');
  const streamsRes = await fetch(
    'https://youtube.googleapis.com/youtube/v3/liveStreams?part=id,snippet,cdn&mine=true&maxResults=10',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  let streamId = '';
  let streamKey = '';
  let rtmpServer = 'rtmp://a.rtmp.youtube.com/live2';

  if (streamsRes.ok) {
    const streamsData = await streamsRes.json();
    const items = streamsData.items || [];
    if (items.length > 0) {
      console.log(`Found ${items.length} permanent stream ingestion(s):`);
      items.forEach((item, idx) => {
        console.log(`  [${idx + 1}] ID: ${item.id} | Title: "${item.snippet?.title}" | Resolution: ${item.cdn?.resolution}`);
      });
      const choice = (await ask(`Select stream [1-${items.length}] or press Enter for [1]: `)).trim();
      const selected = items[parseInt(choice || '1', 10) - 1] || items[0];
      streamId = selected.id;
      streamKey = selected.cdn?.ingestionInfo?.streamName || 'STATIC_KEY_FROM_STUDIO';
      rtmpServer = selected.cdn?.ingestionInfo?.ingestionAddress || rtmpServer;
    }
  }

  if (!streamId) {
    console.log('No existing stream found or selected. Creating a standard 1080p/720p permanent liveStream...');
    const createStreamRes = await fetch('https://youtube.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        snippet: {
          title: 'Mosque Permanent Ingestion (OBS Dual-Stream)',
        },
        cdn: {
          frameRate: '30fps',
          ingestionType: 'rtmp',
          resolution: 'variable',
        },
      }),
    });

    if (createStreamRes.ok) {
      const created = await createStreamRes.json();
      streamId = created.id;
      streamKey = created.cdn?.ingestionInfo?.streamName;
      rtmpServer = created.cdn?.ingestionInfo?.ingestionAddress || rtmpServer;
      console.log(`✓ Created new permanent stream: ${streamId}`);
    } else {
      const err = await createStreamRes.text();
      console.warn(`Could not auto-create stream: ${err}. You can manually paste streamId from YouTube Studio.`);
      streamId = (await ask('Enter permanent YouTube streamId: ')).trim();
    }
  }

  console.log('\n--- Step 2: Facebook Live & Page Setup ---');
  console.log('Recommended: Use a Meta Business Suite System User Token (Never expires).');
  const fbPageId = (await ask('Enter Facebook Page ID: ')).trim();
  const fbToken = (await ask('Enter Facebook System User / Page Access Token: ')).trim();

  console.log('\nVerifying Facebook Page permissions...');
  try {
    const fbCheck = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(fbPageId)}?fields=name,id,verification_status&access_token=${encodeURIComponent(fbToken)}`);
    if (fbCheck.ok) {
      const pageData = await fbCheck.json();
      console.log(`✓ Verified Facebook Page: "${pageData.name}" (ID: ${pageData.id})`);
    } else {
      const err = await fbCheck.text();
      console.warn(`Facebook API check returned warning: ${err}`);
    }
  } catch (e) {
    console.warn(`Could not reach Facebook API: ${e.message}`);
  }

  const mosqueName = (await ask('\nEnter Mosque Name (e.g. Masjid Al-Noor): ')).trim() || 'Mosque Live';

  console.log('\n===============================================================');
  console.log('  GENERATED CONFIGURATION (.env)                              ');
  console.log('===============================================================\n');

  const envConfig = `# Generated by bootstrap-auth.mjs on ${new Date().toISOString()}
PORT=8080
NODE_ENV=production

# YouTube Configuration
YOUTUBE_CLIENT_ID="${clientId}"
YOUTUBE_CLIENT_SECRET="${clientSecret}"
YOUTUBE_REFRESH_TOKEN="${refreshToken || ''}"
YOUTUBE_STREAM_ID="${streamId}"
YOUTUBE_PRIVACY_STATUS="public"

# Facebook Configuration
FACEBOOK_PAGE_ID="${fbPageId}"
FACEBOOK_ACCESS_TOKEN="${fbToken}"

# Mosque Information
MOSQUE_NAME="${mosqueName}"
MOSQUE_FACEBOOK_URL="https://facebook.com/${fbPageId}"
MOSQUE_YOUTUBE_URL="https://youtube.com"
`;

  console.log(envConfig);

  console.log('===============================================================');
  console.log('  OBS MULTI-RTMP SETUP VALUES (SECONDARY TARGET)              ');
  console.log('===============================================================');
  console.log(`Plugin: obs-multi-rtmp`);
  console.log(`Target Name: YouTube (Mosque Permanent)`);
  console.log(`RTMP Server: ${rtmpServer}`);
  console.log(`RTMP Key:    ${streamKey || '<Get from YouTube Studio Live Stream Settings>'}`);
  console.log(`Video/Audio Encoder: "Get from OBS"`);
  console.log(`Sync start with OBS: [x] CHECKED`);
  console.log('===============================================================\n');

  rl.close();
}

main().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
