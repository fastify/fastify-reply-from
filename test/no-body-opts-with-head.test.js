'use strict'

const t = require('tap')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')

const instance = Fastify()

t.test('no body opts with head', async (t) => {
  t.plan(4)
  t.after(() => instance.close())

  const target = http.createServer((_req, res) => {
    t.fail('this should never get called')
    res.end('hello world')
  })

  instance.head('/', (_request, reply) => {
    try {
      reply.from(null, { body: 'this is the new body' })
    } catch (e) {
      t.assert.deepEqual(e.message, 'Rewriting the body when doing a HEAD is not allowed')
      reply.header('x-http-error', '1')
      reply.send('hello world')
    }
  })

  t.after(() => target.close())

  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  instance.register(From, {
    base: `http://localhost:${target.address().port}`
  })

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}`, {
    method: 'HEAD'
  })

  t.assert.deepEqual(result.statusCode, 200)
  t.assert.deepEqual(result.headers['x-http-error'], '1')
  t.assert.deepEqual(await result.body.text(), '')
})
