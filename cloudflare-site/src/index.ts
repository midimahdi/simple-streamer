const CLOUD_RUN_ORIGIN = 'https://mosque-stream-orchestrator-259167398353.europe-west1.run.app';

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname.toLowerCase().replace(/\/+$/, '');

    const headers = {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    };

    if (pathname === '/privacy' || pathname === '/privacy-policy') {
      return new Response(privacyPolicyHtml(), { headers });
    }

    if (pathname === '/terms' || pathname === '/terms-of-service') {
      return new Response(termsHtml(), { headers });
    }

    if (pathname === '/data-deletion' || pathname === '/data-deletion-instructions' || pathname === '/deletion') {
      return new Response(dataDeletionHtml(), { headers });
    }

    if (pathname === '/about') {
      return new Response(homeHtml(), { headers });
    }

    // Proxy everything else to Cloud Run backend (OBS Dock, Setup Wizard, API endpoints)
    const targetUrl = new URL(url.pathname + url.search, CLOUD_RUN_ORIGIN);
    const proxyHeaders = new Headers(request.headers);
    proxyHeaders.set('host', new URL(CLOUD_RUN_ORIGIN).host);
    proxyHeaders.set('x-forwarded-host', url.host);
    proxyHeaders.set('x-forwarded-proto', 'https');

    const proxyInit: RequestInit & { cf?: any } = {
      method: request.method,
      headers: proxyHeaders,
      redirect: 'manual',
      cf: { cacheTtl: 0, cacheEverything: false },
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      proxyInit.body = request.body;
    }

    const upstreamResponse = await fetch(targetUrl.toString(), proxyInit);
    const respHeaders = new Headers(upstreamResponse.headers);

    // Ensure API, auth, and dock routes are NEVER cached by Cloudflare edge or client browsers
    if (
      pathname.startsWith('/api') ||
      pathname.startsWith('/auth') ||
      pathname === '' ||
      pathname === '/' ||
      pathname === '/broadcast-status' ||
      pathname === '/end-live' ||
      pathname === '/orchestrate-live'
    ) {
      respHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      respHeaders.set('Pragma', 'no-cache');
      respHeaders.set('Expires', '0');
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: respHeaders,
    });
  },
};

