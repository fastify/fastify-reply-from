'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('node:http')
const { request } = require('undici')

const instance = Fastify()

t.test('async route handler', async (t) => {
  t.plan(8)
  t.teardown(instance.close.bind(instance))

  const target = http.createServer((req, res) => {
    t.pass('request proxied')
    t.equal(req.method, 'GET')
    t.equal(req.url, '/')
    res.statusCode = 205
    res.setHeader('Content-Type', 'text/plain')
    res.setHeader('x-my-header', 'hello!')
    res.end('hello world')
  })

  instance.get('/', async (_request, reply) => {
    const p = reply.from()
    t.equal(p, reply)
    return p
  })

  t.teardown(target.close.bind(target))

  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  instance.register(From, {
    base: `http://localhost:${target.address().port}`
  })

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}`)

  t.equal(result.headers['content-type'], 'text/plain')
  t.equal(result.headers['x-my-header'], 'hello!')
  t.equal(result.statusCode, 205)
  t.equal(await result.body.text(), 'hello world')

  await instance.close()
})
