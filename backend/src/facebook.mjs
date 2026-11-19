/**
 * Zero-dependency Meta Graph API v21.0 integration using Node.js native fetch.
 * Creates instant LIVE_NOW broadcasts and terminates active sessions cleanly.
 */

import crypto from 'crypto';

const META_GRAPH_BASE = 'https://graph.facebook.com/v21.0';

/**
 * Computes Meta appsecret_proof for secure server-to-server Graph API calls.
 * Required when "Require App Secret" is enforced in Meta App Dashboard.
 *
 * @param {string} accessToken
 * @param {string} [customAppSecret]
 * @returns {string}
 */
export function getAppSecretProof(accessToken, customAppSecret = null) {
  const appSecret = customAppSecret || process.env.FACEBOOK_APP_SECRET;
  if (!appSecret || !accessToken) return '';
  return crypto.createHmac('sha256', appSecret).update(accessToken).digest('hex');
}

/**
 * Creates a Facebook Live Video with status=LIVE_NOW bypassing Live Producer.
 *
 * @param {Object} params
 * @param {string} params.title Broadcast title
 * @param {string} params.description Broadcast description
 * @param {string} [params.pageId] Meta Page ID
 * @param {string} [params.accessToken] System User or Page Access Token
 * @returns {Promise<{ liveVideoId: string, rtmpUrl: string, streamKey: string, secureStreamUrl: string }>}
 */
export async function createFacebookLiveVideo({
  title,
  description,
  pageId = process.env.FACEBOOK_PAGE_ID,
  accessToken = process.env.FACEBOOK_ACCESS_TOKEN,
}) {
  if (!pageId || !accessToken) {
    throw new Error('Missing Facebook environment variables (FACEBOOK_PAGE_ID, FACEBOOK_ACCESS_TOKEN).');
  }

  const appsecretProof = getAppSecretProof(accessToken);
  const endpoint = `${META_GRAPH_BASE}/${encodeURIComponent(pageId)}/live_videos${appsecretProof ? `?appsecret_proof=${encodeURIComponent(appsecretProof)}` : ''}`;

  const body = {
    status: 'LIVE_NOW',
    title: title.slice(0, 255),
    description: description || '',
    access_token: accessToken,
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    const errorMessage = errorJson?.error?.message || `HTTP ${res.status} ${res.statusText}`;
    const errorCode = errorJson?.error?.code || 'UNKNOWN';
    throw new Error(`Facebook Live API error [code ${errorCode}]: ${errorMessage}`);
  }

  const data = await res.json();
  const liveVideoId = data.id;
  const secureStreamUrl = data.secure_stream_url || data.stream_url;

  if (!secureStreamUrl) {
    throw new Error('Facebook did not return an ingestion stream URL in response.');
  }

  // Parse stream URL into base server URL and dynamic stream key for OBS
  // Example secure_stream_url: "rtmps://live-api-s.facebook.com:443/rtmp/FB-1220983749283-0-AbXyZ..."
  const lastSlashIndex = secureStreamUrl.lastIndexOf('/');
  const rtmpUrl = secureStreamUrl.substring(0, lastSlashIndex + 1);
  const streamKey = secureStreamUrl.substring(lastSlashIndex + 1);

  return {
    liveVideoId,
    rtmpUrl,
    streamKey,
    secureStreamUrl,
  };
}

/**
 * Immediately ends an active Facebook Live Video session to prevent the 3-minute waiting state.
 *
 * @param {string} liveVideoId
 * @param {string} [accessToken]
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function endFacebookLiveVideo(liveVideoId, accessToken = process.env.FACEBOOK_ACCESS_TOKEN) {
  if (!liveVideoId) {
    return { ok: false, error: 'No liveVideoId provided' };
  }

  try {
    const appsecretProof = getAppSecretProof(accessToken);
    const proofParam = appsecretProof ? `&appsecret_proof=${encodeURIComponent(appsecretProof)}` : '';
    const endpoint = `${META_GRAPH_BASE}/${encodeURIComponent(liveVideoId)}?end_live_video=true&access_token=${encodeURIComponent(accessToken)}${proofParam}`;

    const res = await fetch(endpoint, {
      method: 'POST',
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const msg = errJson?.error?.message || `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }

    const data = await res.json();
    return { ok: data.success === true || data.id !== undefined };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Query real-time status and health of a Facebook Live Video.
 *
 * @param {string} liveVideoId
 * @param {string} [accessToken]
 * @returns {Promise<{ isLive: boolean, status: string, health?: string, error?: string }>}
 */
export async function getFacebookLiveStatus(liveVideoId, accessToken = process.env.FACEBOOK_ACCESS_TOKEN) {
  if (!liveVideoId || !accessToken) {
    return { isLive: false, status: 'OFFLINE' };
  }

  try {
    const appsecretProof = getAppSecretProof(accessToken);
    const proofParam = appsecretProof ? `&appsecret_proof=${encodeURIComponent(appsecretProof)}` : '';
    const endpoint = `${META_GRAPH_BASE}/${encodeURIComponent(liveVideoId)}?fields=status,stream_health,live_views&access_token=${encodeURIComponent(accessToken)}${proofParam}`;
    const res = await fetch(endpoint);
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return { isLive: false, status: 'UNKNOWN', error: errJson?.error?.message };
    }

    const data = await res.json();
    const fbStatus = data.status; // LIVE, LIVE_NOW, UNPUBLISHED, VOD
    const healthStatus = data.stream_health?.status;
    const isLive = fbStatus === 'LIVE' || fbStatus === 'LIVE_NOW' || healthStatus === 'GOOD' || healthStatus === 'OK';
    return {
      isLive,
      status: fbStatus || 'UNKNOWN',
      health: healthStatus,
      liveViews: data.live_views,
    };
  } catch (err) {
    return { isLive: false, status: 'ERROR', error: err.message };
  }
}

