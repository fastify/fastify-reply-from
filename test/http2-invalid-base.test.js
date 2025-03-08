'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('../index')

test('http2 invalid base', async (t) => {
  const instance = Fastify()

  await t.rejects(async () => instance.register(From, {
    http2: { requestTimeout: 100 }
  }), new Error('Option base is required when http2 is true'))
})
