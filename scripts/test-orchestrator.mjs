#!/usr/bin/env node

/**
 * Automated Verification & Unit Test Suite for Mosque Stream Orchestrator
 */

import http from 'node:http';
import assert from 'node:assert';
import crypto from 'node:crypto';
import { handleRequest, isNewerVersion } from '../backend/src/index.mjs';
import { PRESETS, buildDescription } from '../backend/src/presets.mjs';
import { mergePresets } from '../backend/src/auth.mjs';
import { verifyStripeSignature } from '../backend/src/stripe.mjs';

console.log('===============================================================');
console.log('  RUNNING MOSQUE STREAM ORCHESTRATOR TEST SUITE                ');
console.log('===============================================================\n');

async function runTests() {
  // Test 1: Presets and Description Generation
  console.log('Test 1: Presets and Description Builder...');
  assert.ok(PRESETS.jumuah, 'Jumuah preset must exist');
  assert.ok(PRESETS.fajr, 'Fajr preset must exist');
  assert.ok(PRESETS.maghrib, 'Maghrib preset must exist');
  assert.ok(PRESETS.isha, 'Isha preset must exist');

  const sampleTitle = PRESETS.jumuah.formatTitle('فضائل الصبر', '12 نوفمبر 2026');
  assert.strictEqual(sampleTitle, 'خطبة الجمعة: فضائل الصبر');

  const desc = buildDescription({
    title: sampleTitle,
    presetId: 'jumuah',
    customNotes: 'فضيلة الشيخ فلان حفظه الله',
  });

  assert.ok(desc.includes('خطبة الجمعة: فضائل الصبر'));
  assert.ok(desc.includes('فضيلة الشيخ فلان حفظه الله'));
  assert.ok(desc.includes('روابط المتابعة والتواصل'));
  console.log('✓ Presets and description templates verified.');

  // Test 2: In-Memory HTTP Server & Routing
  console.log('\nTest 2: Backend HTTP Server & Health Check...');
  const testServer = http.createServer(handleRequest);
  await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve));
  const port = testServer.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 2.1 Health check
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.strictEqual(healthRes.status, 200);
    const healthData = await healthRes.json();
    assert.strictEqual(healthData.status, 'OK');
    assert.strictEqual(healthData.service, 'simple-streamer');
    console.log('✓ Health check endpoint responded with 200 OK.');

    // 2.1b Static Dock serving check
    const dockRes = await fetch(`${baseUrl}/`);
    assert.strictEqual(dockRes.status, 200);
    assert.ok(dockRes.headers.get('content-type')?.includes('text/html'));
    const dockHtml = await dockRes.text();
    assert.ok(dockHtml.includes('SIMPLE STREAMER'));
    console.log('✓ Static OBS Dock index.html served directly on root URL.');

    // 2.2 Presets endpoint
    const presetsRes = await fetch(`${baseUrl}/presets`);
    assert.strictEqual(presetsRes.status, 200);
    const presetsData = await presetsRes.json();
    assert.ok(Array.isArray(presetsData.presets));
    assert.strictEqual(presetsData.presets.length, 5);
    console.log(`✓ Presets endpoint returned ${presetsData.presets.length} options.`);

    // 2.3 Bad payload handling
    const emptyPostRes = await fetch(`${baseUrl}/orchestrate-live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '', preset: 'custom' }),
    });
    assert.strictEqual(emptyPostRes.status, 400);
    const emptyPostData = await emptyPostRes.json();
    assert.ok(emptyPostData.error.includes('Title is required'));
    console.log('✓ Validation correctly rejected empty title on custom preset.');

    // 2.4 Teardown endpoint without active IDs
    const endRes = await fetch(`${baseUrl}/end-live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.strictEqual(endRes.status, 200);
    const endData = await endRes.json();
    assert.strictEqual(endData.ok, true);
    console.log('✓ End live endpoint cleanly handled empty/teardown payload.');

    // 2.5 Metadata Reconciliation Watchdog endpoint test
    const reconcileBadRes = await fetch(`${baseUrl}/reconcile-metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.strictEqual(reconcileBadRes.status, 400);

    const reconcileNoAuthRes = await fetch(`${baseUrl}/reconcile-metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Test Broadcast',
        destinations: [],
      }),
    });
    assert.strictEqual(reconcileNoAuthRes.status, 403);
    const reconcileNoAuthData = await reconcileNoAuthRes.json();
    assert.strictEqual(reconcileNoAuthData.error, 'PRO_REQUIRED');
    console.log('✓ Reconcile metadata watchdog correctly blocked unauthenticated request with 403 PRO_REQUIRED.');

    // Test 3: Supabase Auth, Entitlements & Device Limits
    console.log('\nTest 3: Supabase Auth & Entitlement Gatekeeping...');

    // 3.1 Device check without auth header
    const devCheckNoAuth = await fetch(`${baseUrl}/auth/device-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hwid: 'TEST_HWID_001', deviceName: 'Studio PC' }),
    });
    assert.strictEqual(devCheckNoAuth.status, 401);
    const devCheckNoAuthData = await devCheckNoAuth.json();
    assert.strictEqual(devCheckNoAuthData.error, 'UNAUTHORIZED');
    console.log('✓ /auth/device-check correctly rejected unauthenticated request with 401.');

    // 3.1b Device check with token but missing/invalid HWID
    const devCheckNoHwid = await fetch(`${baseUrl}/auth/device-check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer dummy_token_abc',
      },
      body: JSON.stringify({ hwid: 'short' }),
    });
    assert.strictEqual(devCheckNoHwid.status, 400);
    const devCheckNoHwidData = await devCheckNoHwid.json();
    assert.strictEqual(devCheckNoHwidData.error, 'DEVICE_IDENTIFIER_REQUIRED');
    console.log('✓ /auth/device-check correctly rejected invalid HWID (< 8 chars) with 400.');

    // 3.2 Automated YouTube OAuth blocked without Pro auth token
    const ytOAuthBlocked = await fetch(`${baseUrl}/orchestrate-live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Sunday Stream',
        preset: 'custom',
        destinations: [{ platform: 'youtube', authType: 'oauth', refreshToken: 'dummy_token' }],
      }),
    });
    assert.strictEqual(ytOAuthBlocked.status, 403);
    const ytOAuthBlockedData = await ytOAuthBlocked.json();
    assert.strictEqual(ytOAuthBlockedData.error, 'PRO_REQUIRED');
    console.log('✓ /orchestrate-live correctly blocked automated YouTube OAuth without Pro token (403 PRO_REQUIRED).');

    // 3.2b Automated OAuth with token but missing/invalid HWID rejected with DEVICE_IDENTIFIER_REQUIRED
    const ytOAuthNoHwid = await fetch(`${baseUrl}/orchestrate-live`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer dummy_pro_token',
      },
      body: JSON.stringify({
        title: 'Sunday Stream',
        preset: 'custom',
        destinations: [{ platform: 'youtube', authType: 'oauth', refreshToken: 'dummy_token' }],
        hwid: '',
      }),
    });
    assert.strictEqual(ytOAuthNoHwid.status, 403);
    const ytOAuthNoHwidData = await ytOAuthNoHwid.json();
    assert.strictEqual(ytOAuthNoHwidData.error, 'DEVICE_IDENTIFIER_REQUIRED');
    console.log('✓ /orchestrate-live correctly blocked automated OAuth without valid HWID (403 DEVICE_IDENTIFIER_REQUIRED).');

    // 3.3 Automated Facebook OAuth blocked without Pro auth token
    const fbOAuthBlocked = await fetch(`${baseUrl}/orchestrate-live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Sunday Stream',
        preset: 'custom',
        destinations: [{ platform: 'facebook', authType: 'oauth', accessToken: 'dummy_token', pageId: '123' }],
      }),
    });
    assert.strictEqual(fbOAuthBlocked.status, 403);
    const fbOAuthBlockedData = await fbOAuthBlocked.json();
    assert.strictEqual(fbOAuthBlockedData.error, 'PRO_REQUIRED');
    console.log('✓ /orchestrate-live correctly blocked automated Facebook OAuth without Pro token (403 PRO_REQUIRED).');

    // 3.4 Free Tier Pass-Through: Stream Key & Custom RTMP mode passes through without auth
    const streamKeyPass = await fetch(`${baseUrl}/orchestrate-live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Free Stream Key Broadcast',
        preset: 'custom',
        destinations: [
          { platform: 'youtube', authType: 'stream_key', streamKey: 'xxxx-xxxx-xxxx', rtmpUrl: 'rtmp://a.rtmp.youtube.com/live2' },
          { platform: 'twitch', authType: 'oauth', streamKey: 'live_user_xxxx' },
          { platform: 'kick', authType: 'stream_key', streamKey: 'sk_live_xxxx' },
          { platform: 'custom', name: 'TikTok Live', streamKey: 'tiktok_key_123', serverUrl: 'rtmp://live-push.tiktok.com/live/' },
        ],
      }),
    });
    // Should pass auth check (status 200 or successful orchestrator resolution)
    assert.notStrictEqual(streamKeyPass.status, 403, 'Free destinations must never be blocked by 403 PRO_REQUIRED');
    const streamKeyPassData = await streamKeyPass.json();
    assert.strictEqual(streamKeyPassData.status, 'SUCCESS');
    const customResult = streamKeyPassData.destinations.find((d) => d.platform === 'custom');
    assert.ok(customResult && customResult.ok, 'Custom RTMP destination must succeed');
    console.log('✓ Free tier pass-through verified: Twitch, Kick, Stream-Keys & Custom RTMP bypass auth requirements.');

    // 3.5 CORS headers check for device fingerprinting
    const corsRes = await fetch(`${baseUrl}/health`, { method: 'OPTIONS' });
    const allowHeaders = corsRes.headers.get('access-control-allow-headers') || '';
    assert.ok(allowHeaders.includes('x-device-hwid'), 'CORS must permit x-device-hwid');
    assert.ok(allowHeaders.includes('x-device-name'), 'CORS must permit x-device-name');
    console.log('✓ CORS headers permit x-device-hwid and x-device-name.');

    // 3.6 Quota Protection Rate Limiter (Max 5 per 5 mins)
    for (let i = 0; i < 4; i++) {
      await fetch(`${baseUrl}/orchestrate-live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Rapid Stream ${i}`,
          destinations: [{ platform: 'kick', authType: 'stream_key', streamKey: 'sk_test' }],
        }),
      });
    }
    const rateLimitExceededRes = await fetch(`${baseUrl}/orchestrate-live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Exceeded Broadcast',
        destinations: [{ platform: 'kick', authType: 'stream_key', streamKey: 'sk_test' }],
      }),
    });
    assert.strictEqual(rateLimitExceededRes.status, 429);
    const rateLimitData = await rateLimitExceededRes.json();
    assert.strictEqual(rateLimitData.error, 'RATE_LIMIT_EXCEEDED');
    assert.ok(rateLimitData.retryAfter > 0, 'Retry-After must be positive');
    console.log('✓ Anti-Spam Rate Limiter correctly rejected 6th request with 429 RATE_LIMIT_EXCEEDED.');

    // Test 4: Custom Thumbnail API
    console.log('\nTest 4: Custom Thumbnail API...');
    const thumbBadRes = await fetch(`${baseUrl}/set-thumbnail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.strictEqual(thumbBadRes.status, 400);

    const dummyBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
    const thumbValidRes = await fetch(`${baseUrl}/set-thumbnail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        thumbnailBase64: dummyBase64,
        destinations: [
          { platform: 'twitch', broadcasterId: '123' },
          { platform: 'kick', userToken: 'abc' },
        ],
      }),
    });
    assert.strictEqual(thumbValidRes.status, 200);
    const thumbData = await thumbValidRes.json();
    assert.strictEqual(thumbData.ok, true);
    assert.strictEqual(thumbData.results.length, 2);
    assert.strictEqual(thumbData.results[0].skipped, true);
    console.log('✓ Custom Thumbnail API correctly handles validation, ephemeral decoding & dynamic platform skip.');

    // Test 5: Cloud Presets Sync & Conflict Resolution
    console.log('\nTest 5: Cloud Presets Multi-Machine Sync & Merge...');
    const listMachineA = [
      { id: 'tpl_1', name: 'Machine A Title', updated_at: '2026-11-14T20:00:00Z' },
      { id: 'tpl_2', name: 'Shared Preset Older', updated_at: '2026-11-14T10:00:00Z' },
    ];
    const listMachineB = [
      { id: 'tpl_2', name: 'Shared Preset Newer Edit', updated_at: '2026-11-14T22:00:00Z' },
      { id: 'tpl_3', name: 'Machine B Title', updated_at: '2026-11-14T21:00:00Z' },
    ];

    const merged = mergePresets(listMachineA, listMachineB);
    assert.strictEqual(merged.length, 3, 'Must merge unique IDs across machines');
    const tpl2 = merged.find((t) => t.id === 'tpl_2');
    assert.strictEqual(tpl2.name, 'Shared Preset Newer Edit', 'Newer updated_at must win conflict');
    console.log('✓ mergePresets correctly resolves multi-device conflicts (union + latest timestamp wins).');

    const unauthPresetRes = await fetch(`${baseUrl}/presets/cloud`, { method: 'GET' });
    assert.strictEqual(unauthPresetRes.status, 401, '/presets/cloud must reject unauthenticated requests');
    console.log('✓ /presets/cloud rejects unauthenticated requests with 401.');

    // Test 6: Version Checker & Update Endpoint
    console.log('\nTest 6: Version Checker & Update Endpoint...');
    assert.strictEqual(isNewerVersion('1.0.1', '1.0.0'), true);
    assert.strictEqual(isNewerVersion('1.1.0', '1.0.0'), true);
    assert.strictEqual(isNewerVersion('2.0.0', '1.9.9'), true);
    assert.strictEqual(isNewerVersion('1.0.0', '1.0.0'), false);
    assert.strictEqual(isNewerVersion('0.9.9', '1.0.0'), false);
    console.log('✓ isNewerVersion correctly evaluates semver precedence.');

    const versionRes = await fetch(`${baseUrl}/api/version`);
    assert.strictEqual(versionRes.status, 200);
    const versionData = await versionRes.json();
    assert.strictEqual(versionData.ok, true);
    assert.strictEqual(versionData.currentVersion, '1.0.0');
    assert.ok(versionData.latestVersion, 'Must return latestVersion');
    assert.ok(versionData.releaseUrl, 'Must return releaseUrl');
    assert.ok(versionData.windowsDownloadUrl, 'Must return windowsDownloadUrl');
    assert.ok(versionData.macDownloadUrl, 'Must return macDownloadUrl');
    console.log('✓ /api/version correctly returns version metadata and direct platform download links.');

    // Test 7: Stripe Purchases & Webhook Signature
    console.log('\nTest 7: Stripe Purchases & Webhook Signature...');
    const fakeSecret = 'whsec_test_secret_key_12345';
    const fakePayload = JSON.stringify({ type: 'checkout.session.completed', id: 'evt_123' });
    const nowTs = Math.floor(Date.now() / 1000);
    const validHmac = crypto.createHmac('sha256', fakeSecret).update(`${nowTs}.${fakePayload}`).digest('hex');
    const validSigHeader = `t=${nowTs},v1=${validHmac}`;

    assert.strictEqual(verifyStripeSignature(fakePayload, validSigHeader, fakeSecret), true, 'Valid signature must pass');
    assert.strictEqual(verifyStripeSignature(fakePayload, `t=${nowTs},v1=bad_signature`, fakeSecret), false, 'Tampered signature must fail');
    assert.strictEqual(verifyStripeSignature(fakePayload, `t=${nowTs - 400},v1=${validHmac}`, fakeSecret), false, 'Expired timestamp must fail (anti-replay)');
    console.log('✓ verifyStripeSignature correctly validates timing-safe HMAC & rejects tampering.');

    const unauthCheckoutRes = await fetch(`${baseUrl}/api/create-checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.strictEqual(unauthCheckoutRes.status, 401, 'Unauthenticated checkout request must be rejected');
    console.log('✓ /api/create-checkout-session correctly rejects unauthenticated requests with 401.');

  } finally {
    testServer.close();
  }

  console.log('\n===============================================================');
  console.log('  ALL SUITE TESTS PASSED SUCCESSFULLY (9/9)                    ');
  console.log('===============================================================\n');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
