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
 * @param {string} [params.streamKey] Permanent Kick Stream Key
 * @param {string} [params.channelSlug] Kick Channel Slug (username)
 * @returns {Promise<{ valid: boolean, serverUrl: string, streamKey?: string, name?: string, error?: string }>}
 */
export async function validateKickChannel({ userToken, streamKey, channelSlug }) {
  // If user provided a stream key manually
  if (streamKey && !userToken) {
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

  // If user linked via OAuth
  if (userToken) {
    try {
      const res = await fetch(`${KICK_API_BASE}/channels`, {
        headers: {
          Authorization: `Bearer ${userToken}`,
        },
      });

      if (!res.ok) {
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
        streamKey: resolvedKey,
      };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }

  return { valid: false, error: 'Missing Kick stream key or user token.' };
}

/**
 * Update Kick broadcast title and category.
 *
 * @param {Object} params
 * @param {string} params.userToken OAuth User Access Token with channel:write scope
 * @param {string} params.title Stream title
 * @param {number} [params.categoryId] Kick category ID
 */
export async function updateKickChannelInfo({ userToken, title, categoryId }) {
  if (!userToken) {
    return { ok: false, error: 'Cannot update Kick title: Missing OAuth token (channel was added via stream key only).' };
  }

  try {
    const payload = {
      stream_title: title.slice(0, 100),
    };
    if (categoryId) payload.category_id = parseInt(categoryId, 10);

    const res = await fetch(`${KICK_API_BASE}/channels`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${userToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `Kick API error (${res.status}): ${errText}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
