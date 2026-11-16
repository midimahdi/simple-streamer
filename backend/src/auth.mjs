/**
 * Simple Streamer Backend - Supabase Authentication & Device Middleware
 *
 * Zero-weight implementation using standard Node 20+ fetch API.
 * Validates Supabase JWT sessions and manages hardware device slots (max 2 active devices).
 */

export const SUPABASE_URL = process.env.SUPABASE_URL || 'https://uqxlgyhmbhzeyfcgxxji.supabase.co';
export const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxeGxneWhtYmh6ZXlmY2d4eGppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ2ODYxNzgsImV4cCI6MjExMDI2MjE3OH0.nr6UxjL7D_EhSfzHir_O4602yEE8aks-S6Wj2b7hR8Q';
export const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxeGxneWhtYmh6ZXlmY2d4eGppIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NDY4NjE3OCwiZXhwIjoyMTEwMjYyMTc4fQ.Fz_SxexMF9k3CrgP3wr_SzJFBRUH63G_r-BGSJv48dw';

export const PRO_REQUIRED_ERROR = {
  error: 'PRO_REQUIRED',
  message: 'Automated YouTube & Facebook live sync requires Simple Streamer Pro. Switch to Stream Key mode or log in to a Pro account.',
};

export const DEVICE_LIMIT_REACHED_ERROR = {
  error: 'DEVICE_LIMIT_REACHED',
  message: 'Device limit reached (max 2 active devices). Deactivate a machine at https://simple-streamer.bdjlmn.com/account',
};

/**
 * Checks if a subscription status qualifies as Pro / Founding 100 entitlement.
 * @param {string} status
 * @returns {boolean}
 */
export function isProSubscription(status, isFounding = false) {
  return isFounding === true || status === 'pro' || status === 'lifetime_founding';
}

/**
 * Verifies a Supabase auth JWT by calling /auth/v1/user.
 *
 * @param {string} authHeader - Raw Authorization header (e.g. 'Bearer <token>') or raw token string.
 * @returns {Promise<{ user: object|null, error: string|null }>}
 */
