/**
 * Kick API integration using Node.js native fetch.
 * Handles channel metadata updates (stream title, category) and RTMP validation.
 */

const KICK_API_BASE = 'https://api.kick.com/public/v1';
const KICK_DEFAULT_RTMP = 'rtmps://fa723ac112e7.global-contribute.live-video.net:443/app/';

/**
 * Validate a Kick channel stream configuration.
 *
 * @param {Object} params
 * @param {string} [params.userToken] OAuth User Access Token
 * @param {string} [params.refreshToken] OAuth Refresh Token
 * @param {string} [params.streamKey] Permanent Kick Stream Key
 * @param {string} [params.channelSlug] Kick Channel Slug (username)
 * @param {string} [params.clientId] Kick Client ID
 * @param {string} [params.clientSecret] Kick Client Secret
 * @returns {Promise<{ valid: boolean, serverUrl: string, streamKey?: string, name?: string, userToken?: string, refreshToken?: string, error?: string }>}
 */
export async function validateKickChannel({
  userToken,
  refreshToken,
  streamKey,
  channelSlug,
  clientId = process.env.KICK_CLIENT_ID,
  clientSecret = process.env.KICK_CLIENT_SECRET,
}) {
  let activeToken = userToken;
  let activeRefreshToken = refreshToken;

  // If token is missing but refresh token exists, refresh first
  if (!activeToken && activeRefreshToken) {
    const refreshed = await refreshKickToken({ refreshToken: activeRefreshToken, clientId, clientSecret });
    if (refreshed) {
      activeToken = refreshed.userToken;
      activeRefreshToken = refreshed.refreshToken;
    }
  }

  // If user provided a stream key manually without tokens
  if (streamKey && !activeToken && !activeRefreshToken) {
    if (!streamKey.startsWith('sk_') && streamKey.length < 10) {
      return { valid: false, error: 'Kick stream key appears malformed. Find it in Kick Creator Dashboard -> Stream Settings.' };
    }
    return {
      valid: true,
      name: channelSlug || 'Kick Stream',
      serverUrl: KICK_DEFAULT_RTMP,
      streamKey,
    };
  }

  if (!activeToken && !activeRefreshToken) {
    if (streamKey) {
      return {
        valid: true,
        name: channelSlug || 'Kick Stream',
        serverUrl: KICK_DEFAULT_RTMP,
        streamKey,
      };
    }
    return { valid: false, error: 'Missing Kick stream key or user token.' };
  }

  try {
    let res = await fetch(`${KICK_API_BASE}/channels`, {
      headers: {
        Authorization: `Bearer ${activeToken}`,
      },
    });

    // Auto-refresh token if 401 and refreshToken is present
    if (!res.ok && activeRefreshToken) {
      const refreshed = await refreshKickToken({ refreshToken: activeRefreshToken, clientId, clientSecret });
      if (refreshed) {
        activeToken = refreshed.userToken;
        activeRefreshToken = refreshed.refreshToken;
        res = await fetch(`${KICK_API_BASE}/channels`, {
          headers: {
            Authorization: `Bearer ${activeToken}`,
          },
        });
      }
    }

    if (!res.ok) {
      // If validation fails but permanent streamKey is present, stream is still 100% functional
      if (streamKey) {
        return {
          valid: true,
          name: channelSlug || 'Kick Stream',
          serverUrl: KICK_DEFAULT_RTMP,
          streamKey,
          userToken: activeToken,
          refreshToken: activeRefreshToken,
        };
      }
      return { valid: false, error: `Kick authentication expired (${res.status}). Please reconnect.` };
    }

    const data = await res.json();
    const channel = data.data?.[0] || data.data || data;
    const resolvedKey = channel.stream?.key || channel.stream_key || streamKey || '';
    let resolvedServer = channel.stream?.url || KICK_DEFAULT_RTMP;
    if (resolvedServer && !resolvedServer.includes('/app')) {
      resolvedServer = resolvedServer.replace(/\/+$/, '') + ':443/app';
    }
    return {
      valid: true,
      name: channel.slug || channel.name || channelSlug || 'Kick Channel',
      serverUrl: resolvedServer,
      streamKey: resolvedKey || streamKey,
      userToken: activeToken,
      refreshToken: activeRefreshToken,
    };
  } catch (err) {
    if (streamKey) {
      return {
        valid: true,
        name: channelSlug || 'Kick Stream',
        serverUrl: KICK_DEFAULT_RTMP,
        streamKey,
        userToken: activeToken,
        refreshToken: activeRefreshToken,
      };
    }
    return { valid: false, error: err.message };
  }
}

/**
 * Refresh expired Kick User Access Token using Refresh Token.
 */
export async function refreshKickToken({
  refreshToken,
  clientId = process.env.KICK_CLIENT_ID,
  clientSecret = process.env.KICK_CLIENT_SECRET,
}) {
  if (!refreshToken) return null;
  const id = clientId || process.env.KICK_CLIENT_ID;
  const secret = clientSecret || process.env.KICK_CLIENT_SECRET;
  if (!id || !secret) return null;

  try {
    const res = await fetch('https://id.kick.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: id,
        client_secret: secret,
        refresh_token: refreshToken,
      }).toString(),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return {
      userToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
    };
  } catch (_) {
    return null;
  }
}

/**
 * Update Kick broadcast title and category.
 *
 * @param {Object} params
 * @param {string} params.userToken OAuth User Access Token with channel:write scope
 * @param {string} [params.refreshToken]
 * @param {string} params.title Stream title
 * @param {number} [params.categoryId] Kick category ID
 * @param {string} [params.clientId]
 * @param {string} [params.clientSecret]
 */
export async function updateKickChannelInfo({
  userToken,
  refreshToken,
  title,
  categoryId,
  clientId = process.env.KICK_CLIENT_ID,
  clientSecret = process.env.KICK_CLIENT_SECRET,
}) {
  let activeToken = userToken;
  let newRefreshToken = refreshToken;

  if (!activeToken && refreshToken) {
    const refreshed = await refreshKickToken({ refreshToken, clientId, clientSecret });
    if (refreshed) {
      activeToken = refreshed.userToken;
      newRefreshToken = refreshed.refreshToken;
    }
  }

  if (!activeToken) {
    return { ok: false, error: 'Cannot update Kick title: Missing OAuth token (channel was added via stream key only).' };
  }

  try {
    const payload = {
      stream_title: title.slice(0, 100),
    };
    if (categoryId) payload.category_id = parseInt(categoryId, 10);

    let res = await fetch(`${KICK_API_BASE}/channels`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${activeToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    // Auto-refresh token on 401 if refreshToken is available
    if (res.status === 401 && refreshToken) {
      const refreshed = await refreshKickToken({ refreshToken, clientId, clientSecret });
      if (refreshed) {
        activeToken = refreshed.userToken;
        newRefreshToken = refreshed.refreshToken;
        res = await fetch(`${KICK_API_BASE}/channels`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${activeToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
      }
    }

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `Kick API error (${res.status}): ${errText}` };
    }

    return { ok: true, userToken: activeToken, refreshToken: newRefreshToken };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
