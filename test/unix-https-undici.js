'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const https = require('https')
const get = require('simple-get').concat
const fs = require('fs')
const querystring = require('querystring')
const path = require('path')
const certs = {
  key: fs.readFileSync(path.join(__dirname, 'fixtures', 'fastify.key')),
  cert: fs.readFileSync(path.join(__dirname, 'fixtures', 'fastify.cert'))
}

if (process.platform === 'win32') {
  t.pass()
  process.exit(0)
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

t.plan(10)
t.teardown(instance.close.bind(instance))

const target = https.createServer(certs, (req, res) => {
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

    get({
      url: `https://localhost:${instance.server.address().port}`,
      rejectUnauthorized: false
    }, (err, res, data) => {
      t.error(err)
      t.equal(res.headers['content-type'], 'text/plain')
      t.equal(res.headers['x-my-header'], 'hello!')
      t.equal(res.statusCode, 205)
      t.equal(data.toString(), 'hello world')
    })
  })
})
