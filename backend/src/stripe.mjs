/**
 * Simple Streamer Backend - Stripe Integration
 *
 * Lightweight, zero-dependency Stripe module using native fetch and node:crypto.
 * Handles Checkout Sessions, Customer Portal sessions, and Webhook verification.
 */

import crypto from 'node:crypto';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';

/**
 * Creates a Stripe Checkout Session for Simple Streamer Pro ($12/year).
 *
 * @param {Object} params
 * @param {string} params.userId Supabase User UUID
 * @param {string} params.userEmail User email address
 * @param {string} [params.returnUrl] Return URL after checkout
 * @param {string} [params.secretKey] Stripe secret key (defaults to env)
 * @param {string} [params.priceId] Stripe price ID (defaults to env)
 * @returns {Promise<{ ok: boolean, url?: string, id?: string, error?: string }>}
 */
export async function createCheckoutSession({
  userId,
  userEmail,
  returnUrl = 'https://simple-streamer.bdjlmn.com/account',
  secretKey = process.env.STRIPE_SECRET_KEY,
  priceId = process.env.STRIPE_PRICE_ID,
}) {
  if (!secretKey) {
    return { ok: false, error: 'STRIPE_SECRET_KEY is not configured on the server.' };
  }
  if (!priceId) {
    return { ok: false, error: 'STRIPE_PRICE_ID is not configured on the server.' };
  }
  if (!userId) {
    return { ok: false, error: 'Missing userId parameter.' };
  }

  try {
    const params = new URLSearchParams();
    params.append('mode', 'subscription');
    params.append('payment_method_types[0]', 'card');
    params.append('line_items[0][price]', priceId);
    params.append('line_items[0][quantity]', '1');
    if (userEmail) {
      params.append('customer_email', userEmail);
    }
    params.append('client_reference_id', userId);
    params.append('metadata[supabase_user_id]', userId);
    params.append('subscription_data[metadata][supabase_user_id]', userId);
    params.append('success_url', `${returnUrl}?session_id={CHECKOUT_SESSION_ID}&upgraded=true`);
    params.append('cancel_url', `${returnUrl}?canceled=true`);

    const res = await fetch(`${STRIPE_API_BASE}/checkout/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data.error?.message || 'Stripe API error' };
    }

    return { ok: true, url: data.url, id: data.id };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Creates a Stripe Customer Portal Session for self-serve cancellation and invoice management.
 *
 * @param {Object} params
 * @param {string} params.customerId Stripe Customer ID
 * @param {string} [params.returnUrl] Return URL after portal exit
 * @param {string} [params.secretKey] Stripe secret key (defaults to env)
 * @returns {Promise<{ ok: boolean, url?: string, error?: string }>}
 */
export async function createCustomerPortalSession({
  customerId,
  returnUrl = 'https://simple-streamer.bdjlmn.com/account',
  secretKey = process.env.STRIPE_SECRET_KEY,
}) {
  if (!secretKey) {
    return { ok: false, error: 'STRIPE_SECRET_KEY is not configured.' };
  }
  if (!customerId) {
    return { ok: false, error: 'Missing customerId parameter.' };
  }

  try {
    const params = new URLSearchParams();
    params.append('customer', customerId);
    params.append('return_url', returnUrl);

    const res = await fetch(`${STRIPE_API_BASE}/billing_portal/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data.error?.message || 'Stripe portal error' };
    }

    return { ok: true, url: data.url };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Cryptographically verifies a Stripe Webhook signature using HMAC-SHA256.
 *
 * @param {string|Buffer} rawBody Unparsed request body
 * @param {string} signatureHeader Content of the stripe-signature HTTP header
 * @param {string} webhookSecret STRIPE_WEBHOOK_SECRET (whsec_...)
 * @returns {boolean}
 */
export function verifyStripeSignature(rawBody, signatureHeader, webhookSecret) {
  if (!rawBody || !signatureHeader || !webhookSecret) return false;

  try {
    const parts = {};
    signatureHeader.split(',').forEach((item) => {
      const idx = item.indexOf('=');
      if (idx !== -1) {
        const k = item.slice(0, idx).trim();
        const v = item.slice(idx + 1).trim();
        parts[k] = v;
      }
    });

    const timestamp = parts.t;
    const expectedSig = parts.v1;
    if (!timestamp || !expectedSig) return false;

    // Prevent replay attacks (tolerance: 5 minutes)
    const now = Math.floor(Date.now() / 1000);
    const ts = parseInt(timestamp, 10);
    if (isNaN(ts) || Math.abs(now - ts) > 300) return false;

    const payload = `${timestamp}.${typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')}`;
    const computedSig = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');

    const expectedBuf = Buffer.from(expectedSig, 'hex');
    const computedBuf = Buffer.from(computedSig, 'hex');

    if (expectedBuf.length !== computedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, computedBuf);
  } catch (_) {
    return false;
  }
}

/**
 * Retrieves a Stripe Checkout Session by ID directly from Stripe API.
 *
 * @param {string} sessionId Stripe Checkout Session ID (cs_...)
 * @param {string} [secretKey] Stripe Secret Key (defaults to env)
 * @returns {Promise<{ ok: boolean, session?: object, error?: string }>}
 */
export async function retrieveCheckoutSession(
  sessionId,
  secretKey = process.env.STRIPE_SECRET_KEY
) {
  if (!sessionId || !sessionId.startsWith('cs_')) {
    return { ok: false, error: 'Invalid checkout session ID' };
  }
  if (!secretKey) {
    return { ok: false, error: 'STRIPE_SECRET_KEY is not configured on the server.' };
  }

  try {
    const res = await fetch(`${STRIPE_API_BASE}/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    });

    const data = await res.json();
    if (!res.ok) {
      return { ok: false, error: data.error?.message || 'Failed to retrieve session from Stripe' };
    }

    return { ok: true, session: data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

