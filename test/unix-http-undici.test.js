'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const fs = require('node:fs')
const os = require('node:os')
const querystring = require('node:querystring')
const http = require('node:http')

const instance = Fastify()
const socketPath = `${os.tmpdir()}/fastify-reply-from-${process.pid}.socket`
const upstream = `unix+http://${querystring.escape(socketPath)}/`

instance.register(From, {
  base: upstream
})

t.test('unix http undici', { skip: process.platform === 'win32' }, async (t) => {
  t.plan(7)

  t.after(async () => {
    await instance.close()

    try {
      fs.unlinkSync(socketPath)
    } catch (_) {
    }
  })

  try {
    fs.unlinkSync(socketPath)
  } catch (_) {
  }

  const target = http.createServer((req, res) => {
    t.assert.ok('request proxied')
    t.assert.strictEqual(req.method, 'GET')
    t.assert.strictEqual(req.url, '/hello')

    res.statusCode = 200
    res.setHeader('Content-Type', 'text/plain')
    res.setHeader('x-my-header', 'hello!')
    res.end('hello world')
  })

  t.after(() => target.close())

  instance.get('/', (_request, reply) => {
    reply.from('hello')
  })

  await instance.listen({ port: 0, host: '127.0.0.1' })

  await new Promise((resolve, reject) => {
    target.once('error', reject)
    target.listen(socketPath, resolve)
  })

  const result = await request(`http://127.0.0.1:${instance.server.address().port}`)

  t.assert.strictEqual(result.headers['content-type'], 'text/plain')
  t.assert.strictEqual(result.headers['x-my-header'], 'hello!')
  t.assert.strictEqual(result.statusCode, 200)
  t.assert.strictEqual(await result.body.text(), 'hello world')
})
