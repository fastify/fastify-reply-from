'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const From = require('../index')

test('http2 invalid base', async (t) => {
  const instance = Fastify()

  await t.rejects(instance.register(From, {
    http2: { requestTimeout: 100 }
  }), new Error('Option base is required when http2 is true'))
})
