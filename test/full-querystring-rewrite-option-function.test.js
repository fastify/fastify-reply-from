'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('node:http')
const get = require('simple-get').concat
const querystring = require('node:querystring')

const instance = Fastify()

t.plan(10)
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
  reply.from(`http://localhost:${target.address().port}/world?a=b`, {
    queryString () {
      return querystring.stringify({ b: 'c' })
    }
  })
})

t.teardown(target.close.bind(target))

target.listen({ port: 0 }, (err) => {
  t.error(err)

  instance.register(From)

  instance.listen({ port: 0 }, (err) => {
    t.error(err)

    get(`http://localhost:${instance.server.address().port}/hello?a=b`, (err, res, data) => {
      t.error(err)
      t.equal(res.headers['content-type'], 'text/plain')
      t.equal(res.headers['x-my-header'], 'hello!')
      t.equal(res.statusCode, 205)
      t.equal(data.toString(), 'hello world')
    })
  })
})
