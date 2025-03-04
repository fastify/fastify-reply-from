'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('node:http')
const https = require('node:https')
const get = require('simple-get').concat

const instance = Fastify()

t.plan(10)
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

instance.get('/', (_request, reply) => {
  reply.from()
})

t.teardown(target.close.bind(target))

target.listen({ port: 0 }, (err) => {
  t.error(err)

  instance.register(From, {
    base: `http://localhost:${target.address().port}`,
    http: {
      agents: {
        'http:': new http.Agent({}),
        'https:': new https.Agent({})
      }
    }
  })

  instance.listen({ port: 0 }, (err) => {
    t.error(err)

    const result = await fetch(`https://localhost:${instance.server.address().port}`)

    t.equal(result.headers.get('content-type'), 'text/plain')
    t.equal(result.headers.get('x-my-header'), 'hello!')
    t.equal(result.status, 205)
    t.equal(await result.text(), 'hello world')
  })
})
