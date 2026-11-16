const CLOUD_RUN_ORIGIN = 'https://mosque-stream-orchestrator-259167398353.europe-west1.run.app';
const SUPABASE_PROJECT_URL = 'https://uqxlgyhmbhzeyfcgxxji.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxeGxneWhtYmh6ZXlmY2d4eGppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ2ODYxNzgsImV4cCI6MjExMDI2MjE3OH0.nr6UxjL7D_EhSfzHir_O4602yEE8aks-S6Wj2b7hR8Q';

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname.toLowerCase().replace(/\/+$/, '');

    const headers = {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    };

    const noCacheHeaders = {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    };

    // User Portal: Auth & Device Management
    if (pathname === '/login' || pathname === '/auth/login') {
      return new Response(loginHtml(), { headers: noCacheHeaders });
    }

    if (pathname === '/setup' || pathname === '/activate') {
      return new Response(setupHtml(), { headers: noCacheHeaders });
    }

    if (pathname === '/account' || pathname === '/dashboard') {
      return new Response(accountHtml(), { headers: noCacheHeaders });
    }

    if (pathname === '/privacy' || pathname === '/privacy-policy') {
      return new Response(privacyPolicyHtml(), { headers });
    }

    if (pathname === '/terms' || pathname === '/terms-of-service') {
      return new Response(termsHtml(), { headers });
    }

    if (pathname === '/data-deletion' || pathname === '/data-deletion-instructions' || pathname === '/deletion') {
      return new Response(dataDeletionHtml(), { headers });
    }

    if (pathname === '/api/founding-slots') {
      try {
        const resp = await fetch(`${SUPABASE_PROJECT_URL}/rest/v1/rpc/get_founding_slots_remaining`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
        });
        const data = await resp.json();
        return new Response(JSON.stringify(data), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ total_slots: 100, claimed_slots: 1, remaining_slots: 99 }), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, max-age=0',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    }

    const isExplicitDock = pathname === '/dock' || pathname === '/app' || url.searchParams.has('dock');
    const isObsUserAgent = (request.headers.get('user-agent') || '').includes('OBS/');

    // Public Product Home Page (Accessible to all public users and Google reviewers without login)
    if ((pathname === '' || pathname === '/' || pathname === '/about' || pathname === '/home') && !isExplicitDock && !isObsUserAgent) {
      return new Response(homeHtml(), { headers });
    }

    // Proxy to Cloud Run backend (OBS Dock, Setup Wizard, API endpoints)
    let targetPath = url.pathname + url.search;
    if (pathname === '/dock' || pathname === '/app') {
      targetPath = '/index.html' + (url.search ? url.search : '');
    }
    const targetUrl = new URL(targetPath, CLOUD_RUN_ORIGIN);
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
      pathname === '/remote' ||
      pathname === '/remote.html' ||
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

