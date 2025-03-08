'use strict'

const t = require('tap')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const http = require('node:http')
const https = require('node:https')
const { fetch, Agent } = require('undici')

const fs = require('node:fs')
const path = require('node:path')
const certs = {
  key: fs.readFileSync(path.join(__dirname, 'fixtures', 'fastify.key')),
  cert: fs.readFileSync(path.join(__dirname, 'fixtures', 'fastify.cert'))
}

const instance = Fastify({
  https: certs
})

t.plan(9)
t.teardown(instance.close.bind(instance))

const target = https.createServer(certs, (req, res) => {
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
    base: `https://localhost:${target.address().port}`,
    http: {
      agents: {
        'http:': new http.Agent({}),
        'https:': new https.Agent({})
      }
    }
  })

  instance.listen({ port: 0 }, async (err) => {
    t.error(err)

    const result = await request(`https://localhost:${instance.server.address().port}`, {
      dispatcher: new Agent({
        connect: {
          rejectUnauthorized: false
        }
      })
    })

    t.equal(result.headers['content-type'], 'text/plain')
    t.equal(result.headers['x-my-header'], 'hello!')
    t.equal(result.statusCode, 205)
    t.equal(await result.body.text(), 'hello world')
  })
})
