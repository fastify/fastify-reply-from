'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('node:http')
const querystring = require('node:querystring')

const instance = Fastify()

instance.addHook('preHandler', (request, _reply, done) => {
  request.addedVal = 'test'
  done()
})

t.plan(9)
t.teardown(instance.close.bind(instance))

const target = http.createServer((req, res) => {
  t.pass('request proxied')
  t.equal(req.method, 'GET')
  t.equal(req.url, '/world?q=test')
  res.statusCode = 201
  res.setHeader('Content-Type', 'text/plain')
  res.setHeader('x-my-header', 'hello!')
  res.end('hello world')
})

instance.get('/hello', (_request, reply) => {
  reply.from(`http://localhost:${target.address().port}/world?a=b`, {
    queryString (_search, _reqUrl, request) {
      return querystring.stringify({ q: request.addedVal })
    }
  })
})

t.teardown(target.close.bind(target))

target.listen({ port: 0 }, (err) => {
  t.error(err)

  instance.register(From)

  instance.listen({ port: 0 }, async (err) => {
    t.error(err)

    const result = await fetch(`http://localhost:${instance.server.address().port}/hello?a=b`)
    t.equal(result.headers.get('content-type'), 'text/plain')
    t.equal(result.headers.get('x-my-header'), 'hello!')
    t.equal(result.status, 201)
    t.equal(await result.text(), 'hello world')
    instance.close()
    target.close()
  })
})
