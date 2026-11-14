import test from 'node:test';
import assert from 'node:assert/strict';
import { validUsername, validPassword, validEmail, pairTopic, isInitiator, normalizeRoomCode,
  validRoomCode, newRoomCode, newPrivateCode, trimHistory, clampText } from '../src/lib/util.js';
import { parseStats, lossPercent, aggregate, quality } from '../src/lib/netquality.js';
import { emitter } from '../src/lib/emitter.js';

test('username rules match the database check', () => {
  assert.ok(validUsername('Lava_01'));
  assert.ok(!validUsername('ab'));
  assert.ok(!validUsername('has space'));
  assert.ok(!validUsername('x'.repeat(21)));
});

test('password and email validation', () => {
  assert.ok(validPassword('12345678'));
  assert.ok(!validPassword('short'));
  assert.ok(validEmail('a@b.co'));
  assert.ok(!validEmail('nope'));
});

test('pairTopic is symmetric', () => {
  assert.equal(pairTopic('b', 'a'), pairTopic('a', 'b'));
  assert.equal(pairTopic('a', 'b'), 'dm:a:b');
});

test('exactly one side of a pair is the initiator', () => {
  assert.notEqual(isInitiator('a', 'b'), isInitiator('b', 'a'));
});

test('room codes', () => {
  for (let i = 0; i < 50; i++) {
    assert.ok(validRoomCode(newRoomCode()));
    assert.ok(validRoomCode(newPrivateCode()));
  }
  assert.equal(normalizeRoomCode(' ab-cd 23 '), 'ABCD23');
  assert.ok(!validRoomCode('ABC'));
  assert.ok(!validRoomCode('ABCDEF0'));
});

test('history is capped and text clamped', () => {
  assert.equal(trimHistory([...Array(300).keys()]).length, 200);
  assert.equal(trimHistory([...Array(300).keys()])[0], 100);
  assert.equal(clampText('x'.repeat(5000)).length, 2000);
});

test('parseStats reads rtt, jitter and loss', () => {
  const report = new Map([
    ['a', { type: 'candidate-pair', nominated: true, state: 'succeeded', currentRoundTripTime: 0.042 }],
    ['b', { type: 'inbound-rtp', kind: 'audio', jitter: 0.006, packetsLost: 2, packetsReceived: 98 }],
  ]);
  const s = parseStats(report);
  assert.equal(Math.round(s.rtt), 42);
  assert.equal(Math.round(s.jitter), 6);
  assert.equal(s.lost, 2);
  assert.equal(s.received, 98);
});

test('lossPercent works on deltas', () => {
  assert.equal(lossPercent(null, { lost: 1, received: 99 }), 1);
  assert.equal(lossPercent({ lost: 1, received: 99 }, { lost: 6, received: 194 }), 5);
  assert.equal(lossPercent({ lost: 5, received: 5 }, { lost: 5, received: 5 }), 0);
});

test('aggregate and quality', () => {
  const agg = aggregate([{ rtt: 30, jitter: 5, loss: 0 }, { rtt: 120, jitter: 10, loss: 4 }]);
  assert.deepEqual(agg, { rtt: 120, jitter: 10, loss: 4 });
  assert.equal(quality(agg), 'fair');
  assert.equal(quality({ rtt: 20, jitter: 2, loss: 0 }), 'good');
  assert.equal(quality({ rtt: 300, jitter: 2, loss: 0 }), 'poor');
  assert.equal(quality(aggregate([])), 'unknown');
});

test('emitter isolates listener errors', () => {
  const e = emitter();
  let n = 0;
  const origErr = console.error; console.error = () => {};
  e.on('x', () => { throw new Error('boom'); });
  e.on('x', () => n++);
  e.emit('x');
  console.error = origErr;
  assert.equal(n, 1);
});