/**
 * Test validation of a Facebook Page access token and verify live video publishing permission.
 *
 * @param {Object} params
 * @param {string} params.pageId
 * @param {string} params.accessToken
 * @returns {Promise<{ valid: boolean, name?: string, pageId?: string, error?: string }>}
 */
export async function validateFacebookPage({ pageId, accessToken, streamKey, name }) {
  if (streamKey && !accessToken) {
    return {
      valid: true,
      name: name || 'Facebook Live',
      pageId: pageId || 'stream_key',
      serverUrl: 'rtmps://live-api-s.facebook.com:443/rtmp/',
      streamKey,
    };
  }

  if (!pageId || !accessToken) {
    return { valid: false, error: 'Missing pageId or accessToken' };
  }

  try {
    const appsecretProof = getAppSecretProof(accessToken);
    const proofParam = appsecretProof ? `&appsecret_proof=${encodeURIComponent(appsecretProof)}` : '';
    const url = `${META_GRAPH_BASE}/${encodeURIComponent(pageId)}?fields=id,name,access_token&access_token=${encodeURIComponent(accessToken)}${proofParam}`;
    const res = await fetch(url);
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const msg = errJson?.error?.message || `HTTP ${res.status}`;
      return { valid: false, error: `Facebook Page check failed: ${msg}` };
    }

    const data = await res.json();
    return {
      valid: true,
      name: data.name || 'Facebook Page',
      pageId: data.id,
      accessToken: data.access_token || accessToken,
    };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

/**
 * Reconciles Facebook live video title and description.
 * Checks current metadata and patches if mismatched.
 */
export async function reconcileFacebookMetadata({ liveVideoId, title, description, accessToken }) {
  if (!liveVideoId || !accessToken) return { ok: false, error: 'Missing liveVideoId or accessToken' };

  try {
    const appsecretProof = getAppSecretProof(accessToken);
    const proofParam = appsecretProof ? `&appsecret_proof=${encodeURIComponent(appsecretProof)}` : '';

    const getRes = await fetch(
      `${META_GRAPH_BASE}/${encodeURIComponent(liveVideoId)}?fields=title,description&access_token=${encodeURIComponent(accessToken)}${proofParam}`
    );

    if (!getRes.ok) {
      const errData = await getRes.json().catch(() => ({}));
      return { ok: false, error: errData?.error?.message || `HTTP ${getRes.status}` };
    }

    const data = await getRes.json();
    const targetTitle = (title || '').slice(0, 255);
    const targetDesc = description || '';

    if (data.title === targetTitle && (data.description || '') === targetDesc) {
      return { ok: true, matched: true };
    }

    console.log(`[Watchdog] Facebook Live title discrepancy detected. Updating from "${data.title}" to "${targetTitle}"`);
    const updateRes = await fetch(
      `${META_GRAPH_BASE}/${encodeURIComponent(liveVideoId)}?access_token=${encodeURIComponent(accessToken)}${proofParam}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: targetTitle,
          description: targetDesc,
        }),
      }
    );

    return { ok: updateRes.ok, patched: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Uploads and sets a primary custom thumbnail for an active Facebook Live Video.
 *
 * @param {Object} params
 * @param {string} params.liveVideoId
 * @param {Buffer} params.imageBuffer
 * @param {string} [params.mimeType='image/jpeg']
 * @param {string} [params.accessToken]
 * @param {string} [params.customAppSecret]
 * @returns {Promise<{ ok: boolean, data?: object, error?: string }>}
 */
export async function setFacebookThumbnail({
  liveVideoId,
  imageBuffer,
  mimeType = 'image/jpeg',
  accessToken = process.env.FACEBOOK_ACCESS_TOKEN,
  customAppSecret = null,
}) {
  if (!liveVideoId || !imageBuffer || !accessToken) {
    return { ok: false, error: 'Missing liveVideoId, imageBuffer, or accessToken for Facebook thumbnail.' };
  }

  try {
    const appsecretProof = getAppSecretProof(accessToken, customAppSecret);
    const endpoint = `${META_GRAPH_BASE}/${encodeURIComponent(liveVideoId)}/thumbnails${
      appsecretProof ? `?appsecret_proof=${encodeURIComponent(appsecretProof)}` : ''
    }`;

    const formData = new FormData();
    formData.append('is_preferred', 'true');
    formData.append('access_token', accessToken);
    formData.append('source', new Blob([imageBuffer], { type: mimeType }), 'thumbnail.jpg');

    const res = await fetch(endpoint, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: `Facebook thumbnail upload failed (${res.status}): ${errText}` };
    }

    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}


