'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const undici = require('undici')
const From = require('..')

test('destroyAgent false', async (t) => {
  const mockAgent = new undici.Agent()
  mockAgent.destroy = () => {
    t.fail()
  }
  const instance = Fastify()

  t.teardown(instance.close.bind(instance))

  instance.get('/', (request, reply) => {
    reply.from()
  })

  instance.register(From, {
    base: 'http://localhost:4242',
    undici: mockAgent,
    destroyAgent: false
  })

  await instance.ready()
  await instance.close()
})
