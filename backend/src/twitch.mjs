/**
 * Twitch Helix API integration using Node.js native fetch.
 * Handles channel information updates (title, category) and stream key verification.
 */

const TWITCH_API_BASE = 'https://api.twitch.tv/helix';

/**
 * Validate a Twitch channel and fetch its stream key using User Access Token.
 *
 * @param {Object} params
 * @param {string} params.broadcasterId Broadcaster User ID
 * @param {string} params.userToken User Access Token (with channel:read:stream_key)
 * @param {string} [params.clientId] Twitch Client ID
 * @returns {Promise<{ valid: boolean, streamKey?: string, broadcasterName?: string, error?: string }>}
 */
export async function validateTwitchChannel({ broadcasterId, broadcasterName, streamKey, userToken, clientId = process.env.TWITCH_CLIENT_ID }) {
  // If streamer entered permanent stream key directly
  if (streamKey && !userToken) {
    if (!streamKey.startsWith('live_') && streamKey.length < 10) {
      return { valid: false, error: 'Twitch stream key appears malformed. Find it in Twitch Creator Dashboard -> Settings -> Stream.' };
    }
    return {
      valid: true,
      broadcasterName: broadcasterName || 'Twitch Stream',
      serverUrl: 'rtmp://live.twitch.tv/app/',
      streamKey,
    };
  }

  if (!userToken) {
    return { valid: false, error: 'Missing Twitch stream key or user token.' };
  }

  const id = clientId || process.env.TWITCH_CLIENT_ID;
  if (!id) {
    return { valid: false, error: 'Missing TWITCH_CLIENT_ID in server configuration.' };
  }

  try {
    // 1. Validate token & get user info
    const userRes = await fetch('https://id.twitch.tv/oauth2/validate', {
      headers: { Authorization: `OAuth ${userToken}` },
    });

    if (!userRes.ok) {
      return { valid: false, error: 'Twitch token is invalid or expired. Reconnection required.' };
    }

    const userData = await userRes.json();
    const effectiveBroadcasterId = broadcasterId || userData.user_id;
    const broadcasterName = userData.login || 'Twitch Channel';

    // 2. Fetch stream key if broadcasterId matches
    let streamKey = null;
    const keyRes = await fetch(`${TWITCH_API_BASE}/streams/key?broadcaster_id=${encodeURIComponent(effectiveBroadcasterId)}`, {
      headers: {
        'Client-ID': id,
        Authorization: `Bearer ${userToken}`,
      },
    });

    if (keyRes.ok) {
      const keyData = await keyRes.json();
      streamKey = keyData.data?.[0]?.stream_key || null;
    }

    return {
      valid: true,
      broadcasterId: effectiveBroadcasterId,
      broadcasterName,
      streamKey,
      serverUrl: 'rtmp://live.twitch.tv/app/',
    };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Update Twitch broadcast metadata (Title & Category).
 *
 * @param {Object} params
 * @param {string} params.broadcasterId
 * @param {string} params.userToken
 * @param {string} params.title Broadcast title
 * @param {string} [params.gameId] Category / Game ID
 * @param {string} [params.clientId]
 */
export async function updateTwitchChannelInfo({
  broadcasterId,
  userToken,
  title,
  gameId = '',
  clientId = process.env.TWITCH_CLIENT_ID,
}) {
  if (!userToken || !broadcasterId) {
    return { ok: false, error: 'Missing broadcasterId or userToken' };
  }

  const id = clientId || process.env.TWITCH_CLIENT_ID;
  if (!id) {
    return { ok: false, error: 'Missing TWITCH_CLIENT_ID' };
  }

  try {
    const payload = {
      title: title.slice(0, 140), // Twitch title max limit is 140 chars
    };
    if (gameId) payload.game_id = gameId;

    const res = await fetch(`${TWITCH_API_BASE}/channels?broadcaster_id=${encodeURIComponent(broadcasterId)}`, {
      method: 'PATCH',
      headers: {
        'Client-ID': id,
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `Twitch API error (${res.status}): ${errText}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
