'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('node:http')
const get = require('simple-get').concat

const instance = Fastify()
instance.register(From)

t.plan(10)
t.teardown(instance.close.bind(instance))

const target = http.createServer((req, res) => {
  t.pass('request proxied')
  t.equal(req.method, 'GET')
  res.statusCode = 201
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

instance.listen({ port: 0 }, (err) => {
  t.error(err)

  target.listen({ port: 0 }, (err) => {
    t.error(err)

    get(`http://localhost:${instance.server.address().port}`, (err, res) => {
      t.error(err)
      t.equal(res.headers['content-type'], 'text/plain')
      t.equal(res.headers['x-another-header'], 'so headers!')
      t.notOk(res.headers['x-my-header'])
      t.equal(res.statusCode, 201)
    })
  })
})