function layout(title: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Simple Streamer</title>
  <style>
    :root {
      --bg: #090a0f;
      --card-bg: #12141c;
      --text: #f0f2f5;
      --muted: #9aa0a6;
      --accent: #3b82f6;
      --border: #232734;
      --green: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body { background-color: var(--bg); color: var(--text); line-height: 1.6; padding: 0 20px; }
    .container { max-width: 860px; margin: 0 auto; padding: 60px 0 100px; }
    header { border-bottom: 1px solid var(--border); padding-bottom: 24px; margin-bottom: 48px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px; }
    .logo { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; color: #fff; text-decoration: none; display: flex; align-items: center; gap: 8px; }
    .logo span { background: var(--accent); color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
    nav { display: flex; gap: 20px; flex-wrap: wrap; }
    nav a { color: var(--muted); text-decoration: none; font-size: 14px; font-weight: 600; }
    nav a:hover { color: #fff; }
    h1 { font-size: 38px; font-weight: 800; letter-spacing: -1px; margin-bottom: 16px; color: #fff; line-height: 1.2; }
    h2 { font-size: 22px; font-weight: 700; margin: 32px 0 12px; color: #fff; }
    h3 { font-size: 18px; font-weight: 600; margin: 20px 0 8px; color: #93c5fd; }
    p { margin-bottom: 16px; color: #d1d5db; font-size: 16px; }
    ul, ol { margin: 16px 0 24px 24px; color: #d1d5db; }
    li { margin-bottom: 8px; }
    .card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 32px; margin-bottom: 32px; }
    .card-highlight { border-left: 4px solid var(--accent); }
    .badge { display: inline-block; background: #1e293b; color: #93c5fd; border: 1px solid #3b82f6; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 700; margin-bottom: 16px; }
    footer { border-top: 1px solid var(--border); padding-top: 32px; margin-top: 60px; font-size: 14px; color: var(--muted); display: flex; justify-content: space-between; flex-wrap: wrap; gap: 16px; }
    footer a { color: var(--muted); text-decoration: none; }
    footer a:hover { color: #fff; }
    code { background: #1e222f; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 14px; color: #93c5fd; }
    
    .instruction-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px 28px;
      margin-bottom: 24px;
    }
    .instruction-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 18px;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--border);
    }
    .instruction-header h3 {
      font-size: 18px;
      font-weight: 700;
      color: #fff;
      margin: 0;
    }
    .platform-tag {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 3px 8px;
      border-radius: 4px;
      display: inline-block;
    }
    .tag-facebook { background: #1877f2; color: #fff; }
    .tag-youtube { background: #ef4444; color: #fff; }
    .tag-twitch { background: #9146ff; color: #fff; }
    .tag-kick { background: #53fc18; color: #000; font-weight: 800; }
    .tag-obs { background: #3b82f6; color: #fff; }

    ol.step-list {
      list-style: decimal outside;
      margin: 0 0 0 0;
      padding-left: 22px;
    }
    ol.step-list li {
      margin-bottom: 12px;
      padding-left: 8px;
      color: #d1d5db;
      font-size: 15px;
      line-height: 1.6;
    }
    ol.step-list li:last-child {
      margin-bottom: 0;
    }
    ol.step-list li strong {
      color: #fff;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <a href="/" class="logo">Simple Streamer <span>APPLIANCE</span></a>
      <nav>
        <a href="/">Home</a>
        <a href="/privacy">Privacy Policy</a>
        <a href="/terms">Terms of Service</a>
        <a href="/data-deletion">Data Deletion</a>
      </nav>
    </header>
    <main>
      ${bodyContent}
    </main>
    <footer>
      <div>© ${new Date().getFullYear()} MAHDI DIGITAL LLC. Simple Streamer — Open-source community broadcasting.</div>
      <div>
        <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/data-deletion">Data Deletion</a> · Contact: <a href="mailto:Midimahdi6@gmail.com">Midimahdi6@gmail.com</a>
      </div>
    </footer>
  </div>
</body>
</html>`;
}

function homeHtml(): string {
  return layout(
    'Zero-Friction Live Stream Orchestration',
    `<div class="badge">BROADCAST AUTOMATION</div>
    <h1>Simple Streamer</h1>
    <p style="font-size: 19px; color: #9ca3af; margin-bottom: 32px;">
      A zero-friction, one-click multi-destination live streaming appliance embedded natively in OBS Studio. Built for non-technical community volunteers and creators to broadcast simultaneously to <strong>YouTube</strong>, <strong>Facebook Live</strong>, <strong>Twitch</strong>, and <strong>Kick</strong> with 0% extra CPU re-encoding overhead.
    </p>

    <div class="card">
      <h2>Why Simple Streamer Exists</h2>
      <p>
        Broadcasting community lectures, Friday sermons, and events to multiple platforms traditionally requires manual copy-pasting of dynamic stream keys, navigating multiple web dashboards, or paying monthly fees for cloud restreaming services.
      </p>
      <p>
        <strong>Simple Streamer eliminates all of this.</strong> Volunteers enter a broadcast title once in OBS and click <code>▶ GO LIVE</code>. Our native C plugin hooks directly into OBS's active video/audio encoder to push simultaneous streams with zero duplicate CPU usage.
      </p>
    </div>

    <div class="card card-highlight">
      <h2>Stateless & Privacy-First Architecture</h2>
      <p>
        Simple Streamer stores <strong>zero user data, zero account credentials, and zero stream keys</strong> on external servers. All OAuth tokens and platform credentials are stored strictly in client-side storage within OBS Studio on the operator's computer.
      </p>
      <p>
        For detailed compliance information, please review our <a href="/privacy" style="color: #60a5fa;">Privacy Policy</a>, <a href="/terms" style="color: #60a5fa;">Terms of Service</a>, and <a href="/data-deletion" style="color: #60a5fa;">Data Deletion Instructions</a>.
      </p>
    </div>`
  );
}

function privacyPolicyHtml(): string {
  return layout(
    'Privacy Policy',
    `<h1>Privacy Policy</h1>
    <p style="color: #9ca3af; margin-bottom: 24px;">Last updated: November 4, 2026</p>

    <div class="card card-highlight">
      <p>
        <strong>Simple Streamer</strong> ("we", "our", or "the Application"), operated by <strong>MAHDI DIGITAL LLC</strong>, is an independent, open-source live broadcast orchestration appliance embedded inside OBS Studio. This Privacy Policy details our strict adherence to data privacy, transparency, and minimal data access principles.
      </p>
    </div>

    <h2>1. The Stateless Data Architecture (Zero Server Storage)</h2>
    <p>
      <strong>We operate with zero centralized databases.</strong> We do not collect, store, sell, harvest, or share personal identifiable information (PII).
    </p>
    <ul>
      <li><strong>Client-Side Token Storage:</strong> All OAuth tokens (Google refresh tokens, Facebook Page access tokens, Twitch tokens, and Kick credentials) are saved exclusively on your local computer inside OBS Studio's browser dock <code>localStorage</code>.</li>
      <li><strong>Transient Handshake Only:</strong> During 1-click platform authorization, the Cloud Run backend facilitates the OAuth code-for-token exchange in memory. Handshake sessions use cryptographically secure UUIDs and enforce a <strong>strict single-use (Burn-After-Reading) policy</strong>: tokens are purged from backend memory immediately upon retrieval by the authenticated OBS dock.</li>
      <li><strong>No Server-Side Tracking:</strong> The backend does not log user names, email addresses, channel passwords, or stream viewer data.</li>
    </ul>

    <h2>2. Third-Party API Services & Requested Permissions</h2>
    <p>
      Simple Streamer connects to third-party live streaming platforms strictly upon your explicit authorization:
    </p>

    <h3>A. YouTube Data API v3 (Google)</h3>
    <p>
      Requested scope: <code>https://www.googleapis.com/auth/youtube</code> and <code>youtube.force-ssl</code>.
    </p>
    <ul>
      <li>Used strictly to query your channel title, list active live stream ingestion keys, automatically create scheduled <code>liveBroadcast</code> containers with your specified title, bind the stream, and transition the broadcast to <code>complete</code> when you stop streaming.</li>
    </ul>

    <h3>B. Meta Graph API v21.0 (Facebook Live)</h3>
    <p>
      Requested permissions: <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>pages_manage_posts</code>, <code>publish_video</code>, <code>business_management</code>.
    </p>
    <ul>
      <li><strong><code>pages_show_list</code>:</strong> Allows you to view and select the Facebook Pages you manage.</li>
      <li><strong><code>pages_read_engagement</code>:</strong> Verifies that selected Pages meet Meta's 100-follower prerequisite for live broadcasting.</li>
      <li><strong><code>pages_manage_posts</code> & <code>publish_video</code>:</strong> Creates a dynamic <code>LIVE_NOW</code> broadcast container on your Page and sends <code>end_live_video=true</code> upon stream completion.</li>
    </ul>

    <h3>C. Twitch Helix API</h3>
    <p>
      Requested scope: <code>channel:manage:broadcast</code>.
    </p>
    <ul>
      <li>Used strictly to resolve your channel name, fetch your channel's RTMP stream key, and update your live broadcast title and category.</li>
    </ul>

    <h3>D. Kick Public API</h3>
    <p>
      Requested scope: <code>streamkey:read</code>.
    </p>
    <ul>
      <li>Used strictly to retrieve your channel's RTMP ingestion address and stream key to establish the live broadcast.</li>
    </ul>

    <h2>3. Google API Limited Use Disclosure</h2>
    <div class="card" style="border-left: 4px solid var(--accent);">
      <p style="margin: 0;">
        Simple Streamer's use and transfer to any other app of information received from Google APIs adheres to the <strong><a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener" style="color: #60a5fa;">Google API Services User Data Policy</a></strong>, including the Limited Use requirements. We never use Google user data to serve advertisements or train machine learning models.
      </p>
    </div>

    <h2>4. Data Retention & Deletion</h2>
    <p>
      Because no personal data or tokens are stored on our servers, there is zero persistent data to retain. You maintain 100% control over all authorizations and can revoke access or purge stored local data at any time. For complete step-by-step instructions, visit our <a href="/data-deletion" style="color: #60a5fa;">User Data Deletion Instructions</a> page.
    </p>

    <h2>5. Security Measures</h2>
    <ul>
      <li>All API communications are encrypted via HTTPS / TLS 1.3.</li>
      <li>Server-to-server Meta Graph API calls utilize <code>appsecret_proof</code> HMAC-SHA256 signatures to prevent token spoofing.</li>
      <li>Local bridge daemon binds strictly to IPv4 loopback (<code>127.0.0.1</code>) and rejects external connections.</li>
    </ul>

    <h2>6. Contact & Legal Entity</h2>
    <p>
      <strong>MAHDI DIGITAL LLC</strong><br />
      Representative: Mahdi<br />
      Email: <a href="mailto:Midimahdi6@gmail.com" style="color: #60a5fa;">Midimahdi6@gmail.com</a><br />
      Domain: <code>simple-streamer.bdjlmn.com</code>
    </p>`
  );
}

function dataDeletionHtml(): string {
  return layout(
    'User Data Deletion Instructions',
    `<h1>User Data Deletion Instructions</h1>
    <p style="color: #9ca3af; margin-bottom: 24px;">Last updated: November 4, 2026</p>

    <div class="card card-highlight">
      <p>
        In compliance with <strong>Meta Developer Platform Policies</strong> and standard global data protection frameworks (GDPR, CCPA), this page explains how users can permanently delete, disconnect, or purge all data and access permissions associated with <strong>Simple Streamer</strong>.
      </p>
    </div>

    <h2>1. Understanding Our Stateless Data Policy</h2>
    <p>
      Simple Streamer does <strong>not operate a user account database, server-side credential vault, or cloud tracking system</strong>. All access tokens and channel credentials exist solely in client-side storage inside your local OBS Studio application.
    </p>
    <p>
      Consequently, revoking permissions via your platform settings or clicking "Disconnect" in OBS <strong>instantly and permanently deletes your credentials with zero residue</strong>.
    </p>

    <h2>2. Step-by-Step Instructions to Revoke Platform Access</h2>

    <div class="instruction-card">
      <div class="instruction-header">
        <span class="platform-tag tag-facebook">Facebook</span>
        <h3>Meta / Facebook Live Access Revocation</h3>
      </div>
      <ol class="step-list">
        <li>Log into your Facebook account and navigate to <strong>Settings & Privacy → Settings</strong>.</li>
        <li>In the left-hand navigation sidebar, click <strong>Business Integrations</strong> (or <strong>Apps and Websites</strong>).</li>
        <li>Locate <strong>Simple Streamer</strong> in the list of active authorized applications.</li>
        <li>Click <strong>Remove</strong> and confirm. Meta immediately revokes all Page access tokens and permissions.</li>
      </ol>
    </div>

    <div class="instruction-card">
      <div class="instruction-header">
        <span class="platform-tag tag-youtube">YouTube</span>
        <h3>Google / YouTube Access Revocation</h3>
      </div>
      <ol class="step-list">
        <li>Visit the <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener" style="color: #60a5fa;">Google Account Security Permissions</a> portal.</li>
        <li>Under <em>Third-party apps with account access</em>, select <strong>Simple Streamer</strong>.</li>
        <li>Click <strong>Remove Access</strong>. Google immediately invalidates the OAuth refresh token.</li>
      </ol>
    </div>

    <div class="instruction-card">
      <div class="instruction-header">
        <span class="platform-tag tag-twitch">Twitch</span>
        <h3>Twitch Access Revocation</h3>
      </div>
      <ol class="step-list">
        <li>Go to your <a href="https://www.twitch.tv/settings/connections" target="_blank" rel="noopener" style="color: #60a5fa;">Twitch Settings → Connections</a> dashboard.</li>
        <li>Scroll down to the <em>Other Connections</em> section and locate <strong>Simple Streamer</strong>.</li>
        <li>Click <strong>Disconnect</strong> to instantly revoke the broadcaster OAuth token.</li>
      </ol>
    </div>

    <div class="instruction-card">
      <div class="instruction-header">
        <span class="platform-tag tag-kick">Kick</span>
        <h3>Kick Access Revocation</h3>
      </div>
      <ol class="step-list">
        <li>Log into your Kick account and open <strong>Settings → Applications / Connections</strong>.</li>
        <li>Locate <strong>Simple Streamer</strong> in your authorized application list.</li>
        <li>Click <strong>Revoke Access</strong> to invalidate the streaming token.</li>
      </ol>
    </div>

    <h2>3. Deleting Local Stored Data from OBS Studio</h2>
    
    <div class="instruction-card">
      <div class="instruction-header">
        <span class="platform-tag tag-obs">OBS Studio</span>
        <h3>Purging Local Credentials from Your Machine</h3>
      </div>
      <ol class="step-list">
        <li>Open <strong>OBS Studio</strong> and locate the <strong>Simple Streamer</strong> dock.</li>
        <li>Click the <strong>Settings <code>[⚙]</code></strong> icon in the top right header to open the Stream Destinations drawer.</li>
        <li>Click the red <strong>trash icon</strong> next to any individual platform to erase its credentials immediately from local disk.</li>
        <li>Alternatively, click <strong>"Clear All Platforms"</strong> to wipe all platform credentials from OBS storage simultaneously.</li>
      </ol>
    </div>

    <h2>4. Data Deletion Support Inquiries</h2>
    <div class="card card-highlight">
      <p style="margin-bottom: 8px;">
        If you require written verification of data deletion or assistance revoking access, please submit a request to:
      </p>
      <p style="margin: 0;">
        <strong>MAHDI DIGITAL LLC — Privacy Support</strong><br />
        Email: <a href="mailto:Midimahdi6@gmail.com" style="color: #60a5fa;">Midimahdi6@gmail.com</a><br />
        All data deletion inquiries are processed within 48 business hours.
      </p>
    </div>`
  );
}

function termsHtml(): string {
  return layout(
    'Terms of Service',
    `<h1>Terms of Service</h1>
    <p style="color: #9ca3af; margin-bottom: 24px;">Last updated: November 4, 2026</p>

    <h2>1. Acceptance of Terms</h2>
    <p>
      By using, installing, or deploying <strong>Simple Streamer</strong> (the "Application"), provided by <strong>MAHDI DIGITAL LLC</strong> ("we", "our", "us"), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not install or use the Application.
    </p>

    <h2>2. Purpose & Permitted Use</h2>
    <p>
      Simple Streamer is an open-source broadcast utility designed to assist broadcasters and community organizations in streaming video simultaneously to authorized accounts on YouTube, Facebook Live, Twitch, and Kick.
    </p>
    <p>
      You agree to use the Application strictly in compliance with applicable local laws and the terms of service of each connected third-party streaming platform:
    </p>
    <ul>
      <li><a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener" style="color: #60a5fa;">YouTube Terms of Service</a> and Community Guidelines.</li>
      <li><a href="https://www.facebook.com/terms.php" target="_blank" rel="noopener" style="color: #60a5fa;">Meta Terms of Service</a> and Community Standards.</li>
      <li><a href="https://www.twitch.tv/p/en/legal/terms-of-service/" target="_blank" rel="noopener" style="color: #60a5fa;">Twitch Terms of Service</a>.</li>
      <li><a href="https://kick.com/terms-of-service" target="_blank" rel="noopener" style="color: #60a5fa;">Kick Terms of Service</a>.</li>
    </ul>

    <h2>3. Disclaimer of Warranties</h2>
    <p>
      Simple Streamer is provided on an "AS IS" and "AS AVAILABLE" basis without warranties of any kind, whether express, implied, or statutory. We make no warranty that the Application will meet your requirements, operate without interruption, or remain error-free during live broadcasts.
    </p>

    <h2>4. Limitation of Liability</h2>
    <p>
      In no event shall MAHDI DIGITAL LLC, its maintainers, or contributors be liable for any direct, indirect, incidental, special, consequential, or punitive damages arising out of the use or inability to use the Application, including but not limited to broadcast interruption, lost viewer revenue, network failure, or API rate limitations imposed by third-party platforms.
    </p>

    <h2>5. Modifications & Governing Law</h2>
    <p>
      We reserve the right to amend these terms at any time. Changes become effective immediately upon publication to this page. These Terms are governed by the laws of the State of Delaware, United States, without regard to conflict of law principles.
    </p>

    <h2>6. Contact</h2>
    <p>
      For legal or terms inquiries: <a href="mailto:Midimahdi6@gmail.com" style="color: #60a5fa;">Midimahdi6@gmail.com</a>
    </p>`
  );
}
