'use strict'

const { test } = require('tap')
const Fastify = require('fastify')
const From = require('..')
const http = require('node:http')
const got = require('got')
const { InternalServerError } = require('../lib/errors')

function serverWithCustomError (stopAfter, statusCodeToFailOn) {
  let requestCount = 0
  return http.createServer((req, res) => {
    if (requestCount++ < stopAfter) {
      res.statusCode = statusCodeToFailOn
      res.setHeader('Content-Type', 'text/plain')
      return res.end('This Service is Unavailable')
    }else{
      res.statusCode = 205
      res.setHeader('Content-Type', 'text/plain')
      return res.end(`Hello World ${requestCount}!`)
    }

  })
}

// -> a server 500's and we don't have a custom handler we should fail
async function setupServer(t, fromOptions = {}, statusCodeToFailOn = 500, stopAfter = 4){
  const target = serverWithCustomError(stopAfter, statusCodeToFailOn)
  await target.listen({ port: 0 })
  t.teardown(target.close.bind(target))

  const instance = Fastify()
  instance.register(From, {
    base: `http://localhost:${target.address().port}`
  })

  instance.get('/', (request, reply) => {
    reply.from(`http://localhost:${target.address().port}`, fromOptions)
  })

  t.teardown(instance.close.bind(instance))
  await instance.listen({ port: 0 })

  return {
    instance
  }
}

test("a 500 status code with no custom handler should fail", async (t) => {
  const {instance} = await setupServer(t);

  try{
    await got.get(`http://localhost:${instance.server.address().port}`, { retry: 0 })
  }catch(error){
    t.ok(error instanceof got.RequestError, 'should throw RequestError');
    t.end()
  }
})

// -> a server 500's and we have a custom handler we should revive not
test("a server 500's with a custom handler and should revive", async (t) => {
  const customRetryLogic = (req, res, registerDefaultRetry, defaultRetryAfter) => {
    if (res && res.statusCode === 500 && req.method === 'GET') {
      return 300
    }
    return null
  }

  const {instance} = await setupServer(t, {customRetry: { handler: customRetryLogic, retries: 10}});

  const res = await got.get(`http://localhost:${instance.server.address().port}`, { retry: 0 })

  t.equal(res.headers['content-type'], 'text/plain')
  t.equal(res.statusCode, 205)
  t.equal(res.body.toString(), 'Hello World 5!')
})

// -> server 503's with a custom handler not registering the default should ultimately fail
test("a server 503's with a custom handler for 500 but the custom handler never registers the default so should fail", async (t) => {
  //the key here is we need our customRetryHandler doesn't register the deefault handler and as a result it doesn't work
  const customRetryLogic = (req, res, registerDefaultRetry, defaultRetryAfter) => {
    if (res && res.statusCode === 500 && req.method === 'GET') {
      return 300
    }
    return null
  }

  const {instance} = await setupServer(t, {customRetry: { handler: customRetryLogic, retries: 10}}, 503);

  try{
    await got.get(`http://localhost:${instance.server.address().port}`, { retry: 0 })
  }catch(error){
    t.equal(error.message, "Response code 503 (Service Unavailable)")
    t.end()
  }
});

test("a server 503's with a custom handler for 500 and the custom handler registers the default so it passes", async (t) => {
  const customRetryLogic = (req, res, registerDefaultRetry, defaultRetryAfter) => {
    //registering the default retry logic for non 500 errors if it occurs
    if (registerDefaultRetry()){
      return defaultRetryAfter;
    }

    if (res && res.statusCode === 500 && req.method === 'GET') {
      return 300
    }

    return null
  }

  const {instance} = await setupServer(t, {customRetry: { handler: customRetryLogic, retries: 10}}, 503);

  const res = await got.get(`http://localhost:${instance.server.address().port}`, { retry: 0 })

  t.equal(res.headers['content-type'], 'text/plain')
  t.equal(res.statusCode, 205)
  t.equal(res.body.toString(), 'Hello World 6!')
});
