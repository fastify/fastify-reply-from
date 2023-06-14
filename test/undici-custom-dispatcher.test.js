'use strict'

const { test } = require('tap')
const undici = require('undici')
const Fastify = require('fastify')
const From = require('..')

class CustomDispatcher {
  constructor (...args) {
    this._dispatcher = new undici.Pool(...args)
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

  target.get('/', (req, reply) => {
    t.pass('request proxied')

    reply.headers({
      'Content-Type': 'text/plain',
      'x-my-header': 'hello!'
    })

    reply.statusCode = 205
    reply.send('hello world')
  })

  await target.listen({ port: 3001 })
  t.teardown(async () => {
    await target.close()
  })

  const instance = Fastify({
    keepAliveTimeout: 1
  })

  instance.register(From, {
    undici: new CustomDispatcher('http://localhost:3001')
  })

  instance.get('/', (request, reply) => {
    reply.from('http://myserver.local')
  })

  await instance.listen({ port: 0 })
  t.teardown(async () => {
    await instance.close()
  })

  const res = await undici.request(`http://localhost:${instance.server.address().port}`)

  t.equal(res.headers['content-type'], 'text/plain')
  t.equal(res.headers['x-my-header'], 'hello!')
  t.equal(res.statusCode, 205)

  const data = await res.body.text()
  t.equal(data, 'hello world')
})
