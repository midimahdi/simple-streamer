/**
 * Zero-dependency YouTube Data API v3 integration using Node.js native fetch.
 * Handles OAuth2 token refresh, liveBroadcast creation, and permanent stream binding.
 */

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const YT_API_BASE = 'https://youtube.googleapis.com/youtube/v3';

// In-memory token cache to prevent redundant OAuth refreshes within validity window
const tokenCache = new Map(); // refreshToken -> { accessToken, expiresAt }

/**
 * Mint a fresh Google OAuth2 access token using the provided or stored refresh token.
 *
 * @param {string} [customRefreshToken] User's refresh token from client localStorage
 */
export async function getAccessToken(customRefreshToken = null) {
  const refreshToken = customRefreshToken || process.env.YOUTUBE_REFRESH_TOKEN;
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing YouTube OAuth2 credentials. Please connect your YouTube channel in Settings.');
  }

  const now = Date.now();
  const cached = tokenCache.get(refreshToken);
  if (cached && now < cached.expiresAt - 60_000) {
    return cached.accessToken;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Google OAuth2 token refresh failed (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const accessToken = data.access_token;
  tokenCache.set(refreshToken, {
    accessToken,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  });
  return accessToken;
}

/**
 * Query YouTube for the channel title
 */
export async function fetchYouTubeChannel(token) {
  try {
    const res = await fetch(`${YT_API_BASE}/channels?part=snippet&mine=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return 'YouTube Channel';
    const data = await res.json();
    return data.items?.[0]?.snippet?.title || 'YouTube Channel';
  } catch (_) {
    return 'YouTube Channel';
  }
}

/**
 * Query YouTube for existing liveStreams
 */
export async function fetchYouTubeStreams(accessToken) {
  const res = await fetch(
    `${YT_API_BASE}/liveStreams?part=id,snippet,cdn&mine=true&maxResults=25`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.warn('Could not fetch YouTube streams:', errText);
    throw new Error(`YouTube API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  let streams = (data.items || []).map((item) => ({
    id: item.id,
    title: item.snippet?.title || 'Default Stream',
    resolution: item.cdn?.resolution || '1080p',
    streamName: item.cdn?.ingestionInfo?.streamName || '',
    ingestionAddress: item.cdn?.ingestionInfo?.ingestionAddress || 'rtmp://a.rtmp.youtube.com/live2',
  }));

  // If no streams exist on the channel, automatically create a permanent default stream
  if (streams.length === 0) {
    try {
      const createRes = await fetch(`${YT_API_BASE}/liveStreams?part=snippet,cdn`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          snippet: {
            title: 'Simple Streamer (Permanent 1080p)',
            description: 'Permanent RTMP stream key created automatically by Simple Streamer',
          },
          cdn: {
            frameRate: 'variable',
            ingestionType: 'rtmp',
            resolution: 'variable',
          },
        }),
      });
      if (createRes.ok) {
        const created = await createRes.json();
        streams.push({
          id: created.id,
          title: created.snippet?.title || 'Simple Streamer (Permanent 1080p)',
          resolution: created.cdn?.resolution || '1080p',
          streamName: created.cdn?.ingestionInfo?.streamName || '',
          ingestionAddress: created.cdn?.ingestionInfo?.ingestionAddress || 'rtmp://a.rtmp.youtube.com/live2',
        });
        console.log('✓ Auto-created permanent YouTube liveStream:', created.id);
      } else {
        const createErrText = await createRes.text();
        console.warn('Failed to auto-create YouTube liveStream:', createErrText);
      }
    } catch (createErr) {
      console.warn('Could not auto-create permanent stream:', createErr.message);
    }
  }

  return streams;
}

/**
 * Creates a YouTube liveBroadcast resource and binds it to the permanent liveStream ID.
 *
 * @param {Object} params
 * @param {string} params.title Broadcast title
 * @param {string} params.description Broadcast description
 * @param {string} [params.refreshToken] User refresh token
 * @param {string} [params.streamId] Permanent YouTube liveStream ID
 * @param {string} [params.privacyStatus] 'public' | 'unlisted' | 'private'
 * @returns {Promise<{ broadcastId: string, watchUrl: string }>}
 */
