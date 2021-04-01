'use strict'

const t = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('http')
const get = require('simple-get').concat

const instance = Fastify()
instance.register(From, {
  contentTypesToEncode: ['application/x-www-form-urlencoded']
})
instance.register(require('fastify-formbody'))

t.plan(9)
t.teardown(instance.close.bind(instance))

const target = http.createServer((req, res) => {
  t.pass('request proxied')
  t.equal(req.method, 'POST')
  t.equal(req.headers['content-type'], 'application/x-www-form-urlencoded')
  let data = ''
  req.setEncoding('utf8')
  req.on('data', (d) => {
    data += d
  })
  req.on('end', () => {
    const str = data.toString()
    t.same(JSON.parse(data), { some: 'info', another: 'detail' })
    res.statusCode = 200
    res.setHeader('content-type', 'application/x-www-form-urlencoded')
    res.end(str)
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

    get({
      url: `http://localhost:${instance.server.address().port}`,
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'some=info&another=detail'
    }, (err, res, data) => {
      t.error(err)
      t.equal(res.headers['content-type'], 'application/x-www-form-urlencoded')
      t.same(JSON.parse(data), { some: 'info', another: 'detail' })
    })
  })
})