export async function verifySession(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') {
    return { user: null, error: 'Missing or invalid authorization header' };
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return { user: null, error: 'Empty authorization token' };
  }

  // Direct Stripe Checkout Session instant activation (activates OBS before account registration)
  if (token.startsWith('cs_')) {
    try {
      const entRes = await fetch(`${SUPABASE_URL}/rest/v1/prepaid_entitlements?stripe_session_id=eq.${encodeURIComponent(token)}&select=*`, {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      });
      if (entRes.ok) {
        const rows = await entRes.json();
        if (rows && rows.length > 0) {
          const ent = rows[0];
          return {
            user: {
              id: token,
              email: ent.email || 'Founding Broadcaster',
              is_prepaid_stripe: true,
              is_founding_member: Boolean(ent.is_founding),
              tier: ent.tier || 'lifetime_founding',
            },
            error: null,
          };
        }
      }

      // Webhook hasn't landed yet? Query Stripe API on demand
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (stripeKey) {
        const sRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(token)}`, {
          headers: { Authorization: `Bearer ${stripeKey}` },
        });
        if (sRes.ok) {
          const s = await sRes.json();
          if (s && s.payment_status === 'paid') {
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
                stripe_session_id: token,
              }),
            }).catch(() => {});

            return {
              user: {
                id: token,
                email: customerEmail || 'Founding Broadcaster',
                is_prepaid_stripe: true,
                is_founding_member: isLifetime,
                tier: subStatus,
              },
              error: null,
            };
          }
        }
      }
    } catch (e) {
      console.warn('[verifySession] Error checking prepaid Stripe session:', e);
    }
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
    });

    if (!res.ok) {
      let errorMsg = `Supabase auth returned ${res.status}`;
      try {
        const body = await res.json();
        errorMsg = body.msg || body.message || body.error_description || body.error || errorMsg;
      } catch {
        // Fallback for non-JSON responses
      }
      return { user: null, error: errorMsg };
    }

    const user = await res.json();
    return { user, error: null };
  } catch (err) {
    return { user: null, error: err.message };
  }
}

/**
 * Calls validate_and_register_device RPC via Supabase PostgREST API using the Service Role Key.
 * Checks whether the user can register/use this device (max 2 active devices) and returns subscription status.
 *
 * @param {string} userId - Supabase user UUID
 * @param {string} hwid - Hardware ID / machine fingerprint
 * @param {string} [deviceName] - User-friendly machine name (e.g. "OBS Studio - Studio PC")
 * @returns {Promise<{ allowed: boolean, status?: string, error?: string, subscription_status?: string, is_founding_member?: boolean, device_count?: number, max_devices?: number, isPro?: boolean }>}
 */
export async function checkDeviceAndEntitlement(userId, hwid, deviceName = 'Simple Streamer Desktop') {
  if (!userId) {
    return { allowed: false, error: 'missing_user_id' };
  }

  // Instant direct entitlement for prepaid Stripe Checkout session tokens
  if (typeof userId === 'string' && userId.startsWith('cs_')) {
    return {
      allowed: true,
      status: 'active',
      isPro: true,
      is_founding_member: true,
      subscription_status: 'lifetime_founding',
      device_count: 1,
      max_devices: 2,
    };
  }

  const cleanHwid = typeof hwid === 'string' ? hwid.trim() : '';
  if (!cleanHwid || cleanHwid.length < 8 || cleanHwid === 'default-hwid' || cleanHwid.startsWith('obs_dock_')) {
    return {
      allowed: false,
      error: 'invalid_hwid',
      message: 'Valid hardware device identifier (min 8 characters) required.',
    };
  }

  try {
    // Proactively purge any legacy synthetic obs_dock_ records for this user
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/user_devices?user_id=eq.${encodeURIComponent(userId)}&hwid=like.obs_dock_*`, {
        method: 'DELETE',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      });
    } catch (_) {}

    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/validate_and_register_device`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_user_id: userId,
        p_hwid: cleanHwid,
        p_device_name: deviceName || 'Simple Streamer Desktop',
      }),
    });

    if (!res.ok) {
      let errorText = `RPC request failed with status ${res.status}`;
      try {
        const errJson = await res.json();
        errorText = errJson.message || errJson.error || errorText;
      } catch {
        // Fallback for non-JSON responses
      }
      return { allowed: false, error: errorText };
    }

    const data = await res.json();
    const isFounding = Boolean(data?.is_founding_member || data?.subscription_status === 'lifetime_founding');
    const isPro = isProSubscription(data?.subscription_status, isFounding);
    return {
      ...data,
      is_founding_member: isFounding,
      isPro,
    };
  } catch (err) {
    return { allowed: false, error: err.message };
  }
}

/**
 * Determines whether the broadcast request includes automated YouTube or Facebook OAuth.
 * Pure Twitch, Kick, or Stream-Key destinations pass freely without requiring Pro auth or device checks.
 *
 * @param {object} body - Incoming JSON body of /orchestrate-live
 * @returns {boolean}
 */
export function isAutomatedOAuthRequested(body) {
  if (!body || typeof body !== 'object') return false;

  // Multi-destination format
  if (Array.isArray(body.destinations) && body.destinations.length > 0) {
    const active = body.destinations.filter((d) => d && d.enabled !== false);
    for (const rawD of active) {
      const d = { ...(rawD.credentials || {}), ...rawD };
      const platform = (d.platform || '').toLowerCase();

      if (platform === 'youtube') {
        const isStreamKeyMode =
          d.mode === 'streamKey' ||
          d.mode === 'stream_key' ||
          Boolean(d.streamKey && !d.refreshToken);
        if (!isStreamKeyMode) {
          return true;
        }
      }

      if (platform === 'facebook') {
        const isStreamKeyMode =
          d.mode === 'streamKey' ||
          d.mode === 'stream_key' ||
          Boolean(d.streamKey && !d.accessToken);
        if (!isStreamKeyMode) {
          return true;
        }
      }
    }
    return false;
  }

  // Legacy single-destination format (body.youtube, body.facebook)
  if (body.youtube && typeof body.youtube === 'object') {
    const isStreamKey =
      body.youtube.mode === 'streamKey' ||
      body.youtube.mode === 'stream_key' ||
      Boolean(body.youtube.streamKey && !body.youtube.refreshToken);
    if (!isStreamKey && (body.youtube.refreshToken || body.youtube.streamId)) {
      return true;
    }
  }

  if (body.facebook && typeof body.facebook === 'object') {
    const isStreamKey =
      body.facebook.mode === 'streamKey' ||
      body.facebook.mode === 'stream_key' ||
      Boolean(body.facebook.streamKey && !body.facebook.accessToken);
    if (!isStreamKey && (body.facebook.accessToken || body.facebook.pageId)) {
      return true;
    }
  }

  return false;
}

/**
 * Merges two arrays of presets by unique ID.
 * If a preset exists in both lists, the one with the newer updated_at timestamp wins.
 *
 * @param {Array} listA
 * @param {Array} listB
 * @returns {Array}
 */
export function mergePresets(listA = [], listB = []) {
  const map = new Map();
  const all = [...(Array.isArray(listA) ? listA : []), ...(Array.isArray(listB) ? listB : [])];
  for (const item of all) {
    if (!item || !item.id) continue;
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
    } else {
      const existingTime = new Date(existing.updated_at || 0).getTime();
      const itemTime = new Date(item.updated_at || 0).getTime();
      if (itemTime >= existingTime) {
        map.set(item.id, item);
      }
    }
  }
  return Array.from(map.values());
}

/**
 * Retrieves the stored broadcast presets for a user from Supabase.
 *
 * @param {string} userId
 * @returns {Promise<Array>}
 */
export async function getUserPresets(userId) {
  if (!userId) return [];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=broadcast_presets`, {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows[0]?.broadcast_presets) ? rows[0].broadcast_presets : [];
  } catch {
    return [];
  }
}

