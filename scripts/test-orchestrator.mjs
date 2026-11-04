#!/usr/bin/env node

/**
 * Automated Verification & Unit Test Suite for Mosque Stream Orchestrator
 */

import http from 'node:http';
import assert from 'node:assert';
import { handleRequest } from '../backend/src/index.mjs';
import { PRESETS, buildDescription } from '../backend/src/presets.mjs';

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
    assert.strictEqual(healthData.service, 'mosque-stream-orchestrator');
    console.log('✓ Health check endpoint responded with 200 OK.');

    // 2.1b Static Dock serving check
    const dockRes = await fetch(`${baseUrl}/`);
    assert.strictEqual(dockRes.status, 200);
    assert.ok(dockRes.headers.get('content-type')?.includes('text/html'));
    const dockHtml = await dockRes.text();
    assert.ok(dockHtml.includes('STREAM CONTROL'));
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

  } finally {
    testServer.close();
  }

  console.log('\n===============================================================');
  console.log('  ALL SUITE TESTS PASSED SUCCESSFULLY (6/6)                    ');
  console.log('===============================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ Test suite failed:', err);
  process.exit(1);
});
