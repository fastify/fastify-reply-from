'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const https = require('node:https')
const fs = require('node:fs')
const { fetch, Agent } = require('undici')
const path = require('node:path')
const certs = {
  key: fs.readFileSync(path.join(__dirname, 'fixtures', 'fastify.key')),
  cert: fs.readFileSync(path.join(__dirname, 'fixtures', 'fastify.cert'))
}

const instance = Fastify({
  https: certs
})
instance.register(From)

t.plan(8)
t.teardown(instance.close.bind(instance))

const target = https.createServer(certs, (req, res) => {
  t.pass('request proxied')
  t.equal(req.method, 'GET')
  res.statusCode = 205
  res.setHeader('Content-Type', 'text/plain')
  res.setHeader('x-my-header', 'hello!')
  res.end('hello world')
})

instance.get('/', (_request, reply) => {
  reply.from(`https://localhost:${target.address().port}`)
})

t.teardown(target.close.bind(target))

instance.listen({ port: 0 }, (err) => {
  t.error(err)

  target.listen({ port: 0 }, async (err) => {
    t.error(err)

    const result = await fetch(`https://localhost:${instance.server.address().port}`, {
      dispatcher: new Agent({
        connect: {
          rejectUnauthorized: false
        }
      })
    })

    t.equal(result.headers.get('content-type'), 'text/plain')
    t.equal(result.headers.get('x-my-header'), 'hello!')
    t.equal(result.status, 205)
    t.equal(await result.text(), 'hello world')
  })
})
