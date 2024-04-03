'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const From = require('../index')

test('http2 invalid base', async (t) => {
  const instance = Fastify()

  t.throws(async () => {
    await instance.register(From, {
      http2: true
    })
  }, 'Option base is required when http2 is true')
})
