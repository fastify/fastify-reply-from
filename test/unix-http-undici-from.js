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

const instance = Fastify()
instance.register(From)

t.plan(4)
t.teardown(instance.close.bind(instance))

const socketPath = `${__filename}.socket`

try {
  fs.unlinkSync(socketPath)
} catch (_) {
}

const target = http.createServer((req, res) => {
  t.fail('no response')
  res.end()
})

instance.get('/', (request, reply) => {
  reply.from(`unix+http://${querystring.escape(socketPath)}/hello`)
})

t.teardown(target.close.bind(target))

instance.listen(0, (err) => {
  t.error(err)

  target.listen(socketPath, (err) => {
    t.error(err)

    get(`http://localhost:${instance.server.address().port}`, (err, res, data) => {
      t.error(err)
      t.equal(res.statusCode, 500)
    })
  })
})