/**
 * Saves broadcast presets to the user's Supabase profile.
 *
 * @param {string} userId
 * @param {Array} presets
 * @returns {Promise<boolean>}
 */
export async function saveUserPresets(userId, presets) {
  if (!userId) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        broadcast_presets: Array.isArray(presets) ? presets : [],
        updated_at: new Date().toISOString(),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * In-memory sliding-window rate limiter for broadcast orchestration and sensitive mutations.
 * Enforces per-user / per-client limits across a rolling time window.
 */
const rateLimitBuckets = new Map();

/**
 * Checks and records a request against a sliding-window rate limit.
 *
 * @param {string} key - Unique rate-limit identifier (e.g. `user:<id>`, `hwid:<hwid>`, `ip:<ip>`)
 * @param {number} [maxRequests=5] - Maximum permitted requests within the window
 * @param {number} [windowMs=300000] - Window duration in milliseconds (default 5 minutes)
 * @returns {{ allowed: boolean, remaining: number, retryAfter: number }}
 */
export function checkRateLimit(key, maxRequests = 5, windowMs = 5 * 60 * 1000) {
  if (!key) return { allowed: true, remaining: maxRequests, retryAfter: 0 };

  const now = Date.now();
  let timestamps = rateLimitBuckets.get(key);
  if (!timestamps) {
    timestamps = [];
    rateLimitBuckets.set(key, timestamps);
  }

  // Filter timestamps within current window
  const activeTimestamps = timestamps.filter((ts) => now - ts < windowMs);

  if (activeTimestamps.length >= maxRequests) {
    const oldest = activeTimestamps[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      retryAfter: retryAfterSeconds,
    };
  }

  activeTimestamps.push(now);
  rateLimitBuckets.set(key, activeTimestamps);

  // Evict stale keys periodically to avoid memory growth
  if (rateLimitBuckets.size > 2000) {
    for (const [k, list] of rateLimitBuckets.entries()) {
      const valid = list.filter((ts) => now - ts < windowMs);
      if (valid.length === 0) {
        rateLimitBuckets.delete(k);
      } else {
        rateLimitBuckets.set(k, valid);
      }
    }
  }

  return {
    allowed: true,
    remaining: maxRequests - activeTimestamps.length,
    retryAfter: 0,
  };
}

/**
 * Resets rate limit buckets (useful for test suites or manual unlocks).
 */
export function resetRateLimits() {
  rateLimitBuckets.clear();
}

