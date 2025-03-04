'use strict'

const t = require('tap')
const Fastify = require('fastify')
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
  // Use node core http, unix sockets are not
  // supported yet.
  http: true,
  base: upstream
})

t.plan(9)
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

instance.listen({ port: 0 }, (err) => {
  t.error(err)

  target.listen(socketPath, async (err) => {
    t.error(err)

    const result = await fetch(`https://localhost:${instance.server.address().port}`)

    t.equal(result.headers.get('content-type'), 'text/plain')
    t.equal(result.headers.get('x-my-header'), 'hello!')
    t.equal(result.status, 205)
    t.equal(await result.text(), 'hello world')
  })
})
