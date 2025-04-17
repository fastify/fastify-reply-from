'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const From = require('../index')

test('throw an error if http2 is used with a Unix socket destination', async t => {
  t.plan(1)

  const instance = Fastify()

  await t.assert.rejects(async () => instance.register(From, {
    base: 'unix+http://localhost:1337',
    http2: { requestTimeout: 100 }
  }), new Error('Unix socket destination is not supported when http2 is true'))
})
