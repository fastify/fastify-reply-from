'use strict'

const t = require('tap')
const Fastify = require('fastify')
const { request } = require('undici')
const From = require('..')
const fs = require('node:fs')
const querystring = require('node:querystring')
const http = require('node:http')

if (process.platform === 'win32') {
  t.pass()
  process.exit(0)
}

const socketPath = `${__filename}.socket`
const upstream = `unix+http://${querystring.escape(socketPath)}/`

const instance = Fastify()
instance.register(From, {
  base: upstream
})

t.test('unix http undici', async t => {
  t.plan(7)
  t.teardown(instance.close.bind(instance))

  try {
    fs.unlinkSync(socketPath)
  } catch (_) {
  }

  const target = http.createServer((req, res) => {
    t.pass('request proxied')
    t.equal(req.method, 'GET')
    t.equal(req.url, '/hello')
    res.statusCode = 205
    res.setHeader('Content-Type', 'text/plain')
    res.setHeader('x-my-header', 'hello!')
    res.end('hello world')
  })

  instance.get('/', (_request, reply) => {
    reply.from('hello')
  })

  t.teardown(target.close.bind(target))

  await instance.listen({ port: 0 })

  await new Promise(resolve => target.listen(socketPath, resolve))

  const result = await request(`http://localhost:${instance.server.address().port}`)

  t.equal(result.headers['content-type'], 'text/plain')
  t.equal(result.headers['x-my-header'], 'hello!')
  t.equal(result.statusCode, 205)
  t.equal(await result.body.text(), 'hello world')
})