function layout(title: string, bodyContent: string, extraHead: string = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Simple Streamer</title>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  ${extraHead}
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
    nav { display: flex; gap: 20px; flex-wrap: wrap; align-items: center; }
    nav a { color: var(--muted); text-decoration: none; font-size: 14px; font-weight: 600; transition: color 0.2s; }
    nav a:hover { color: #fff; }
    nav a.highlight-nav { color: #60a5fa; }
    nav a.highlight-nav:hover { color: #93c5fd; }
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
    
    .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 28px; border-radius: 8px; font-weight: 700; font-size: 16px; text-decoration: none; transition: all 0.2s; cursor: pointer; border: none; }
    .btn-primary { background: #2563eb; color: #fff; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4); }
    .btn-primary:hover { background: #1d4ed8; transform: translateY(-1px); }
    .btn-secondary { background: #1e2433; color: #d1d5db; border: 1px solid var(--border); }
    .btn-secondary:hover { background: #283044; color: #fff; }
    .btn-danger { background: #dc2626; color: #fff; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3); }
    .btn-danger:hover { background: #b91c1c; transform: translateY(-1px); }
    .btn-gold { background: linear-gradient(135deg, #f59e0b, #d97706); color: #000; font-weight: 800; box-shadow: 0 4px 14px rgba(245, 158, 11, 0.3); }
    .btn-gold:hover { background: linear-gradient(135deg, #fbbf24, #f59e0b); transform: translateY(-1px); }
    .btn-sm { padding: 8px 16px; font-size: 13px; border-radius: 6px; }
    
    .form-group { margin-bottom: 20px; text-align: left; }
    .form-label { display: block; font-size: 14px; font-weight: 600; margin-bottom: 8px; color: #e2e8f0; }
    .input-text { width: 100%; background: #161a26; border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; color: #fff; font-size: 15px; outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
    .input-text:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25); }

    .badge-founding { background: linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(217, 119, 6, 0.15)); border: 1px solid #f59e0b; color: #fbbf24; font-weight: 800; font-size: 13px; padding: 4px 12px; border-radius: 20px; display: inline-flex; align-items: center; gap: 6px; }
    .badge-pro { background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; color: #34d399; font-weight: 700; font-size: 13px; padding: 4px 12px; border-radius: 20px; display: inline-flex; align-items: center; gap: 6px; }
    .badge-free { background: #1e222f; border: 1px solid var(--border); color: #94a3b8; font-weight: 600; font-size: 13px; padding: 4px 12px; border-radius: 20px; display: inline-flex; align-items: center; gap: 6px; }

    .alert { padding: 14px 18px; border-radius: 8px; font-size: 14px; margin-bottom: 20px; line-height: 1.5; }
    .alert-success { background: rgba(16, 185, 129, 0.12); border: 1px solid #10b981; color: #a7f3d0; }
    .alert-error { background: rgba(239, 68, 68, 0.12); border: 1px solid #ef4444; color: #fca5a5; }
    .alert-info { background: rgba(59, 130, 246, 0.12); border: 1px solid #3b82f6; color: #bfdbfe; }

    .divider-text { display: flex; align-items: center; margin: 24px 0; color: var(--muted); font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; }
    .divider-text::before, .divider-text::after { content: ""; flex: 1; border-bottom: 1px solid var(--border); }
    .divider-text span { padding: 0 14px; }

    .device-item { background: #161a26; border: 1px solid var(--border); border-radius: 10px; padding: 18px 22px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; transition: border-color 0.2s; }
    .device-item:hover { border-color: #374151; }
    .device-info { display: flex; align-items: center; gap: 16px; }
    .device-icon { width: 44px; height: 44px; border-radius: 8px; background: #232734; display: flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0; }

    .hero-ctas { display: flex; flex-direction: column; align-items: center; gap: 12px; margin: 32px 0; }
    .cta-row { display: flex; gap: 16px; flex-wrap: wrap; justify-content: center; }
    .sub-download { font-size: 13px; color: var(--muted); }
    .sub-download a { color: #60a5fa; text-decoration: none; }
    .sub-download a:hover { text-decoration: underline; }
    .feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 36px; }
    .feature-card { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; padding: 24px; }
    .feature-card h3 { color: #fff; margin-top: 0; font-size: 18px; margin-bottom: 8px; }
    .feature-card p { font-size: 14px; margin-bottom: 0; }
    .compare-table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    .compare-table th, .compare-table td { padding: 12px 16px; text-align: left; border-bottom: 1px solid var(--border); font-size: 14px; }
    .compare-table th { background: #161a26; color: #fff; font-weight: 700; }
    .compare-table td.highlight { color: #34d399; font-weight: 700; }
    .founding-banner { background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(217, 119, 6, 0.05)); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 12px; padding: 28px; margin-bottom: 36px; text-align: center; }
    .founding-banner h2 { color: #fbbf24; margin-top: 0; font-size: 24px; margin-bottom: 8px; }
    .founding-banner p { color: #fde68a; font-size: 15px; margin-bottom: 20px; }
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
    .faq-item { border-bottom: 1px solid var(--border); padding: 18px 0; }
    .faq-item:last-child { border-bottom: none; padding-bottom: 0; }
    .faq-question { font-weight: 700; font-size: 16px; color: #fff; margin-bottom: 8px; }
    .faq-answer { font-size: 14px; color: #94a3b8; line-height: 1.6; }
    @keyframes spin { 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <a href="/" class="logo">SimpleStreamer</a>
      <nav>
        <a href="/">Home</a>
        <a href="/login" id="navAccountLink" class="highlight-nav">Login</a>
      </nav>
    </header>
    <main>
      ${bodyContent}
    </main>
    <footer>
      <div>© ${new Date().getFullYear()} MAHDI DIGITAL LLC. Simple Streamer — Open-source community broadcasting.</div>
      <div>
        <a href="/privacy">Privacy Policy</a> · <a href="/terms">Terms of Service</a> · <a href="/data-deletion">Data Deletion</a>
      </div>
    </footer>
  </div>
  <script>
    (function() {
      try {
        var token = localStorage.getItem('sb-uqxlgyhmbhzeyfcgxxji-auth-token');
        var navLink = document.getElementById('navAccountLink');
        var heroBtn = document.getElementById('heroAccountBtn');
        var isLoggedIn = false;
        if (token) {
          try {
            var parsed = JSON.parse(token);
            if (parsed && (parsed.access_token || parsed.user)) {
              isLoggedIn = true;
            }
          } catch (_) {
            if (token.length > 20) isLoggedIn = true;
          }
        }
        if (isLoggedIn) {
          if (navLink) {
            navLink.innerText = 'My Account';
            navLink.href = '/account';
          }
          if (heroBtn) {
            heroBtn.innerHTML = '👤 My Account';
            heroBtn.href = '/account';
          }
        } else {
          if (navLink) {
            navLink.innerText = 'Login';
            navLink.href = '/login';
          }
          if (heroBtn) {
            heroBtn.innerHTML = '👤 Login';
            heroBtn.href = '/login';
          }
        }
      } catch(e) {}
    })();
  </script>
</body>
</html>`;
}

function setupHtml(): string {
  return layout(
    'Set Up Your Broadcaster Account - Simple Streamer',
    `<div style="max-width: 480px; margin: 40px auto 80px;">
      <div class="card" style="padding: 36px 32px; border-top: 4px solid #fbbf24;">
        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.4); color: #fbbf24; padding: 4px 14px; border-radius: 999px; font-size: 13px; font-weight: 700; margin-bottom: 12px;">
            🎉 Payment Confirmed
          </div>
          <h1 style="font-size: 24px; margin-bottom: 6px; color: #fff;">Activate Simple Streamer</h1>
          <p style="color: var(--muted); font-size: 14px; margin-bottom: 0; line-height: 1.5;">
            Your Lifetime Founding Pass is ready.
          </p>
        </div>

        <div id="setupAlert" style="display: none;" class="alert"></div>

        <!-- Step 1: Direct OBS Dock Activation -->
        <div id="obsDirectActivationCard" style="background: #141824; border: 1px solid #334155; border-radius: 10px; padding: 18px 20px; margin-bottom: 24px; text-align: left;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span id="obsStatusIcon" style="font-size: 18px;">⚡</span>
              <strong id="obsStatusTitle" style="color: #fff; font-size: 14px;">Activating OBS Studio Dock...</strong>
            </div>
            <span id="obsStatusBadge" style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); padding: 2px 10px; border-radius: 6px; font-size: 11px; font-weight: 700;">CONNECTING</span>
          </div>
          <p id="obsStatusDesc" style="color: var(--muted); font-size: 12px; margin: 0 0 10px; line-height: 1.4;">
            Connecting to Simple Streamer on this machine to automatically unlock your Pro license.
          </p>
          <div id="obsManualKeyRow" style="display: flex; align-items: center; gap: 8px; margin-top: 6px;">
            <input type="text" id="licenseTokenInput" readonly style="flex: 1; background: #0b0e14; border: 1px solid #334155; color: #94a3b8; font-family: monospace; font-size: 12px; padding: 6px 10px; border-radius: 6px;" value="" />
            <button type="button" id="btnCopyLicense" onclick="copyLicenseToken()" class="btn btn-secondary btn-sm" style="white-space: nowrap; font-size: 12px; padding: 6px 14px;">
              📋 Copy Key
            </button>
          </div>
        </div>

        <div style="border-top: 1px solid var(--border); margin: 24px 0 20px;"></div>

        <!-- Step 2: Save Account -->
        <div style="text-align: center; margin-bottom: 18px;">
          <div style="color: var(--muted); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">STEP 2</div>
          <h2 style="font-size: 18px; margin: 0 0 6px; color: #fff;">Save Your Account</h2>
          <p style="color: var(--muted); font-size: 13px; margin: 0;">
            Sign in with Google to protect your license and sync presets across your 2 computers.
          </p>
        </div>

        <!-- Google OAuth Sign In -->
        <button id="googleSignInBtn" type="button" class="btn btn-secondary" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 15px; padding: 13px 20px; font-weight: 600;" onclick="handleGoogleSignIn()">
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
            <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.17 0 9.97 0 12s.45 3.83 1.25 5.42l4.03-3.15z"/>
            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
          </svg>
          <span>Sign In with Google</span>
        </button>

        <div class="divider-text">
          <span>or email magic link</span>
        </div>

        <!-- Email Magic Link Form -->
        <form id="magicLinkForm" onsubmit="handleMagicLink(event)">
          <div class="form-group">
            <label for="emailInput" class="form-label">Email address</label>
            <input 
              type="email" 
              id="emailInput" 
              class="input-text" 
              placeholder="name@example.com" 
              required 
              autocomplete="email" 
            />
          </div>
          <button type="submit" id="magicLinkBtn" class="btn btn-primary" style="width: 100%;">
            ✉️ Send Email Magic Link
          </button>
          <p style="color: var(--muted); font-size: 12px; margin-top: 12px; text-align: center; margin-bottom: 0;">
            No password required. We will send a secure one-click sign in link to your email.
          </p>
        </form>
      </div>
    </div>

    <script>
      (function() {
        var supabase = window.supabase.createClient(
          '${SUPABASE_PROJECT_URL}',
          '${SUPABASE_ANON_KEY}'
        );

        function showAlert(msg, isSuccess) {
          var el = document.getElementById('setupAlert');
          if (!el) return;
          el.className = 'alert ' + (isSuccess ? 'alert-success' : 'alert-error');
          el.innerHTML = msg;
          el.style.display = 'block';
        }

        function hideAlert() {
          var el = document.getElementById('setupAlert');
          if (el) el.style.display = 'none';
        }

        var urlParams = new URLSearchParams(window.location.search);
        var sessionId = urlParams.get('session_id') || urlParams.get('sessionId');
        if (sessionId) {
          try { sessionStorage.setItem('simple_streamer_stripe_session', sessionId); } catch(e) {}
        } else {
          try { sessionId = sessionStorage.getItem('simple_streamer_stripe_session'); } catch(e) {}
        }

        var dockSession = urlParams.get('session');
        if (dockSession) {
          try { sessionStorage.setItem('simple_streamer_dock_session', dockSession); } catch(e) {}
        } else {
          try { dockSession = sessionStorage.getItem('simple_streamer_dock_session'); } catch(e) {}
        }

        // --- STEP 1: IMMEDIATELY ACTIVATE OBS DOCK ON LOAD ---
        if (sessionId) {
          var tokenInput = document.getElementById('licenseTokenInput');
          if (tokenInput) tokenInput.value = sessionId;

          var obsIcon = document.getElementById('obsStatusIcon');
          var obsTitle = document.getElementById('obsStatusTitle');
          var obsBadge = document.getElementById('obsStatusBadge');
          var obsDesc = document.getElementById('obsStatusDesc');

          // Attempt local bridge activation
          fetch('http://127.0.0.1:45455/save-auth?token=' + encodeURIComponent(sessionId), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: sessionId })
          }).then(function(r) { return r.json(); }).then(function(res) {
            if (obsIcon) obsIcon.innerText = '✅';
            if (obsTitle) obsTitle.innerText = 'OBS Studio Dock Activated!';
            if (obsBadge) {
              obsBadge.innerText = 'PRO UNLOCKED';
              obsBadge.style.background = 'rgba(52, 211, 153, 0.2)';
              obsBadge.style.color = '#34d399';
              obsBadge.style.border = '1px solid rgba(52, 211, 153, 0.4)';
            }
            if (obsDesc) obsDesc.innerText = 'Simple Streamer on this PC is now active on Pro. Switch back to OBS Studio to stream.';
            fetch('http://127.0.0.1:45455/focus-obs', { mode: 'no-cors' }).catch(function() {});
          }).catch(function() {
            if (obsIcon) obsIcon.innerText = '🔑';
            if (obsTitle) obsTitle.innerText = 'Instant OBS License Key';
            if (obsBadge) {
              obsBadge.innerText = 'READY';
              obsBadge.style.background = 'rgba(59, 130, 246, 0.2)';
              obsBadge.style.color = '#60a5fa';
              obsBadge.style.border = '1px solid rgba(59, 130, 246, 0.4)';
            }
            if (obsDesc) obsDesc.innerText = 'Paste this key into OBS Dock Settings [⚙] -> [Paste Token], or sign in below to link your account.';
          });
        }

        window.copyLicenseToken = function() {
          var input = document.getElementById('licenseTokenInput');
          var btn = document.getElementById('btnCopyLicense');
          if (!input || !input.value) return;
          if (navigator.clipboard) {
            navigator.clipboard.writeText(input.value).then(function() {
              if (btn) {
                var orig = btn.innerText;
                btn.innerText = '✓ Copied!';
                setTimeout(function() { btn.innerText = orig; }, 2500);
              }
              showAlert('License key copied! In your OBS Studio dock, click Settings [⚙] -> [Paste Token] to activate.', true);
            }).catch(function() {
              input.select();
            });
          } else {
            input.select();
          }
        };

        // --- STEP 2: LINK PERMANENT ACCOUNT ---
        async function handleAuthenticated(session) {
          if (!session || !session.user) return;
          var user = session.user;

          showAlert('Linking your license to your account...', true);

          if (sessionId) {
            try {
              await supabase.rpc('claim_prepaid_session', {
                p_session_id: sessionId,
                p_user_id: user.id,
                p_user_email: user.email
              });
            } catch (err) {
              console.warn('claim_prepaid_session error:', err);
            }
          }

          if (dockSession && session.access_token) {
            try {
              await fetch('/api/auth-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  sessionId: dockSession,
                  token: session.access_token,
                  user: { id: user.id, email: user.email }
                })
              });
            } catch(e) {}
          }

          try {
            fetch('http://127.0.0.1:45455/save-auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: session.access_token })
            }).catch(function() {});
            fetch('http://127.0.0.1:45455/focus-obs', { mode: 'no-cors' }).catch(function() {});
          } catch(e) {}

          window.location.replace('/account?upgraded=true');
        }

        supabase.auth.getSession().then(function(res) {
          if (res && res.data && res.data.session) {
            handleAuthenticated(res.data.session);
          }
        });

        supabase.auth.onAuthStateChange(function(event, session) {
          if (session) {
            handleAuthenticated(session);
          }
        });

        function getSetupRedirectUrl() {
          var target = window.location.origin + '/setup';
          var params = [];
          if (sessionId) params.push('session_id=' + encodeURIComponent(sessionId));
          if (dockSession) params.push('session=' + encodeURIComponent(dockSession));
          if (params.length > 0) target += '?' + params.join('&');
          return target;
        }

        window.handleGoogleSignIn = async function() {
          hideAlert();
          var btn = document.getElementById('googleSignInBtn');
          if (btn) {
            btn.style.opacity = '0.6';
            btn.style.pointerEvents = 'none';
          }
          try {
            var res = await supabase.auth.signInWithOAuth({
              provider: 'google',
              options: {
                redirectTo: getSetupRedirectUrl()
              }
            });
            if (res.error) {
              showAlert('Google Sign In error: ' + res.error.message, false);
              if (btn) {
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
              }
            }
          } catch(err) {
            showAlert('Sign in failed. Please try again.', false);
            if (btn) {
              btn.style.opacity = '1';
              btn.style.pointerEvents = 'auto';
            }
          }
        };

        window.handleMagicLink = async function(e) {
          e.preventDefault();
          hideAlert();
          var input = document.getElementById('emailInput');
          var btn = document.getElementById('magicLinkBtn');
          if (!input || !input.value) return;

          var email = input.value.trim();
          if (btn) {
            btn.disabled = true;
            btn.innerText = 'Sending link...';
          }

          try {
            var res = await supabase.auth.signInWithOtp({
              email: email,
              options: {
                emailRedirectTo: getSetupRedirectUrl()
              }
            });
            if (res.error) {
              showAlert(res.error.message, false);
              if (btn) {
                btn.disabled = false;
                btn.innerText = '✉️ Send Email Magic Link';
              }
            } else {
              showAlert('✨ Magic link sent to <strong>' + email + '</strong>! Open the link in your email to activate your account.', true);
              if (btn) {
                btn.innerText = '✓ Link Sent';
              }
            }
          } catch(err) {
            showAlert('Failed to send magic link. Please try again.', false);
            if (btn) {
              btn.disabled = false;
              btn.innerText = '✉️ Send Email Magic Link';
            }
          }
        };
      })();
    </script>`
  );
}

function loginHtml(): string {
  return layout(
    'Account Sign In',
    `<div style="max-width: 440px; margin: 40px auto 80px;">
      <div class="card" style="padding: 36px 32px; border-top: 4px solid var(--accent);">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="font-size: 24px; margin-bottom: 6px;">Sign In to Simple Streamer</h1>
          <p style="color: var(--muted); font-size: 14px; margin-bottom: 0;">
            Sign in to manage your active broadcasting machines and access Pro features.
          </p>
        </div>

        <div id="loginAlert" style="display: none;" class="alert"></div>

        <!-- Google OAuth Sign In -->
        <button id="googleSignInBtn" type="button" class="btn btn-secondary" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 15px; padding: 13px 20px; font-weight: 600;" onclick="handleGoogleSignIn()">
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"/>
            <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.17 0 9.97 0 12s.45 3.83 1.25 5.42l4.03-3.15z"/>
            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
          </svg>
          <span>Sign In with Google</span>
        </button>

        <div class="divider-text">
          <span>or email magic link</span>
        </div>

        <!-- Email Magic Link Form -->
        <form id="magicLinkForm" onsubmit="handleMagicLink(event)">
          <div class="form-group">
            <label for="emailInput" class="form-label">Email address</label>
            <input 
              type="email" 
              id="emailInput" 
              class="input-text" 
              placeholder="streamer@example.com" 
              required 
              autocomplete="email" 
            />
          </div>
          <button type="submit" id="magicLinkBtn" class="btn btn-primary" style="width: 100%;">
            ✉️ Send Email Magic Link
          </button>
          <p style="color: var(--muted); font-size: 12px; margin-top: 12px; text-align: center; margin-bottom: 0;">
            No password required. We will send a secure one-click sign in link to your email.
          </p>
        </form>
      </div>
    </div>

    <script>
      (function() {
        var supabase = window.supabase.createClient(
          '${SUPABASE_PROJECT_URL}',
          '${SUPABASE_ANON_KEY}'
        );

        function showAlert(msg, isSuccess) {
          var el = document.getElementById('loginAlert');
          if (!el) return;
          el.className = 'alert ' + (isSuccess ? 'alert-success' : 'alert-error');
          el.innerHTML = msg;
          el.style.display = 'block';
        }

        function hideAlert() {
          var el = document.getElementById('loginAlert');
          if (el) el.style.display = 'none';
        }

        var urlParams = new URLSearchParams(window.location.search);
        var dockSession = urlParams.get('session');
        if (dockSession) {
          try { sessionStorage.setItem('simple_streamer_dock_session', dockSession); } catch(e) {}
        }

        function getAccountRedirectUrl() {
          var target = window.location.origin + '/account';
          if (dockSession) {
            target += '?session=' + encodeURIComponent(dockSession);
          }
          return target;
        }

        // Auto-redirect if already authenticated
        supabase.auth.getSession().then(function(res) {
          if (res && res.data && res.data.session) {
            window.location.replace(getAccountRedirectUrl());
          }
        });

        supabase.auth.onAuthStateChange(function(event, session) {
          if (session) {
            window.location.replace(getAccountRedirectUrl());
          }
        });

        window.handleGoogleSignIn = async function() {
          hideAlert();
          var btn = document.getElementById('googleSignInBtn');
          if (btn) {
            btn.style.opacity = '0.6';
            btn.style.pointerEvents = 'none';
          }
          try {
            var res = await supabase.auth.signInWithOAuth({
              provider: 'google',
              options: {
                redirectTo: getAccountRedirectUrl()
              }
            });
            if (res.error) {
              showAlert(res.error.message, false);
              if (btn) {
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';
              }
            }
          } catch (err) {
            showAlert('Sign in failed: ' + (err.message || err), false);
            if (btn) {
              btn.style.opacity = '1';
              btn.style.pointerEvents = 'auto';
            }
          }
        };

        window.handleMagicLink = async function(e) {
          e.preventDefault();
          hideAlert();
          var emailInput = document.getElementById('emailInput');
          var btn = document.getElementById('magicLinkBtn');
          var email = emailInput ? emailInput.value.trim() : '';

          if (!email) return;

          if (btn) {
            btn.disabled = true;
            btn.innerText = 'Sending Link...';
          }

          try {
            var res = await supabase.auth.signInWithOtp({
              email: email,
              options: {
                emailRedirectTo: window.location.origin + '/account'
              }
            });

            if (res.error) {
              showAlert(res.error.message, false);
            } else {
              showAlert('✨ Magic link sent! Please check your inbox at <strong>' + email + '</strong> and click the link to sign in.', true);
              if (emailInput) emailInput.value = '';
            }
          } catch (err) {
            showAlert('Failed to send magic link: ' + (err.message || err), false);
          } finally {
            if (btn) {
              btn.disabled = false;
              btn.innerText = '✉️ Send Email Magic Link';
            }
          }
        };
      })();
    </script>`
  );
}

function accountHtml(): string {
  return layout(
    'My Account & Devices',
    `<!-- Loading Overlay -->
    <div id="accountLoading" style="text-align: center; padding: 80px 20px;">
      <div style="font-size: 36px; margin-bottom: 16px; animation: spin 1s linear infinite; display: inline-block;">⏳</div>
      <h2 style="margin: 0; color: #fff;">Verifying Session...</h2>
      <p style="color: var(--muted); margin-top: 8px;">Connecting to your Simple Streamer account...</p>
    </div>

    <!-- Main Account Dashboard -->
    <div id="accountContent" style="display: none;">
      <!-- Profile Header -->
      <div class="card" style="margin-bottom: 24px; padding: 24px 32px;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
          <div style="display: flex; align-items: center; gap: 16px;">
            <div id="userAvatar" style="width: 52px; height: 52px; border-radius: 50%; background: #1e293b; border: 2px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 24px; color: #fff; flex-shrink: 0; overflow: hidden;">
              👤
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                <h1 id="userDisplayName" style="font-size: 20px; margin-bottom: 0; color: #fff; font-weight: 700;">user@example.com</h1>
                <span id="userBadge" class="badge-free">Checking...</span>
              </div>
              <div style="color: var(--muted); font-size: 13px; margin-top: 4px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span id="userEmailSub">user@example.com</span>
                <span>·</span>
                <span style="display: inline-flex; align-items: center; gap: 6px;">
                  Support ID: <code id="userIdShort" style="font-size: 12px; cursor: pointer; background: #1e2434; padding: 2px 6px; border-radius: 4px; border: 1px solid #334155; color: #93c5fd;" title="Click to copy support reference" onclick="copyAccountId()">...</code>
                  <button type="button" onclick="copyAccountId()" style="background: none; border: none; color: #60a5fa; cursor: pointer; font-size: 13px; padding: 0;" title="Copy Support Reference">📋</button>
                </span>
              </div>
            </div>
          </div>
          <div>
            <button onclick="handleSignOut()" class="btn btn-secondary btn-sm" style="display: flex; align-items: center; gap: 6px;">
              🚪 Sign Out
            </button>
          </div>
        </div>
      </div>

      <div id="accountAlert" style="display: none;" class="alert"></div>

      <!-- Plan & Slot Highlights -->
      <div class="feature-grid" style="margin-bottom: 24px;">
        <div class="feature-card">
          <div style="color: var(--muted); font-size: 12px; text-transform: uppercase; font-weight: 700; margin-bottom: 6px;">Subscription Status</div>
          <h3 id="planTitle" style="color: #fbbf24; margin: 0 0 6px;">Lifetime Founding Pro</h3>
          <p id="planDesc" style="font-size: 13px; color: #d1d5db; margin: 0;">Lifetime Pro access with unified title & description automation, multi-platform streaming, and cloud remote control.</p>
          <div id="planActionArea" style="margin-top: 14px;"></div>
        </div>
        <div class="feature-card">
          <div style="color: var(--muted); font-size: 12px; text-transform: uppercase; font-weight: 700; margin-bottom: 6px;">Broadcasting Slots</div>
          <h3 id="deviceSlotCount" style="color: #fff; margin: 0 0 6px;">Active Devices</h3>
          <p style="font-size: 13px; color: #d1d5db; margin: 0;">Simple Streamer supports up to 2 active workstations. Revoke any machine below to instantly free its slot.</p>
        </div>
      </div>

      <!-- Broadcaster Profile & Account Details Card -->
      <div class="card" style="margin-bottom: 24px; padding: 24px 32px;">
        <div style="margin-bottom: 18px;">
          <h2 style="margin: 0 0 4px; font-size: 18px; color: #fff;">Profile & Broadcaster Details</h2>
          <p style="color: var(--muted); font-size: 13px; margin: 0;">
            Manage your broadcaster display name and login credentials.
          </p>
        </div>

        <form id="profileForm" onsubmit="handleUpdateProfile(event)">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 16px;">
            <div class="form-group" style="margin-bottom: 0;">
              <label for="firstNameInput" class="form-label" style="font-size: 13px; color: #94a3b8; margin-bottom: 6px; display: block;">First Name</label>
              <input type="text" id="firstNameInput" class="input-text" placeholder="First Name" />
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label for="lastNameInput" class="form-label" style="font-size: 13px; color: #94a3b8; margin-bottom: 6px; display: block;">Last Name</label>
              <input type="text" id="lastNameInput" class="input-text" placeholder="Last Name" />
            </div>
          </div>
          <div style="display: flex; justify-content: flex-end; margin-bottom: 20px;">
            <button type="submit" id="btnSaveProfile" class="btn btn-primary btn-sm">
              💾 Save Profile
            </button>
          </div>
        </form>

        <div style="border-top: 1px solid var(--border); padding-top: 20px;">
          <h3 style="margin: 0 0 4px; font-size: 15px; color: #fff;">Change Account Email</h3>
          <p style="color: var(--muted); font-size: 13px; margin: 0 0 14px;">
            Enter your new email address. A confirmation link will be sent to verify the update.
          </p>

          <form id="emailForm" onsubmit="handleUpdateEmail(event)" style="display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end;">
            <div class="form-group" style="flex: 1; min-width: 240px; margin-bottom: 0;">
              <label for="newEmailInput" class="form-label" style="font-size: 13px; color: #94a3b8; margin-bottom: 6px; display: block;">New Email Address</label>
              <input type="email" id="newEmailInput" class="input-text" placeholder="new-email@example.com" required />
            </div>
            <button type="submit" id="btnUpdateEmail" class="btn btn-secondary btn-sm" style="height: 44px; white-space: nowrap;">
              ✉️ Update Email
            </button>
          </form>
        </div>
      </div>

      <!-- OBS Studio Connection Token Card -->
      <div class="card" style="border: 1px solid rgba(59, 130, 246, 0.4); background: #0c1322; margin-bottom: 24px; padding: 20px 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h3 style="margin: 0; color: #60a5fa; font-size: 16px;">🔑 OBS Studio Dock License Token</h3>
            <p style="font-size: 13px; color: #94a3b8; margin: 4px 0 0;">
              Copy this token and click <strong>[Paste Token]</strong> inside your Simple Streamer OBS dock (under <strong>Settings [⚙] -> Account & Pass</strong>) to link this workstation.
            </p>
          </div>
          <button class="btn btn-primary btn-sm" id="btnCopyDockToken" onclick="copyDockToken()" style="white-space: nowrap;">
            📋 Copy Dock Token
          </button>
        </div>
        <div style="margin-top: 10px;">
          <input type="password" id="dockTokenInput" readonly style="width: 100%; font-family: monospace; font-size: 11px; padding: 8px 10px; background: #070b14; border: 1px solid #1e293b; color: #93c5fd; border-radius: 6px; box-sizing: border-box;" />
        </div>
      </div>

      <!-- Registered Devices Card -->
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h2 style="margin: 0; font-size: 20px; color: #fff;">Registered Devices & Workstations</h2>
            <p style="color: var(--muted); font-size: 14px; margin: 4px 0 0;">
              Hardware machines currently authorized to broadcast through your Simple Streamer license.
            </p>
          </div>
          <div>
            <button onclick="loadDevices()" class="btn btn-secondary btn-sm" style="display: flex; align-items: center; gap: 6px;">
              🔄 Refresh List
            </button>
          </div>
        </div>

        <div id="deviceList">
          <div style="color: var(--muted); text-align: center; padding: 24px;">Loading devices...</div>
        </div>
      </div>

      <!-- Help / Instructions Card -->
      <div class="card" style="border-left: 4px solid var(--accent); background: #121520;">
        <h3 style="margin-top: 0; font-size: 16px; color: #fff;">💡 Linking a New Broadcasting Computer</h3>
        <ol class="step-list" style="margin-top: 12px;">
          <li>Install and launch <strong>Simple Streamer</strong> inside OBS Studio on your machine.</li>
          <li>Click the <strong>Settings [⚙]</strong> icon in the Simple Streamer OBS dock.</li>
          <li>Log in with your account credentials. Your workstation hardware ID will register automatically in one of your available slots.</li>
        </ol>
      </div>
    </div>

    <script>
      (function() {
        var supabase = window.supabase.createClient(
          '${SUPABASE_PROJECT_URL}',
          '${SUPABASE_ANON_KEY}'
        );

        var currentUser = null;
        var initialized = false;

        function escapeHtml(str) {
          if (!str) return '';
          return String(str).replace(/[&<>"']/g, function(m) {
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

        function escapeJs(str) {
          if (!str) return '';
          return JSON.stringify(String(str)).slice(1, -1);
        }

        window.showAccountAlert = function(msg, type) {
          var el = document.getElementById('accountAlert');
          if (!el) return;
          el.className = 'alert ' + (type === 'success' ? 'alert-success' : 'alert-error');
          el.innerHTML = msg;
          el.style.display = 'block';
          setTimeout(function() {
            if (el) el.style.display = 'none';
          }, 6000);
        };

        async function initDashboard(session) {
          if (!session || !session.user) return;
          currentUser = session.user;
          initialized = true;

          // Instantly reveal dashboard
          var loadingEl = document.getElementById('accountLoading');
          var contentEl = document.getElementById('accountContent');
          if (loadingEl) loadingEl.style.display = 'none';
          if (contentEl) contentEl.style.display = 'block';

          var meta = currentUser.user_metadata || {};
          var avatarEl = document.getElementById('userAvatar');
          if (avatarEl && (meta.avatar_url || meta.picture)) {
            var picUrl = meta.avatar_url || meta.picture;
            avatarEl.innerHTML = '<img src="' + escapeHtml(picUrl) + '" style="width: 100%; height: 100%; object-fit: cover;" alt="Avatar" />';
          }

          var supportRef = 'SS-' + (currentUser.id ? (currentUser.id.slice(0, 4) + '-' + currentUser.id.slice(-4)).toUpperCase() : 'UNKNOWN');
          var idEl = document.getElementById('userIdShort');
          if (idEl) {
            idEl.innerText = supportRef;
          }

          window.copyAccountId = function() {
            if (navigator.clipboard) {
              navigator.clipboard.writeText(supportRef).then(function() {
                window.showAccountAlert('Support Reference ID copied: ' + supportRef, 'success');
              }).catch(function() {
                window.showAccountAlert('Support ID: ' + supportRef, 'success');
              });
            } else {
              window.showAccountAlert('Support ID: ' + supportRef, 'success');
            }
          };

          // Fetch profile for subscription status & founding member badge
          try {
            var profRes = await supabase
              .from('profiles')
              .select('*')
              .eq('id', currentUser.id)
              .single();

            var profile = profRes ? profRes.data : null;
            var isFounding = Boolean(profile && (profile.is_founding_member || profile.subscription_status === 'lifetime_founding'));
            var isPro = isFounding || Boolean(profile && profile.subscription_status === 'pro');

            var badgeEl = document.getElementById('userBadge');
            var planTitleEl = document.getElementById('planTitle');
            var planDescEl = document.getElementById('planDesc');
            var actionArea = document.getElementById('planActionArea');

            if (badgeEl && planTitleEl && planDescEl) {
              if (isFounding) {
                badgeEl.className = 'badge-founding';
                badgeEl.innerHTML = '🔥 Founding Member · Lifetime Pro';
                planTitleEl.innerHTML = '🔥 Founding Member · Lifetime Pro';
                planTitleEl.style.color = '#fbbf24';
                planDescEl.innerText = 'Founding Member Pass active. Lifetime Pro access with zero recurring subscription fees.';
                if (actionArea) actionArea.innerHTML = '<span style="color: #fbbf24; font-size: 13px; font-weight: 700;">✓ Lifetime Pro Pass (No renewal fees)</span>';
              } else if (isPro) {
                badgeEl.className = 'badge-pro';
                badgeEl.innerHTML = '⭐ Pro Active';
                planTitleEl.innerHTML = '⭐ Pro Active';
                planTitleEl.style.color = '#34d399';
                planDescEl.innerText = 'Active Pro subscriber with multi-platform automated broadcast orchestration and remote control.';
                if (actionArea) actionArea.innerHTML = '<span style="color: #34d399; font-size: 13px; font-weight: 700;">✓ Pro Subscription Active ($12/yr)</span>';
              } else {
                badgeEl.className = 'badge-free';
                badgeEl.innerHTML = 'Free Tier';
                planTitleEl.innerHTML = 'Free Tier';
                planTitleEl.style.color = '#94a3b8';
                planDescEl.innerText = 'Community edition. Stream to multiple platforms with 0% extra CPU directly from OBS.';
                if (actionArea) {
                  var lifetimeUrl = 'https://buy.stripe.com/8x200jdrw4dF03WgSM5EY01?client_reference_id=' + encodeURIComponent(currentUser.id) + '&prefilled_email=' + encodeURIComponent(currentUser.email || '');
                  var annualUrl = 'https://buy.stripe.com/14A4gz2MSbG72c431W5EY00?client_reference_id=' + encodeURIComponent(currentUser.id) + '&prefilled_email=' + encodeURIComponent(currentUser.email || '');
                  actionArea.innerHTML = '<div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;"><a href="' + lifetimeUrl + '" class="btn btn-gold btn-sm" style="display: inline-flex; align-items: center; gap: 6px;">🔥 Claim Lifetime Deal — $5 Once</a><a href="' + annualUrl + '" class="btn btn-secondary btn-sm" style="display: inline-flex; align-items: center; gap: 6px;">Annual $12/yr</a></div>';
                }
              }
            }

            var fName = (profile && profile.first_name) || meta.first_name || '';
            var lName = (profile && profile.last_name) || meta.last_name || '';
            if (!fName && (meta.full_name || meta.name)) {
              var rawName = (meta.full_name || meta.name || '').trim();
              var nameParts = rawName.split(' ');
              fName = nameParts[0] || '';
              lName = nameParts.slice(1).join(' ') || '';
            }

            var fInput = document.getElementById('firstNameInput');
            var lInput = document.getElementById('lastNameInput');
            if (fInput) fInput.value = fName;
            if (lInput) lInput.value = lName;

            var displayName = (fName + ' ' + lName).trim() || meta.full_name || meta.name || currentUser.email || 'Broadcaster';
            var nameEl = document.getElementById('userDisplayName');
            var emailSubEl = document.getElementById('userEmailSub');
            if (nameEl) nameEl.innerText = displayName;
            if (emailSubEl) emailSubEl.innerText = currentUser.email || '';
          } catch (e) {
            console.error('Error fetching profile:', e);
          }

          window.handleUpdateProfile = async function(e) {
            e.preventDefault();
            var btn = document.getElementById('btnSaveProfile');
            var fIn = document.getElementById('firstNameInput');
            var lIn = document.getElementById('lastNameInput');
            var fVal = fIn ? fIn.value.trim() : '';
            var lVal = lIn ? lIn.value.trim() : '';

            if (btn) {
              btn.disabled = true;
              btn.innerText = 'Saving...';
            }

            try {
              var updateRes = await supabase
                .from('profiles')
                .update({
                  first_name: fVal,
                  last_name: lVal,
                  updated_at: new Date().toISOString()
                })
                .eq('id', currentUser.id);

              if (updateRes.error) {
                window.showAccountAlert('Failed to update profile: ' + updateRes.error.message, 'error');
              } else {
                await supabase.auth.updateUser({
                  data: {
                    first_name: fVal,
                    last_name: lVal,
                    full_name: (fVal + ' ' + lVal).trim()
                  }
                });
                var newDisplay = (fVal + ' ' + lVal).trim() || currentUser.email || 'Broadcaster';
                var dEl = document.getElementById('userDisplayName');
                if (dEl) dEl.innerText = newDisplay;
                window.showAccountAlert('✓ Profile details saved successfully!', 'success');
              }
            } catch (err) {
              window.showAccountAlert('Error saving profile: ' + (err.message || err), 'error');
            } finally {
              if (btn) {
                btn.disabled = false;
                btn.innerText = '💾 Save Profile';
              }
            }
          };

          window.handleUpdateEmail = async function(e) {
            e.preventDefault();
            var emailIn = document.getElementById('newEmailInput');
            var newEmail = emailIn ? emailIn.value.trim() : '';
            var btn = document.getElementById('btnUpdateEmail');

            if (!newEmail) return;
            if (newEmail.toLowerCase() === (currentUser.email || '').toLowerCase()) {
              window.showAccountAlert('Please enter a new email address different from your current one.', 'error');
              return;
            }

            if (btn) {
              btn.disabled = true;
              btn.innerText = 'Sending Link...';
            }

            try {
              var res = await supabase.auth.updateUser({ email: newEmail });
              if (res.error) {
                window.showAccountAlert('Error updating email: ' + res.error.message, 'error');
              } else {
                window.showAccountAlert('✉️ Confirmation link sent to <strong>' + escapeHtml(newEmail) + '</strong>. Please check your inbox and click the link to confirm the change.', 'success');
                if (emailIn) emailIn.value = '';
              }
            } catch (err) {
              window.showAccountAlert('Unexpected error updating email: ' + (err.message || err), 'error');
            } finally {
              if (btn) {
                btn.disabled = false;
                btn.innerText = '✉️ Update Email';
              }
            }
          };

          window.startStripeCheckout = async function() {
            var btn = document.getElementById('btnUpgradePro');
            if (btn) {
              btn.disabled = true;
              btn.innerText = 'Redirecting to Stripe...';
            }
            try {
              var sessRes = await supabase.auth.getSession();
              var user = sessRes.data.session ? sessRes.data.session.user : null;
              if (!user) {
                window.location.href = '/login';
                return;
              }
              var basePaymentUrl = 'https://buy.stripe.com/14A4gz2MSbG72c431W5EY00';
              var checkoutUrl = basePaymentUrl + '?client_reference_id=' + encodeURIComponent(user.id) + '&prefilled_email=' + encodeURIComponent(user.email || '');
              window.location.href = checkoutUrl;
            } catch (err) {
              window.showAccountAlert('Error redirecting to Stripe: ' + err.message, 'error');
              if (btn) {
                btn.disabled = false;
                btn.innerText = '⭐ Upgrade to Pro — $12/yr';
              }
            }
          };

          // Handle post-checkout notifications
          var urlQuery = new URLSearchParams(window.location.search);
          if (urlQuery.get('upgraded') === 'true') {
            window.showAccountAlert('🎉 Upgrade successful! Your Simple Streamer Pro license is now active.', 'success');
          } else if (urlQuery.get('canceled') === 'true') {
            window.showAccountAlert('Stripe checkout was canceled. Your account remains on the Free tier.', 'info');
          }

          // Auto-link to OBS Studio if launched from dock session
          var urlParams = new URLSearchParams(window.location.search);
          var dockSession = urlParams.get('session');
          if (!dockSession) {
            try { dockSession = sessionStorage.getItem('simple_streamer_dock_session'); } catch(e) {}
          }
          if (dockSession && session.access_token) {
            fetch('/api/auth-session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId: dockSession,
                token: session.access_token,
                user: { id: session.user?.id, email: session.user?.email }
              })
            }).then(function(res) {
              if (res.ok) {
                try { sessionStorage.removeItem('simple_streamer_dock_session'); } catch(e) {}
                window.showAccountAlert('✨ OBS Studio Linked Automatically! You can switch back to OBS.', 'success');
                fetch('http://127.0.0.1:45455/focus-obs', { mode: 'no-cors' }).catch(function() {});
              }
            }).catch(function(err) {
              console.warn('Auto-link notice:', err);
            });
          }

          // Populate OBS Dock token
          var tokenInput = document.getElementById('dockTokenInput');
          if (tokenInput && session.access_token) {
            tokenInput.value = session.access_token;
          }

          window.copyDockToken = function() {
            if (session && session.access_token) {
              navigator.clipboard.writeText(session.access_token).then(function() {
                var btn = document.getElementById('btnCopyDockToken');
                if (btn) {
                  var orig = btn.innerText;
                  btn.innerText = '✓ Copied!';
                  setTimeout(function() { btn.innerText = orig; }, 2500);
                }
                window.showAccountAlert('License token copied! In your OBS Studio dock, click [⚙] Settings -> [Paste Token] to activate.', 'success');
              }).catch(function() {
                if (tokenInput) {
                  tokenInput.type = 'text';
                  tokenInput.select();
                  document.execCommand('copy');
                  tokenInput.type = 'password';
                  window.showAccountAlert('License token copied! In your OBS Studio dock, click [⚙] Settings -> [Paste Token] to activate.', 'success');
                }
              });
            }
          };

          await window.loadDevices();
        }

        window.loadDevices = async function() {
          var deviceListEl = document.getElementById('deviceList');
          if (!deviceListEl) return;
          deviceListEl.innerHTML = '<div style="color: var(--muted); text-align: center; padding: 24px;">Loading registered devices...</div>';

          try {
            var res = await supabase
              .from('user_devices')
              .select('*')
              .order('last_active_at', { ascending: false });

            if (res.error) {
              deviceListEl.innerHTML = '<div class="alert alert-error">Error loading devices: ' + escapeHtml(res.error.message) + '</div>';
              return;
            }

            var devices = (res.data || []).filter(function(d) {
              if (d && d.hwid && d.hwid.indexOf('obs_dock_') === 0) {
                // Auto-purge legacy synthetic dock entry
                supabase.from('user_devices').delete().eq('id', d.id).then(function() {});
                return false;
              }
              return true;
            });
            var countEl = document.getElementById('deviceSlotCount');
            if (countEl) {
              countEl.innerText = devices.length + ' of 2 Devices Active';
            }

            if (devices.length === 0) {
              deviceListEl.innerHTML = [
                '<div style="text-align: center; padding: 36px 20px; background: #161a26; border-radius: 10px; border: 1px dashed var(--border);">',
                '  <div style="font-size: 36px; margin-bottom: 12px;">💻</div>',
                '  <h3 style="color: #fff; margin-bottom: 6px; font-size: 17px;">No Devices Registered</h3>',
                '  <p style="color: var(--muted); font-size: 14px; max-width: 480px; margin: 0 auto;">',
                '    You do not have any streaming computers linked to this account yet. Launch the Simple Streamer OBS dock or sign in on Windows/Mac to register this machine.',
                '  </p>',
                '</div>'
              ].join('');
              return;
            }

            var html = '';
            for (var i = 0; i < devices.length; i++) {
              var dev = devices[i];
              var rawHwid = dev.hwid || '';
              var hwidSnippet = rawHwid.length > 18 
                ? rawHwid.slice(0, 8) + '...' + rawHwid.slice(-6)
                : (rawHwid || 'Unknown HWID');
              var lastActive = dev.last_active_at 
                ? new Date(dev.last_active_at).toLocaleString() 
                : 'Recently active';
              var devName = dev.device_name || 'Broadcasting Workstation';

              html += [
                '<div class="device-item" id="device-' + escapeHtml(dev.id) + '">',
                '  <div class="device-info">',
                '    <div class="device-icon">🖥️</div>',
                '    <div>',
                '      <div style="font-weight: 700; color: #fff; font-size: 16px; margin-bottom: 4px;">' + escapeHtml(devName) + '</div>',
                '      <div style="font-size: 13px; color: var(--muted); display: flex; gap: 16px; flex-wrap: wrap;">',
                '        <span>HWID: <code style="font-size: 12px;">' + escapeHtml(hwidSnippet) + '</code></span>',
                '        <span>Last Active: <strong style="color: #e2e8f0;">' + escapeHtml(lastActive) + '</strong></span>',
                '      </div>',
                '    </div>',
                '  </div>',
                '  <div>',
                '    <button class="btn btn-danger btn-sm btn-revoke-device" data-id="' + escapeHtml(dev.id) + '" data-name="' + escapeHtml(devName) + '">',
                '      🗑️ Revoke Device',
                '    </button>',
                '  </div>',
                '</div>'
              ].join('');
            }
            deviceListEl.innerHTML = html;

            deviceListEl.onclick = function(e) {
              var btn = e.target.closest('.btn-revoke-device');
              if (btn) {
                var dId = btn.getAttribute('data-id');
                var dName = btn.getAttribute('data-name');
                if (dId) revokeDevice(dId, dName || 'Broadcasting Workstation');
              }
            };
          } catch (err) {
            deviceListEl.innerHTML = '<div class="alert alert-error">Failed to load devices: ' + escapeHtml(err.message || err) + '</div>';
          }
        };

        window.revokeDevice = async function(deviceId, deviceName) {
          if (!confirm('Are you sure you want to revoke \"' + deviceName + '\"?\\n\\nThis will disconnect the workstation and immediately free up an activation slot.')) {
            return;
          }

          var devEl = document.getElementById('device-' + deviceId);
          if (devEl) {
            devEl.style.opacity = '0.4';
            devEl.style.pointerEvents = 'none';
          }

          try {
            var delRes = await supabase
              .from('user_devices')
              .delete()
              .eq('id', deviceId);

            if (delRes.error) {
              alert('Error revoking device: ' + delRes.error.message);
              if (devEl) {
                devEl.style.opacity = '1';
                devEl.style.pointerEvents = 'auto';
              }
            } else {
              window.showAccountAlert('Device revoked successfully. Activation slot freed immediately.', 'success');
              await window.loadDevices();
            }
          } catch (err) {
            alert('Unexpected error revoking device: ' + (err.message || err));
            if (devEl) {
              devEl.style.opacity = '1';
              devEl.style.pointerEvents = 'auto';
            }
          }
        };

        window.handleSignOut = async function() {
          try {
            await supabase.auth.signOut();
          } catch (e) {}
          window.location.replace('/login');
        };

        var urlParams = new URLSearchParams(window.location.search);
        var authCode = urlParams.get('code');
        var hasHashToken = window.location.hash && (window.location.hash.includes('access_token') || window.location.hash.includes('error'));

        function showSessionTimeout() {
          var loadingEl = document.getElementById('accountLoading');
          if (loadingEl && !initialized) {
            loadingEl.innerHTML = [
              '<div style="font-size: 36px; margin-bottom: 16px;">⚠️</div>',
              '<h2 style="margin: 0; color: #fff;">Session Verification Timed Out</h2>',
              '<p style="color: var(--muted); margin-top: 8px; margin-bottom: 20px;">Could not verify your sign in session. Please try signing in again.</p>',
              '<a href="/login" class="btn btn-primary btn-sm">Return to Sign In</a>'
            ].join('');
          }
        }

        async function resolveSession() {
          // 1. Explicitly exchange PKCE authorization code if present
          if (authCode) {
            try {
              var exRes = await supabase.auth.exchangeCodeForSession(authCode);
              if (exRes && exRes.data && exRes.data.session) {
                initDashboard(exRes.data.session);
                return;
              }
            } catch (err) {
              console.warn('PKCE exchange error:', err);
            }
          }

          // 2. Check getSession()
          try {
            var res = await supabase.auth.getSession();
            if (res && res.data && res.data.session) {
              initDashboard(res.data.session);
              return;
            }
          } catch (err) {
            console.warn('getSession error:', err);
          }

          // 3. If there is a hash or auth code in flight, wait up to 4s for auth state change
          if (hasHashToken || authCode) {
            setTimeout(async function() {
              if (!initialized) {
                var retryRes = await supabase.auth.getSession();
                if (retryRes && retryRes.data && retryRes.data.session) {
                  initDashboard(retryRes.data.session);
                } else {
                  showSessionTimeout();
                }
              }
            }, 4000);
            return;
          }

          // 4. No session and no auth params -> redirect to login
          window.location.replace('/login');
        }

        supabase.auth.onAuthStateChange(function(event, session) {
          if (event === 'SIGNED_OUT') {
            window.location.replace('/login');
          } else if (session) {
            initDashboard(session);
          }
        });

        resolveSession();
      })();
    </script>`
  );
}

function homeHtml(): string {
  return layout(
    'Set Title & Description Once, Stream Everywhere from OBS',
    `<div style="text-align: center; margin-bottom: 24px;">
      <div class="badge">OPEN SOURCE</div>
      <h1 style="font-size: 40px; margin-bottom: 18px; line-height: 1.2;">
        Set Your Title & Description Once.
        <br>
        Stream to YouTube, Facebook, Twitch & Kick from 
        <span style="display: inline-flex; align-items: center; gap: 7px; background: #161c28; border: 1px solid #334155; padding: 2px 12px; border-radius: 8px; vertical-align: middle; color: #fff;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12,24C5.383,24,0,18.617,0,12S5.383,0,12,0s12,5.383,12,12S18.617,24,12,24z M12,1.109 C5.995,1.109,1.11,5.995,1.11,12C1.11,18.005,5.995,22.89,12,22.89S22.89,18.005,22.89,12C22.89,5.995,18.005,1.109,12,1.109z M6.182,5.99c0.352-1.698,1.503-3.229,3.05-3.996c-0.269,0.273-0.595,0.483-0.844,0.78c-1.02,1.1-1.48,2.692-1.199,4.156 c0.355,2.235,2.455,4.06,4.732,4.028c1.765,0.079,3.485-0.937,4.348-2.468c1.848,0.063,3.645,1.017,4.7,2.548 c0.54,0.799,0.962,1.736,0.991,2.711c-0.342-1.295-1.202-2.446-2.375-3.095c-1.135-0.639-2.529-0.802-3.772-0.425 c-1.56,0.448-2.849,1.723-3.293,3.293c-0.377,1.25-0.216,2.628,0.377,3.772c-0.825,1.429-2.315,2.449-3.932,2.756 c-1.244,0.261-2.551,0.059-3.709-0.464c1.036,0.302,2.161,0.355,3.191-0.011c1.381-0.457,2.522-1.567,3.024-2.935 c0.556-1.49,0.345-3.261-0.591-4.54c-0.7-1.007-1.803-1.717-3.002-1.969c-0.38-0.068-0.764-0.098-1.148-0.134 c-0.611-1.231-0.834-2.66-0.528-3.996L6.182,5.99z"/>
          </svg>
          OBS
        </span>
      </h1>
      <p style="font-size: 20px; color: #9ca3af; max-width: 680px; margin: 0 auto 32px;">
        Stop opening 4 browser tabs just to copy-paste your stream details. Type your title and description once in OBS—Simple Streamer updates every platform and starts your broadcast with one click.
      </p>

      <div class="hero-ctas">
        <div class="cta-row">
          <a id="primaryDownloadBtn" href="https://github.com/midimahdi/simple-streamer/releases/latest" class="btn btn-primary">
            ⬇️ Download Free (OBS 30+)
          </a>
          <a href="https://github.com/midimahdi/simple-streamer" target="_blank" class="btn btn-secondary">
            ⭐ View on GitHub
          </a>
        </div>
        <div class="sub-download" id="subDownloadOptions">
          <span>Free & Open Source · For </span>
          <a href="https://github.com/midimahdi/simple-streamer/releases/latest/download/SimpleStreamer-Setup.exe">Windows 10/11 (.exe)</a> · 
          <a href="https://github.com/midimahdi/simple-streamer/releases/latest/download/SimpleStreamer-Setup.dmg">macOS (.dmg)</a> · 
          <a href="#compatibility">OBS 30.0+</a>
        </div>
      </div>
    </div>

    <!-- Founding 100 Lifetime Pass ($5 One-Time) -->
    <div class="founding-banner" id="foundingBanner">
      <div id="foundingSlotLiveText" style="display: inline-block; background: #161a24; border: 1px solid #2d3748; color: #fbbf24; padding: 5px 14px; border-radius: 6px; font-size: 13px; font-weight: 700; margin-bottom: 14px; letter-spacing: 0.2px;">
        Founding Member Tier · Limited to First 100 Broadcasters
      </div>
      <h2 id="foundingHeadline">$5 Lifetime Access (First 100 Streamers)</h2>
      <p style="max-width: 640px; margin: 0 auto 20px; font-size: 15px; color: #fde68a; line-height: 1.5;">
        Lock in permanent Pro access for a single \$5 payment. No recurring bills. The first 100 broadcasters get lifetime 1-click broadcast creation, unified titles & descriptions across all 4 platforms, mid-stream title & description updates, and mobile cloud remote.
      </p>
      <div style="display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; align-items: center;">
        <a id="btnFoundingClaim" href="https://buy.stripe.com/8x200jdrw4dF03WgSM5EY01" class="btn btn-gold" style="font-size: 16px; padding: 14px 28px;">
          ⚡ Claim Lifetime Pass — $5 Once →
        </a>
        <a href="https://github.com/midimahdi/simple-streamer/releases/latest" class="btn btn-secondary">
          Download Free Core
        </a>
      </div>
      <div id="foundingSubtext" style="font-size: 13px; color: #fbbf24; margin-top: 14px; opacity: 0.95;">
        🔒 Use the same email at Stripe checkout to automatically activate your OBS dock license.
      </div>
    </div>

    <!-- Feature Comparison Matrix -->
    <div class="card" style="padding: 32px 28px; margin-bottom: 36px;">
      <div style="margin-bottom: 24px; text-align: center;">
        <h2 style="font-size: 26px; font-weight: 800; margin: 0 0 6px; color: #fff;">Compare Free vs. Pro Tiers</h2>
        <p style="color: var(--muted); font-size: 15px; margin: 0;">Both tiers share the same core engine: zero re-encoding overhead, zero forced watermarks, and unlimited stream destinations.</p>
      </div>

      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="width: 48%; text-align: left; padding: 16px 18px; color: #94a3b8; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid var(--border);">Capability</th>
              <th style="width: 26%; text-align: center; padding: 16px 18px; border-bottom: 2px solid var(--border);">
                <div style="font-size: 17px; font-weight: 800; color: #fff;">Simple Streamer Free</div>
              </th>
              <th style="width: 26%; text-align: center; padding: 16px 18px; background: rgba(59, 130, 246, 0.08); border-top: 2px solid var(--accent); border-bottom: 2px solid var(--accent); border-left: 1px solid rgba(59, 130, 246, 0.3); border-right: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px 8px 0 0;">
                <div style="font-size: 17px; font-weight: 800; color: #60a5fa;">Simple Streamer Pro</div>
              </th>
            </tr>
          </thead>
          <tbody>
            <!-- Core 4 Decisive Features -->
            <tr>
              <td style="padding: 14px 18px; font-size: 14px; border-bottom: 1px solid var(--border); color: #e2e8f0;">
                <strong>Title & Description Sync</strong>
                <div style="font-size: 12px; color: var(--muted); margin-top: 2px;">Type once in OBS—auto-syncs your title and description when going live</div>
              </td>
              <td style="text-align: center; padding: 14px 18px; border-bottom: 1px solid var(--border); color: #fff; font-size: 13px; font-weight: 700;">Kick & Twitch</td>
              <td style="text-align: center; padding: 14px 18px; border-bottom: 1px solid var(--border); background: rgba(59, 130, 246, 0.04); border-left: 1px solid rgba(59, 130, 246, 0.2); border-right: 1px solid rgba(59, 130, 246, 0.2); color: #60a5fa; font-size: 13px; font-weight: 700;">Kick, Twitch, YouTube & Facebook</td>
            </tr>
            <tr>
              <td style="padding: 14px 18px; font-size: 14px; border-bottom: 1px solid var(--border); color: #e2e8f0;">
                <strong>Mid-Stream Title & Description Updates</strong>
                <div style="font-size: 12px; color: var(--muted); margin-top: 2px;">Update your title and description while live without opening a browser</div>
              </td>
              <td style="text-align: center; padding: 14px 18px; border-bottom: 1px solid var(--border); color: var(--muted); font-size: 16px;">—</td>
              <td style="text-align: center; padding: 14px 18px; border-bottom: 1px solid var(--border); background: rgba(59, 130, 246, 0.04); border-left: 1px solid rgba(59, 130, 246, 0.2); border-right: 1px solid rgba(59, 130, 246, 0.2); color: #34d399; font-size: 18px; font-weight: 700;">✓</td>
            </tr>
            <tr>
              <td style="padding: 14px 18px; font-size: 14px; border-bottom: 1px solid var(--border); color: #e2e8f0;">
                <strong>Mobile Phone Remote Control</strong>
                <div style="font-size: 12px; color: var(--muted); margin-top: 2px;">Update title and description, monitor preview, and go live from your phone</div>
              </td>
              <td style="text-align: center; padding: 14px 18px; border-bottom: 1px solid var(--border); color: #fff; font-size: 13px;">Local Wi-Fi Only</td>
              <td style="text-align: center; padding: 14px 18px; border-bottom: 1px solid var(--border); background: rgba(59, 130, 246, 0.04); border-left: 1px solid rgba(59, 130, 246, 0.2); border-right: 1px solid rgba(59, 130, 246, 0.2); color: #60a5fa; font-weight: 700;">✓ Wi-Fi + Cellular Cloud</td>
            </tr>
            <tr>
              <td style="padding: 14px 18px; font-size: 14px; border-bottom: 1px solid var(--border); color: #e2e8f0;">
                <strong>Multi-Platform Stream Destinations</strong>
                <div style="font-size: 12px; color: var(--muted); margin-top: 2px;">Broadcast to multiple platforms at once with zero extra CPU re-encoding</div>
              </td>
              <td style="text-align: center; padding: 14px 18px; border-bottom: 1px solid var(--border); color: #fff; font-size: 13px;">Kick, Twitch & Custom RTMP</td>
              <td style="text-align: center; padding: 14px 18px; border-bottom: 1px solid var(--border); background: rgba(59, 130, 246, 0.04); border-left: 1px solid rgba(59, 130, 246, 0.2); border-right: 1px solid rgba(59, 130, 246, 0.2); color: #60a5fa; font-weight: 700;">✓ Kick, Twitch, YouTube, FB & RTMP</td>
            </tr>
          </tbody>

          <!-- Collapsible Detailed Technical Breakdown -->
          <tbody id="detailedSpecsBody" style="display: none;">
            <tr>
              <td style="padding: 14px 18px; font-size: 14px; border-bottom: 1px solid var(--border); color: #e2e8f0;">
                <strong>Direct Custom RTMP Ingest</strong>
                <div style="font-size: 12px; color: var(--muted); margin-top: 2px;">Stream to any private server or CDN without account dependencies or watermarks</div>
              </td>
              <td style="text-align: center; padding: 14px 18px; border-bottom: 1px solid var(--border); color: #34d399; font-weight: 700;">✓ Unlimited</td>
              <td style="text-align: center; padding: 14px 18px; border-bottom: 1px solid var(--border); background: rgba(59, 130, 246, 0.04); border-left: 1px solid rgba(59, 130, 246, 0.2); border-right: 1px solid rgba(59, 130, 246, 0.2); color: #34d399; font-weight: 700;">✓ Unlimited</td>
            </tr>
            <tr>
              <td style="padding: 14px 18px; font-size: 14px; border-bottom: 1px solid var(--border); color: #e2e8f0;">
                <strong>Non-Destructive OBS Profile Restore</strong>
                <div style="font-size: 12px; color: var(--muted); margin-top: 2px;">Snapshots & restores your manual OBS settings on teardown</div>
              </td>
              <td style="text-align: center; padding: 14px 18px; border-bottom: 1px solid var(--border); color: #34d399; font-size: 18px;">✓</td>
              <td style="text-align: center; padding: 14px 18px; border-bottom: 1px solid var(--border); background: rgba(59, 130, 246, 0.04); border-left: 1px solid rgba(59, 130, 246, 0.2); border-right: 1px solid rgba(59, 130, 246, 0.2); color: #34d399; font-size: 18px;">✓</td>
            </tr>
            <tr>
              <td style="padding: 14px 18px; font-size: 14px; border-bottom: 1px solid var(--border); color: #e2e8f0;">
                <strong>Real-Time Bitrate Telemetry Dock</strong>
                <div style="font-size: 12px; color: var(--muted); margin-top: 2px;">Live connection states, output FPS & dropped frame stats</div>
              </td>
              <td style="text-align: center; padding: 14px 18px; border-bottom: 1px solid var(--border); color: #34d399; font-size: 18px;">✓</td>
              <td style="text-align: center; padding: 14px 18px; border-bottom: 1px solid var(--border); background: rgba(59, 130, 246, 0.04); border-left: 1px solid rgba(59, 130, 246, 0.2); border-right: 1px solid rgba(59, 130, 246, 0.2); color: #34d399; font-size: 18px;">✓</td>
            </tr>
            <tr>
              <td style="padding: 14px 18px; font-size: 14px; border-bottom: 1px solid var(--border); color: #e2e8f0;">
                <strong>Multi-Rig Setup Sync</strong>
                <div style="font-size: 12px; color: var(--muted); margin-top: 2px;">Sync channel presets and targets between streaming PC & laptop</div>
              </td>
              <td style="text-align: center; padding: 14px 18px; border-bottom: 1px solid var(--border); color: var(--muted); font-size: 13px;">Local Storage</td>
              <td style="text-align: center; padding: 14px 18px; border-bottom: 1px solid var(--border); background: rgba(59, 130, 246, 0.04); border-left: 1px solid rgba(59, 130, 246, 0.2); border-right: 1px solid rgba(59, 130, 246, 0.2); color: #60a5fa; font-weight: 700;">✓ Cloud Synced</td>
            </tr>
            <tr>
              <td style="padding: 14px 18px; font-size: 14px; border-bottom: 1px solid var(--border); color: #e2e8f0;">
                <strong>Authorized Hardware Workstations</strong>
                <div style="font-size: 12px; color: var(--muted); margin-top: 2px;">Simultaneous streaming machines per license</div>
              </td>
              <td style="text-align: center; padding: 14px 18px; border-bottom: 1px solid var(--border); color: #fff; font-weight: 600;">1 Machine</td>
              <td style="text-align: center; padding: 14px 18px; border-bottom: 1px solid var(--border); background: rgba(59, 130, 246, 0.04); border-left: 1px solid rgba(59, 130, 246, 0.2); border-right: 1px solid rgba(59, 130, 246, 0.2); color: #60a5fa; font-weight: 700;">2 Workstations</td>
            </tr>
          </tbody>

          <!-- Expand / Collapse Toggle Bar -->
          <tbody>
            <tr>
              <td colspan="3" style="text-align: center; padding: 12px 18px; border-bottom: none; background: rgba(255, 255, 255, 0.02);">
                <button id="btnToggleDetails" type="button" onclick="toggleDetailedSpecs()" style="background: none; border: none; color: #60a5fa; cursor: pointer; font-size: 13px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px;">
                  <span id="toggleDetailsIcon">↓</span> <span id="toggleDetailsText">Show More</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style="margin-top: 18px; padding: 12px 16px; background: rgba(59, 130, 246, 0.05); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 8px; font-size: 13px; color: #94a3b8; text-align: left; line-height: 1.5;">
        <strong style="color: #60a5fa;">💡 Bandwidth Transparency:</strong> 
        Because Simple Streamer broadcasts directly from your PC without cloud proxy servers, your network sends a direct stream to each platform. We recommend ~6 Mbps upload per 1080p60 destination (e.g., ~12 Mbps upload for 2 platforms, ~24 Mbps upload for 4 platforms).
      </div>
    </div>

    <!-- Restream vs Simple Streamer 3-Point Callout Card -->
    <div class="card" style="padding: 24px 28px; margin-bottom: 36px; border-left: 3px solid var(--accent);">
      <h2 style="font-size: 20px; font-weight: 800; margin: 0 0 8px; color: #fff;">Why Not Cloud Restreamers (Restream.io / Castr)?</h2>
      <p style="color: #94a3b8; font-size: 14px; margin: 0 0 20px;">
        Cloud relay services charge \$228 to \$588/year to take your RTMP stream and relay it through their cloud servers. Simple Streamer keeps your stream direct and local:
      </p>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px;">
        <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border); border-radius: 8px; padding: 16px;">
          <div style="color: #60a5fa; font-weight: 700; font-size: 15px; margin-bottom: 6px;">⚡ Direct Platform Ingest</div>
          <div style="color: #94a3b8; font-size: 13px; line-height: 1.5;">Direct broadcast to YouTube, Twitch & Facebook without adding an intermediate 2–5s cloud relay transcode hop.</div>
        </div>
        <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border); border-radius: 8px; padding: 16px;">
          <div style="color: #34d399; font-weight: 700; font-size: 15px; margin-bottom: 6px;">💰 \$228–\$588/yr Saved</div>
          <div style="color: #94a3b8; font-size: 13px; line-height: 1.5;">Free forever for core streaming or \$5 once for the founding pass, eliminating recurring monthly subscription fees.</div>
        </div>
        <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border); border-radius: 8px; padding: 16px;">
          <div style="color: #f59e0b; font-weight: 700; font-size: 15px; margin-bottom: 6px;">📝 Unified Broadcast Info</div>
          <div style="color: #94a3b8; font-size: 13px; line-height: 1.5;">Set your title, description, and game category once inside OBS—no more opening 4 separate browser dashboards every stream.</div>
        </div>
      </div>
    </div>

    <!-- Technical Compatibility & Frequently Asked Questions -->
    <div class="card" id="compatibility" style="margin-bottom: 36px;">
      <h2 style="font-size: 22px; font-weight: 800; margin-bottom: 20px; color: #fff;">Technical Specifications & FAQ</h2>
      
      <div class="faq-item">
        <div class="faq-question">Which OBS versions and Operating Systems are supported?</div>
        <div class="faq-answer">
          Simple Streamer is built for <strong>OBS Studio 30.0 or higher</strong> on <strong>Windows 10/11 (64-bit)</strong> and <strong>macOS (Apple Silicon M1-M4 & Intel)</strong>. Linux broadcasters can run the open-source browser dock natively inside OBS Linux.
        </div>
      </div>

      <div class="faq-item">
        <div class="faq-question">Will Windows SmartScreen or macOS Gatekeeper show a security warning?</div>
        <div class="faq-answer">
          As an independent, open-source community tool without an expensive commercial EV code-signing certificate, Windows or macOS may display a standard unrecognized publisher prompt on initial setup. You can safely click <em>"More info → Run anyway"</em> on Windows or right-click <em>"Open"</em> on macOS. Every line of source code is 100% auditable on GitHub.
        </div>
      </div>

      <div class="faq-item">
        <div class="faq-question">How does Pro license activation work after Stripe checkout?</div>
        <div class="faq-answer">
          Enter the same email address at Stripe checkout that you use to log into your Simple Streamer account. Your license activates immediately. When you open your OBS dock or login on the web portal, your Pro status is instantly recognized.
        </div>
      </div>

      <div class="faq-item">
        <div class="faq-question">What data touches your cloud versus staying on my local computer?</div>
        <div class="faq-answer">
          <strong>Your video bitstream never routes through our servers</strong>—it flows directly from your OBS encoder to YouTube, Twitch, Facebook, and Kick. Platform connection credentials stay stored locally on your PC. Our Cloud Run backend is used strictly to create scheduled YouTube broadcasts, sync your titles and descriptions across platforms, and relay mobile remote commands from your phone.
        </div>
      </div>

      <div class="faq-item">
        <div class="faq-question">Why is there a paid option if it is open source?</div>
        <div class="faq-answer">
          Simple Streamer Core is free and open-source under GPL-2.0. The paid option helps sustain hosted cloud infrastructure: verified Google and Meta API quotas for automated 1-click broadcast creation, multi-platform title and description synchronization, and secure TURN signaling relays for cellular mobile remote control.
        </div>
      </div>
    </div>

    <!-- Quick Architecture Overview -->
    <div class="card card-highlight">
      <h2>Built for Streamers, Gamers & Organizations</h2>
      <p>
        Simple Streamer is built for creators, gamers, and organizations who want multi-platform reach across YouTube, Twitch, Facebook, and Kick without expensive cloud subscriptions, lag, or complicated multi-PC setups.
      </p>
      <ul>
        <li><strong>Native OBS Integration:</strong> Runs as a dock inside OBS Studio. No separate browser tabs or external software required during your stream.</li>
        <li><strong>Unified Broadcast Titles & Automation:</strong> Set your stream title, description, and game category once inside OBS. Simple Streamer creates your YouTube broadcast, configures Facebook Live, and sets Twitch and Kick stream info automatically with a single click.</li>
        <li><strong>Self-Contained Executable:</strong> Packaged as a clean installer for Windows and macOS. Installs with zero manual driver compilation or Python scripts.</li>
      </ul>
      <div style="margin-top: 24px;">
        <a href="https://github.com/midimahdi/simple-streamer" target="_blank" class="btn btn-secondary">
          Explore Architecture on GitHub →
        </a>
      </div>
    </div>

    <script>
      (function() {
        const btn = document.getElementById('primaryDownloadBtn');
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0 || navigator.userAgent.toUpperCase().indexOf('MAC') >= 0;
        const isWin = navigator.platform.toUpperCase().indexOf('WIN') >= 0 || navigator.userAgent.toUpperCase().indexOf('WINDOWS') >= 0;
        
        if (btn) {
          if (isMac) {
            btn.innerHTML = '⬇️ Download for macOS (.dmg)';
            btn.href = 'https://github.com/midimahdi/simple-streamer/releases/latest/download/SimpleStreamer-Setup.dmg';
          } else if (isWin) {
            btn.innerHTML = '⬇️ Download for Windows (.exe)';
            btn.href = 'https://github.com/midimahdi/simple-streamer/releases/latest/download/SimpleStreamer-Setup.exe';
          }
        }

        function updateFoundingSlots() {
          fetch('/api/founding-slots')
            .then(function(res) { return res.json(); })
            .then(function(data) {
              if (data && typeof data.remaining_slots === 'number') {
                var textEl = document.getElementById('foundingSlotLiveText');
                var btnEl = document.getElementById('btnFoundingClaim');
                var subtextEl = document.getElementById('foundingSubtext');
                var headlineEl = document.getElementById('foundingHeadline');

                if (data.remaining_slots <= 0) {
                  if (textEl) textEl.innerHTML = 'Founding 100 Passes Sold Out';
                  if (headlineEl) headlineEl.innerText = 'Founding 100 Lifetime Deal Closed';
                  if (btnEl) {
                    btnEl.className = 'btn btn-secondary';
                    btnEl.innerText = 'Sold Out ($12/yr Available)';
                    btnEl.href = '/login';
                  }
                  if (subtextEl) subtextEl.innerText = 'All 100 founding slots claimed. Regular subscription is $12/year.';
                } else if (data.remaining_slots <= 25) {
                  if (textEl) textEl.innerHTML = '⚡ Only ' + data.remaining_slots + ' of 100 Founding Passes Remaining';
                } else {
                  if (textEl) textEl.innerHTML = 'Founding Member Tier · Limited to First 100 Broadcasters';
                }
              }
            })
            .catch(function(e) {
              console.warn('Could not refresh founding slots:', e);
            });
        }
        updateFoundingSlots();
        setInterval(updateFoundingSlots, 20000);
      })();

      window.toggleDetailedSpecs = function() {
        var el = document.getElementById('detailedSpecsBody');
        var text = document.getElementById('toggleDetailsText');
        var icon = document.getElementById('toggleDetailsIcon');
        if (!el) return;
        if (el.style.display === 'none' || el.style.display === '') {
          el.style.display = 'table-row-group';
          if (text) text.innerText = 'Show Less';
          if (icon) icon.innerText = '↑';
        } else {
          el.style.display = 'none';
          if (text) text.innerText = 'Show More';
          if (icon) icon.innerText = '↓';
        }
      };
    </script>`
  );
}

function privacyPolicyHtml(): string {
  return layout(
    'Privacy Policy',
    `<h1>Privacy Policy</h1>
    <p style="color: #9ca3af; margin-bottom: 24px;">Last updated: November 4, 2026</p>

    <div class="card card-highlight">
      <p>
        <strong>Simple Streamer</strong> ("we", "our", or "the Application"), operated by <strong>MAHDI DIGITAL LLC</strong>, is an independent, open-source live broadcast orchestration tool embedded inside OBS Studio. This Privacy Policy details our strict adherence to data privacy, transparency, and minimal data access principles.
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
      <p style="margin-bottom: 0;">
        Simple Streamer's use and transfer to any other app of information received from Google APIs adheres to the 
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener" style="color: #60a5fa; font-weight: 600;">Google API Services User Data Policy</a>, 
        including the <strong>Limited Use</strong> requirements. We do not use Google user data for advertising, market research, or training artificial intelligence / machine learning models.
      </p>
    </div>

    <h2>4. Data Retention & Deletion</h2>
    <p>
      Because Simple Streamer does not store user data or broadcast keys on centralized servers, you maintain 100% control over your data at all times:
    </p>
    <ul>
      <li><strong>Immediate Local Revocation:</strong> Disconnecting a destination inside the Simple Streamer OBS dock instantly purges all associated tokens and RTMP keys from your machine.</li>
      <li><strong>Third-Party Permission Revocation:</strong> You can permanently revoke Simple Streamer's access at any moment via your Google Account Permissions (<code>myaccount.google.com/permissions</code>) or Facebook Business Integrations settings.</li>
      <li>For step-by-step instructions on permanently removing all credentials, visit our <a href="/data-deletion" style="color: #60a5fa;">Data Deletion Instructions</a> page.</li>
    </ul>

    <h2>5. Security Standards</h2>
    <p>
      All communication between OBS Studio, the Cloud Run relay backend, and platform APIs is strictly encrypted using TLS 1.3 / HTTPS. Transient authorization codes are ephemeral, memory-only, and automatically expire within 10 minutes if not redeemed.
    </p>

    <h2>6. Changes to this Policy</h2>
    <p>
      We may update our Privacy Policy to reflect changes in platform APIs or regulatory requirements. Any updates will be posted to this URL with a revised "Last updated" date.
    </p>

    <h2>7. Contact & Operator Identity</h2>
    <p>
      Simple Streamer is developed and maintained by:
    </p>
    <div class="card">
      <p style="margin: 0;">
        <strong>MAHDI DIGITAL LLC</strong><br />
        Contact Email: <a href="mailto:Midimahdi6@gmail.com" style="color: #60a5fa;">Midimahdi6@gmail.com</a><br />
        Project Repository: <a href="https://github.com/midimahdi/simple-streamer" target="_blank" rel="noopener" style="color: #60a5fa;">github.com/midimahdi/simple-streamer</a>
      </p>
    </div>`
  );
}

function dataDeletionHtml(): string {
  return layout(
    'User Data Deletion Instructions',
    `<h1>User Data Deletion Instructions</h1>
    <p style="color: #9ca3af; margin-bottom: 24px;">Last updated: November 4, 2026</p>

    <div class="card card-highlight">
      <p style="margin-bottom: 0;">
        Simple Streamer is designed with a <strong>Stateless & Zero-Server-Storage Architecture</strong>. We do not store your name, email, credentials, stream keys, or broadcasting history on any cloud database or server.
      </p>
    </div>

    <p>
      In accordance with Facebook Platform Rules and Google API User Data Policies, this page provides explicit instructions on how to permanently delete or revoke Simple Streamer credentials and permissions from your third-party accounts and local OBS installation.
    </p>

    <h2>1. Google & YouTube Data Deletion / Revocation</h2>
    <p>
      To revoke Simple Streamer's access to your YouTube channel:
    </p>
    
    <div class="instruction-card">
      <div class="instruction-header">
        <span class="platform-tag tag-youtube">YouTube</span>
        <h3>Revoking Google Account Permissions</h3>
      </div>
      <ol class="step-list">
        <li>Navigate to your Google Account Security Dashboard: <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener" style="color: #60a5fa;">https://myaccount.google.com/permissions</a></li>
        <li>Scroll down to the <strong>"Third-party apps with account access"</strong> section.</li>
        <li>Select <strong>Simple Streamer</strong> from the list of authorized applications.</li>
        <li>Click <strong>"Remove Access"</strong> (or <strong>"Delete all connections"</strong>) and confirm.</li>
        <li>Google will immediately invalidate all OAuth tokens issued to Simple Streamer. The app will no longer be able to access your YouTube channel or create live streams.</li>
      </ol>
    </div>

    <h2>2. Meta & Facebook Live Data Deletion / Revocation</h2>
    <p>
      To revoke Simple Streamer's access to your Facebook Pages:
    </p>

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

    <h2>3. Purging Local Tokens & OBS Cache</h2>
    <p>
      All OAuth tokens retrieved by Simple Streamer are held strictly in your local computer's storage within OBS Studio:
    </p>
    
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
