'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const From = require('..')
const https = require('node:https')
const fs = require('node:fs')
const { request, Agent } = require('undici')
const querystring = require('node:querystring')
const path = require('node:path')
const certs = {
  key: fs.readFileSync(path.join(__dirname, 'fixtures', 'fastify.key')),
  cert: fs.readFileSync(path.join(__dirname, 'fixtures', 'fastify.cert'))
}

const socketPath = `${__filename}.socket`

try {
  fs.unlinkSync(socketPath)
} catch (_) {
}

const instance = Fastify({
  https: certs
})
instance.register(From, {
  base: `unix+https://${querystring.escape(socketPath)}`
})

t.test('unix https undici', { skip: process.platform === 'win32' }, async (t) => {
  t.plan(7)
  t.after(() => instance.close())

  const target = https.createServer(certs, (req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.method, 'GET')
    t.assert.strictEqual(req.url, '/hello')
    res.statusCode = 205
    res.setHeader('Content-Type', 'text/plain')
    res.setHeader('x-my-header', 'hello!')
    res.end('hello world')
  })

  instance.get('/', (_request, reply) => {
    reply.from('hello')
  })

  t.after(() => target.close())

  await instance.listen({ port: 0 })

  await new Promise(resolve => target.listen(socketPath, resolve))

  const result = await request(`https://localhost:${instance.server.address().port}`, {
    dispatcher: new Agent({
      connect: {
        rejectUnauthorized: false
      }
    })
  })

  t.assert.strictEqual(result.headers['content-type'], 'text/plain')
  t.assert.strictEqual(result.headers['x-my-header'], 'hello!')
  t.assert.strictEqual(result.statusCode, 205)
  t.assert.strictEqual(await result.body.text(), 'hello world')
})
