'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const fs = require('fs')
const querystring = require('querystring')
const http = require('http')
const get = require('simple-get').concat

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

t.plan(10)
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

instance.get('/', (request, reply) => {
  reply.from('hello')
})

t.teardown(target.close.bind(target))

instance.listen(0, (err) => {
  t.error(err)

  target.listen(socketPath, (err) => {
    t.error(err)

    get(`http://localhost:${instance.server.address().port}`, (err, res, data) => {
      t.error(err)
      t.equal(res.headers['content-type'], 'text/plain')
      t.equal(res.headers['x-my-header'], 'hello!')
      t.equal(res.statusCode, 205)
      t.equal(data.toString(), 'hello world')
    })
  })
})
