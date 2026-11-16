#!/usr/bin/env node

/**
 * Setup Stripe Test Environment & Payment Links
 *
 * Usage:
 *   node scripts/setup-stripe-test.mjs [sk_test_...]
 *   OR set STRIPE_TEST_SECRET_KEY=sk_test_... node scripts/setup-stripe-test.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const ENV_TEST_KEYS_PATH = path.join(REPO_ROOT, 'backend', '.env.test_keys');
const ENV_BACKEND_PATH = path.join(REPO_ROOT, 'backend', '.env');

const STRIPE_API_BASE = 'https://api.stripe.com/v1';

async function stripeFetch(endpoint, secretKey, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
    },
  };

  if (body) {
    options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    options.body = body instanceof URLSearchParams ? body.toString() : new URLSearchParams(body).toString();
  }

  const res = await fetch(`${STRIPE_API_BASE}${endpoint}`, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.message || `Stripe API error HTTP ${res.status}`);
  }
  return data;
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      const k = trimmed.slice(0, idx).trim();
      const v = trimmed.slice(idx + 1).trim();
      env[k] = v;
    }
  }
  return env;
}

function updateEnvFile(filePath, updates) {
  let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
  for (const [key, value] of Object.entries(updates)) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
  }
  fs.writeFileSync(filePath, content.trim() + '\n', 'utf-8');
}

async function promptSecretKey() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Paste your Stripe Test Secret Key (sk_test_...): ', (answer) => {
      rl.close();
      resolve((answer || '').trim());
    });
  });
}

async function main() {
  console.log('\n======================================================');
  console.log('⚡ Simple Streamer — Stripe Test Environment Generator');
  console.log('======================================================\n');

  // 1. Resolve Stripe Test Secret Key
  let secretKey = process.argv[2] || process.env.STRIPE_TEST_SECRET_KEY || '';
  if (!secretKey) {
    const existing = parseEnvFile(ENV_TEST_KEYS_PATH);
    if (existing.STRIPE_TEST_SECRET_KEY && existing.STRIPE_TEST_SECRET_KEY.startsWith('sk_test_')) {
      secretKey = existing.STRIPE_TEST_SECRET_KEY;
    }
  }

  if (!secretKey || !secretKey.startsWith('sk_test_')) {
    secretKey = await promptSecretKey();
  }

  if (!secretKey || !secretKey.startsWith('sk_test_')) {
    console.error('❌ Error: A valid Stripe test secret key starting with "sk_test_" is required.');
    process.exit(1);
  }

  // 2. Validate Stripe Account
  console.log('⏳ Verifying Stripe API test credentials...');
  let account;
  try {
    account = await stripeFetch('/account', secretKey);
    console.log(`✓ Connected to Stripe Account: ${account.business_profile?.name || account.id} (${account.default_currency?.toUpperCase() || 'USD'}) [TEST MODE]`);
  } catch (err) {
    console.error(`❌ Authentication failed: ${err.message}`);
    process.exit(1);
  }

  // 3. Find or Create Test Product: Founding Member Lifetime Pass
  console.log('\n⏳ Provisioning Test Product: Simple Streamer Lifetime Founding Pass...');
  const existingProducts = await stripeFetch('/products?limit=20', secretKey);
  let product = (existingProducts.data || []).find((p) => p.name === 'Simple Streamer — Founding Member Pass (Test)' || p.name === 'Simple Streamer Lifetime Pass');

  if (!product) {
    const prodParams = new URLSearchParams();
    prodParams.append('name', 'Simple Streamer — Founding Member Pass (Test)');
    prodParams.append('description', 'Lifetime Pro license with zero recurring subscription fees. Unified broadcast orchestration for OBS Studio.');
    prodParams.append('metadata[tier]', 'lifetime_founding');
    product = await stripeFetch('/products', secretKey, 'POST', prodParams);
    console.log(`✓ Created test product: ${product.name} (${product.id})`);
  } else {
    console.log(`✓ Found existing test product: ${product.name} (${product.id})`);
  }

  // 4. Find or Create Test Price: $3.00 USD One-Time
  console.log('⏳ Provisioning $3.00 USD one-time price...');
  const existingPrices = await stripeFetch(`/prices?product=${encodeURIComponent(product.id)}&limit=20`, secretKey);
  let price = (existingPrices.data || []).find((p) => p.unit_amount === 300 && p.currency === 'usd' && p.type === 'one_time');

  if (!price) {
    const priceParams = new URLSearchParams();
    priceParams.append('product', product.id);
    priceParams.append('unit_amount', '300');
    priceParams.append('currency', 'usd');
    priceParams.append('metadata[tier]', 'lifetime_founding');
    price = await stripeFetch('/prices', secretKey, 'POST', priceParams);
    console.log(`✓ Created test price: $3.00 USD (${price.id})`);
  } else {
    console.log(`✓ Found existing test price: $3.00 USD (${price.id})`);
  }

  // 5. Find or Create Test Payment Link with Auto-Redirect to /setup
  console.log('⏳ Provisioning Test Payment Link with instant OBS activation redirect...');
  const existingLinks = await stripeFetch('/payment_links?limit=50', secretKey);
  let paymentLink = (existingLinks.data || []).find((pl) => {
    const matchesPrice = (pl.line_items?.data || []).some((li) => li.price?.id === price.id);
    return pl.active && (matchesPrice || pl.metadata?.tier === 'lifetime_founding');
  });

  const setupRedirectUrl = 'https://simple-streamer.bdjlmn.com/setup?session_id={CHECKOUT_SESSION_ID}';

  if (!paymentLink) {
    const linkParams = new URLSearchParams();
    linkParams.append('line_items[0][price]', price.id);
    linkParams.append('line_items[0][quantity]', '1');
    linkParams.append('after_completion[type]', 'redirect');
    linkParams.append('after_completion[redirect][url]', setupRedirectUrl);
    linkParams.append('metadata[tier]', 'lifetime_founding');
    linkParams.append('allow_promotion_codes', 'true');
    linkParams.append('inactive_message', 'The Founding 100 Lifetime Deal has reached capacity and is now closed.');
    paymentLink = await stripeFetch('/payment_links', secretKey, 'POST', linkParams);
    console.log(`✓ Created test payment link: ${paymentLink.url} (${paymentLink.id})`);
  } else {
    // Ensure after_completion redirect points to /setup
    if (paymentLink.after_completion?.redirect?.url !== setupRedirectUrl) {
      const patchParams = new URLSearchParams();
      patchParams.append('after_completion[type]', 'redirect');
      patchParams.append('after_completion[redirect][url]', setupRedirectUrl);
      paymentLink = await stripeFetch(`/payment_links/${paymentLink.id}`, secretKey, 'POST', patchParams);
      console.log(`✓ Updated payment link redirect to: ${setupRedirectUrl}`);
    } else {
      console.log(`✓ Found active test payment link: ${paymentLink.url}`);
    }
  }

  // 6. Save generated keys to backend/.env.test_keys and backend/.env
  console.log('\n⏳ Updating configuration files...');
  updateEnvFile(ENV_TEST_KEYS_PATH, {
    STRIPE_TEST_SECRET_KEY: secretKey,
    STRIPE_TEST_PRODUCT_ID: product.id,
    STRIPE_TEST_PRICE_ID: price.id,
    STRIPE_TEST_PAYMENT_LINK_URL: paymentLink.url,
  });

  // Also update backend/.env STRIPE_SECRET_KEY so local backend tests can verify instantly
  updateEnvFile(ENV_BACKEND_PATH, {
    STRIPE_SECRET_KEY: secretKey,
    STRIPE_PRICE_ID: price.id,
  });

  console.log('✓ Saved test credentials into backend/.env.test_keys');
  console.log('✓ Synced STRIPE_SECRET_KEY into backend/.env');

  console.log('\n======================================================');
  console.log('🎉 TEST ENVIRONMENT READY FOR END-TO-END VERIFICATION');
  console.log('======================================================');
  console.log(`\n💳 Test Payment Link:`);
  console.log(`   ${paymentLink.url}\n`);
  console.log(`📋 Redirection Endpoint:`);
  console.log(`   ${setupRedirectUrl}\n`);
  console.log(`🧪 Test Credit Card (Stripe Test Mode):`);
  console.log(`   Number: 4242 4242 4242 4242`);
  console.log(`   Date:   Any future MM/YY (e.g. 12/28)`);
  console.log(`   CVC:    Any 3 digits (e.g. 123)`);
  console.log(`   ZIP:    Any 5 digits (e.g. 90210)`);
  console.log('======================================================\n');
}

main().catch((err) => {
  console.error('\n❌ Unexpected error running Stripe test setup:', err);
  process.exit(1);
});
