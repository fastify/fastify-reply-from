'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const { request, Pool } = require('undici')
const From = require('..')

class CustomDispatcher {
  constructor (...args) {
    this._dispatcher = new Pool(...args)
  }

  request (...args) {
    return this._dispatcher.request(...args)
  }

  close (...args) {
    return this._dispatcher.close(...args)
  }

  destroy (...args) {
    return this._dispatcher.destroy(...args)
  }
}

test('use a custom instance of \'undici\'', async t => {
  const target = Fastify({
    keepAliveTimeout: 1
  })

  target.get('/', (_req, reply) => {
    t.assert.ok('request proxied')

    reply.headers({
      'Content-Type': 'text/plain',
      'x-my-header': 'hello!'
    })

    reply.statusCode = 205
    reply.send('hello world')
  })

  await target.listen({ port: 3001 })
  t.after(async () => {
    await target.close()
  })

  const instance = Fastify({
    keepAliveTimeout: 1
  })

  instance.register(From, {
    undici: new CustomDispatcher('http://localhost:3001')
  })

  instance.get('/', (_request, reply) => {
    reply.from('http://myserver.local')
  })

  await instance.listen({ port: 0 })
  t.after(async () => {
    await instance.close()
  })

  const res = await request(`http://localhost:${instance.server.address().port}`)

  t.assert.strictEqual(res.headers['content-type'], 'text/plain')
  t.assert.strictEqual(res.headers['x-my-header'], 'hello!')
  t.assert.strictEqual(res.statusCode, 205)

  const data = await res.body.text()
  t.assert.strictEqual(data, 'hello world')
})
