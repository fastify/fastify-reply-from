'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('http')
const https = require('https')
const get = require('simple-get').concat

const fs = require('fs')
const path = require('path')
const certs = {
  key: fs.readFileSync(path.join(__dirname, 'fixtures', 'fastify.key')),
  cert: fs.readFileSync(path.join(__dirname, 'fixtures', 'fastify.cert'))
}

const instance = Fastify({
  https: certs
})

t.plan(10)
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

instance.get('/', (request, reply) => {
  reply.from()
})

t.teardown(target.close.bind(target))

target.listen(0, (err) => {
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

  instance.listen(0, (err) => {
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
