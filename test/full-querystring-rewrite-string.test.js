'use strict'

const t = require('tap')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')

const instance = Fastify()

t.test('full querystring rewrite string', async (t) => {
  t.plan(7)
  t.teardown(instance.close.bind(instance))

  const target = http.createServer((req, res) => {
    t.pass('request proxied')
    t.equal(req.method, 'GET')
    t.equal(req.url, '/world?b=c')
    res.statusCode = 205
    res.setHeader('Content-Type', 'text/plain')
    res.setHeader('x-my-header', 'hello!')
    res.end('hello world')
  })

  instance.get('/hello', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}/world?b=c`)
  })

  t.teardown(target.close.bind(target))

  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  instance.register(From)

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}/hello?a=b`)

  t.equal(result.headers['content-type'], 'text/plain')
  t.equal(result.headers['x-my-header'], 'hello!')
  t.equal(result.statusCode, 205)
  t.equal(await result.body.text(), 'hello world')
})
