'use strict'

const { test, after } = require('node:test')
const { createServer } = require('node:http')
const Fastify = require('fastify')
const { request } = require('undici')
const { createProxy } = require('proxy')
const fastifyProxyFrom = require('..')
const { isIPv6 } = require('node:net')

const configFormat = {
  string: (value) => value,
  'url instance': (value) => new URL(value),
  object: (value) => ({ uri: value })
}

for (const [description, format] of Object.entries(configFormat)) {
  test(`use undici ProxyAgent to connect through proxy - configured via ${description}`, async (t) => {
    t.plan(3)

    const target = await buildServer()
    const proxy = await buildProxy()

    after(() => {
      target.close()
      proxy.close()
    })

    let targetAddress = target.address().address

    if (isIPv6(targetAddress)) {
      targetAddress = `[${targetAddress}]`
    }

    let proxyAddress = proxy.address().address

    if (isIPv6(proxyAddress)) {
      proxyAddress = `[${proxyAddress}]`
    }

    const targetUrl = `http://${targetAddress}:${target.address().port}`
    const proxyUrl = `http://${proxyAddress}:${proxy.address().port}`

    proxy.on('connect', () => {
      t.assert.ok(true, 'should connect to proxy')
    })

    target.on('request', (_req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ hello: 'world' }))
    })

    const instance = Fastify()

    after(() => {
      instance.close()
    })

    instance.register(fastifyProxyFrom, {
      base: targetUrl,
      undici: {
        proxy: format(proxyUrl)
      }
    })

    instance.get('/', (_request, reply) => {
      reply.from()
    })

    await instance.listen({ port: 0 })

    let instanceAddress = proxy.address().address

    if (isIPv6(instanceAddress)) {
      if (instanceAddress === '::') {
        instanceAddress = '::1'
      } else {
        instanceAddress = `[${instanceAddress}]`
      }
    }

    const response = await request(`http://localhost:${instance.server.address().port}`)

    t.assert.strictEqual(response.statusCode, 200)
    t.assert.deepStrictEqual(await response.body.json(), { hello: 'world' })
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
