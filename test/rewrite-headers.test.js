'use strict'

const t = require('tap')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')

const instance = Fastify()
instance.register(From)

t.test('rewriteHeaders', async (t) => {
  t.plan(7)
  t.teardown(instance.close.bind(instance))

  const target = http.createServer((req, res) => {
    t.pass('request proxied')
    t.equal(req.method, 'GET')
    res.statusCode = 205
    res.setHeader('Content-Type', 'text/plain')
    res.setHeader('x-my-header', 'hello!')
    res.end('hello world')
  })

  instance.get('/', (_request, reply) => {
    reply.from(`http://localhost:${target.address().port}`, {
      rewriteHeaders: (headers) => {
        t.pass('rewriteHeaders called')
        return {
          'content-type': headers['content-type'],
          'x-another-header': 'so headers!'
        }
      }
    })
  })

  t.teardown(target.close.bind(target))

  await new Promise(resolve => instance.listen({ port: 0 }, resolve))
  await new Promise(resolve => target.listen({ port: 0 }, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}`)
  t.equal(result.headers['content-type'], 'text/plain')
  t.equal(result.headers['x-another-header'], 'so headers!')
  t.notOk(result.headers['x-my-header'])
  t.equal(result.statusCode, 205)
})
