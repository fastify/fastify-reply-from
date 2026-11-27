'use strict'

const { test } = require('node:test')
const { isServerSentEvents } = require('../lib/request')

// The regression this guards is purely about parsing the response content-type:
// a media type is case-insensitive and may carry parameters (RFC 9110 §8.3.1),
// so `text/event-stream; charset=utf-8` is the same type as `text/event-stream`.
// This is a pure function, so it is tested without a server, a socket or a
// timer — the strict `=== 'text/event-stream'` this replaced fails every case
// below except the first, which is exactly the bug.

test('isServerSentEvents recognises the bare media type', (t) => {
  t.assert.strictEqual(isServerSentEvents('text/event-stream'), true)
})

test('isServerSentEvents recognises a media type with parameters', (t) => {
  // Starlette's EventSourceResponse and Spring both emit this.
  t.assert.strictEqual(isServerSentEvents('text/event-stream; charset=utf-8'), true)
  t.assert.strictEqual(isServerSentEvents('text/event-stream;charset=utf-8'), true)
})

test('isServerSentEvents is case-insensitive on type and parameters', (t) => {
  t.assert.strictEqual(isServerSentEvents('Text/Event-Stream'), true)
  t.assert.strictEqual(isServerSentEvents('Text/Event-Stream;charset=UTF-8'), true)
})

test('isServerSentEvents rejects other media types', (t) => {
  t.assert.strictEqual(isServerSentEvents('application/json'), false)
  t.assert.strictEqual(isServerSentEvents('text/plain'), false)
  // Not a prefix match: a longer type that merely starts the same must not pass.
  t.assert.strictEqual(isServerSentEvents('text/event-stream-plus'), false)
})

test('isServerSentEvents tolerates a missing or empty content-type', (t) => {
  t.assert.strictEqual(isServerSentEvents(undefined), false)
  t.assert.strictEqual(isServerSentEvents(''), false)
})
