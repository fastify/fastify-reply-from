'use strict'

const { test } = require('tap')
const { createServer } = require('node:http')
const Fastify = require('fastify')
const get = require('simple-get').concat
const { createProxy } = require('proxy')
const From = require('..')

const configFormat = {
  string: (value) => value,
  'url instance': (value) => new URL(value),
  object: (value) => ({ uri: value })
}

for (const [description, format] of Object.entries(configFormat)) {
  test(`use undici ProxyAgent to connect through proxy - configured via ${description}`, async (t) => {
    t.plan(5)
    const target = await buildServer()
    const proxy = await buildProxy()
    t.teardown(target.close.bind(target))
    t.teardown(proxy.close.bind(proxy))

    const targetUrl = `http://localhost:${target.address().port}`
    const proxyUrl = `http://localhost:${proxy.address().port}`

    proxy.on('connect', () => {
      t.ok(true, 'should connect to proxy')
    })

    target.on('request', (req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ hello: 'world' }))
    })

    const instance = Fastify()
    t.teardown(instance.close.bind(instance))

    instance.register(From, {
      base: targetUrl,
      undici: {
        proxy: format(proxyUrl)
      }
    })

    instance.get('/', (request, reply) => {
      reply.from()
    })

    const executionFlow = () => new Promise((resolve) => {
      instance.listen({ port: 0 }, err => {
        t.error(err)

        get(`http://localhost:${instance.server.address().port}`, (err, res, data) => {
          t.error(err)
          t.same(res.statusCode, 200)
          t.match(JSON.parse(data.toString()), { hello: 'world' })
          resolve()
        })
      })
    })

    await executionFlow()
  })
}

function buildServer () {
  return new Promise((resolve) => {
    const server = createServer()
    server.listen(0, () => resolve(server))
  })
}

function buildProxy () {
  return new Promise((resolve) => {
    const server = createProxy(createServer())
    server.listen(0, () => resolve(server))
  })
}
