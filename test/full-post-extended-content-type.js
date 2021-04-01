'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('http')
const get = require('simple-get')

const instance = Fastify()
instance.register(From)

t.plan(9)
t.teardown(instance.close.bind(instance))

const target = http.createServer((req, res) => {
  t.pass('request proxied')
  t.equal(req.method, 'POST')
  t.equal(req.headers['content-type'].startsWith('application/json'), true)
  let data = ''
  req.setEncoding('utf8')
  req.on('data', (d) => {
    data += d
  })
  req.on('end', () => {
    t.same(JSON.parse(data), { hello: 'world' })
    res.statusCode = 200
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ something: 'else' }))
  })
})

instance.post('/', (request, reply) => {
  reply.from(`http://localhost:${target.address().port}`)
})

t.teardown(target.close.bind(target))

instance.listen(0, (err) => {
  t.error(err)

  target.listen(0, (err) => {
    t.error(err)

    get.concat({
      url: `http://localhost:${instance.server.address().port}`,
      method: 'POST',
      body: JSON.stringify({
        hello: 'world'
      }),
      headers: {
        'content-type': 'application/json;charset=utf-8'
      }
    }, (err, res, data) => {
      t.error(err)
      t.equal(res.headers['content-type'], 'application/json')
      t.same(JSON.parse(data.toString()), { something: 'else' })
    })
  })
})