export async function createYouTubeBroadcast({
  title,
  description,
  refreshToken,
  streamId = process.env.YOUTUBE_STREAM_ID,
  privacyStatus = process.env.YOUTUBE_PRIVACY_STATUS || 'public',
}) {
  if (!streamId) {
    throw new Error('Missing YouTube streamId. Permanent stream ID must be configured in Settings.');
  }

  const token = await getAccessToken(refreshToken);

  // 1. Create liveBroadcast resource
  // AutoStart & AutoStop ensure YouTube publishes when OBS sends RTMP and ends when OBS stops.
  const insertUrl = `${YT_API_BASE}/liveBroadcasts?part=snippet,status,contentDetails`;
  const insertPayload = {
    snippet: {
      title: title.slice(0, 100), // YouTube title max limit is 100 chars
      description: description || '',
      scheduledStartTime: new Date().toISOString(),
    },
    status: {
      privacyStatus,
      selfDeclaredMadeForKids: false,
    },
    contentDetails: {
      enableAutoStart: true,
      enableAutoStop: true,
      recordFromStart: true,
    },
  };

  const insertRes = await fetch(insertUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(insertPayload),
  });

  if (!insertRes.ok) {
    const errText = await insertRes.text();
    throw new Error(`YouTube liveBroadcasts.insert failed (${insertRes.status}): ${errText}`);
  }

  const broadcastData = await insertRes.json();
  const broadcastId = broadcastData.id;

  // 2. Bind the newly created liveBroadcast to the permanent liveStream ingestion ID
  const bindUrl = `${YT_API_BASE}/liveBroadcasts/bind?id=${broadcastId}&streamId=${encodeURIComponent(streamId)}&part=id,contentDetails`;
  const bindRes = await fetch(bindUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!bindRes.ok) {
    const bindErrText = await bindRes.text();
    throw new Error(`YouTube liveBroadcasts.bind failed (${bindRes.status}): ${bindErrText}`);
  }

  return {
    broadcastId,
    watchUrl: `https://youtube.com/watch?v=${broadcastId}`,
  };
}

/**
 * Force-terminates a YouTube liveBroadcast (fallback teardown).
 * Usually enableAutoStop handles this, but calling transition ensures instantaneous teardown.
 */
export async function endYouTubeBroadcast(broadcastId, refreshToken) {
  if (!broadcastId) return { ok: false, error: 'No broadcastId provided' };

  try {
    const token = await getAccessToken(refreshToken);
    const url = `${YT_API_BASE}/liveBroadcasts/transition?broadcastStatus=complete&id=${encodeURIComponent(broadcastId)}&part=id,status`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: err };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Query real-time status of a YouTube liveBroadcast.
 *
 * @param {string} broadcastId
 * @param {string} [refreshToken]
 * @returns {Promise<{ isLive: boolean, status: string, lifeCycleStatus?: string, error?: string }>}
 */
export async function getYouTubeBroadcastStatus(broadcastId, refreshToken) {
  if (!broadcastId) {
    return { isLive: false, status: 'OFFLINE' };
  }

  try {
    const token = await getAccessToken(refreshToken);
    const url = `${YT_API_BASE}/liveBroadcasts?part=status&id=${encodeURIComponent(broadcastId)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.text();
      return { isLive: false, status: 'UNKNOWN', error: err };
    }

    const data = await res.json();
    const item = data.items?.[0];
    if (!item) {
      return { isLive: false, status: 'NOT_FOUND' };
    }

    const lifeCycle = item.status?.lifeCycleStatus; // 'created', 'ready', 'liveStarting', 'live', 'complete'
    const isLive = lifeCycle === 'live';

    return {
      isLive,
      status: lifeCycle || 'UNKNOWN',
      lifeCycleStatus: lifeCycle,
    };
  } catch (err) {
    return { isLive: false, status: 'ERROR', error: err.message };
  }
}

/**
 * Test validation of a YouTube channel, refresh token, and stream key.
 *
 * @param {Object} params
 * @param {string} params.refreshToken
 * @param {string} [params.streamId]
 * @returns {Promise<{ valid: boolean, channelName?: string, streamId?: string, streamName?: string, ingestionAddress?: string, streams?: Array, error?: string }>}
 */
export async function validateYouTubeChannel({ refreshToken, streamId }) {
  if (!refreshToken) {
    return { valid: false, error: 'Missing YouTube refresh token.' };
  }

  try {
    const token = await getAccessToken(refreshToken);

    // 1. Fetch channel name
    const channelName = await fetchYouTubeChannel(token);

    // 2. Fetch streams
    const streams = await fetchYouTubeStreams(token);

    if (!streams || streams.length === 0) {
      return {
        valid: false,
        channelName,
        error: 'No RTMP stream keys found on this YouTube channel. Create a default stream in YouTube Studio first.',
      };
    }

    const matchedStream = streamId ? streams.find((s) => s.id === streamId) : streams[0];

    return {
      valid: true,
      channelName,
      streamId: matchedStream?.id || streams[0].id,
      streamName: matchedStream?.streamName || streams[0].streamName,
      ingestionAddress: matchedStream?.ingestionAddress || streams[0].ingestionAddress,
      streams,
    };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

