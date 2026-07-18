'use strict'

const t = require('node:test')
const Fastify = require('fastify')
const From = require('..')

// GHSA-v574-6498-x57v: Cache key collision via ambiguous concatenation.
// dest + source was used as the cache key.  Different (dest, source) pairs
// could produce identical concatenations while resolving to different URLs,
// causing a request to be forwarded to the wrong upstream.
//
//   dest   = http://127.0.0.1:31001  , source = /private
//   dest   = http://127.0.0.1:3100   , source = 1/private
//
// Both concatenate to "http://127.0.0.1:31001/private" but resolve to
// different URLs.

async function run (t) {
  // victim upstream on port 31001 with a private route and a writable route
  const victim = Fastify({ keepAliveTimeout: 1 })
  victim.get('/private', async () => ({ marker: 'VICTIM_PRIVATE_DATA' }))
  victim.get('/state', async () => ({ written: victim.written }))
  victim.post('/private', async (req, reply) => {
    victim.written = req.body
    return { marker: 'VICTIM_PRIVATE_DATA', written: victim.written }
  })
  t.after(() => victim.close())
  await victim.listen({ port: 31001 })

  // attacker upstream on port 3100
  const attacker = Fastify({ keepAliveTimeout: 1 })
  attacker.get('/1/private', async () => ({ marker: 'ATTACKER_UPSTREAM' }))
  attacker.post('/1/private', async (req, reply) => {
    return { marker: 'ATTACKER_UPSTREAM', written: req.body }
  })
  t.after(() => attacker.close())
  await attacker.listen({ port: 3100 })

  // proxy using getUpstream() and default cache
  const proxy = Fastify({ keepAliveTimeout: 1 })
  proxy.register(From, {
    base: 'http://localhost',
    http: true
  })

  proxy.get('/proxy/victim/private', (req, reply) => {
    reply.from('/private', {
      getUpstream () {
        return 'http://127.0.0.1:31001'
      }
    })
  })

  proxy.post('/proxy/victim/write', (req, reply) => {
    reply.from('/private', {
      method: 'POST',
      body: JSON.stringify(req.body),
      contentType: 'application/json',
      getUpstream () {
        return 'http://127.0.0.1:31001'
      }
    })
  })

  proxy.get('/proxy/attacker/private', (req, reply) => {
    reply.from('1/private', {
      getUpstream () {
        return 'http://127.0.0.1:3100'
      }
    })
  })

  proxy.post('/proxy/attacker/write', (req, reply) => {
    reply.from('1/private', {
      method: 'POST',
      body: JSON.stringify(req.body),
      contentType: 'application/json',
      getUpstream () {
        return 'http://127.0.0.1:3100'
      }
    })
  })

  proxy.get('/proxy/victim/state', (req, reply) => {
    reply.from('/state', {
      getUpstream () {
        return 'http://127.0.0.1:31001'
      }
    })
  })

  t.after(() => proxy.close())
  await proxy.listen({ port: 31000 })

  // prime the cache with the victim entry (dest = "http://127.0.0.1:31001", source = "/private")
  const primeRes = await fetch('http://127.0.0.1:31000/proxy/victim/private')
  t.assert.strictEqual(primeRes.status, 200)

  // now the attacker pair (dest = "http://127.0.0.1:3100", source = "1/private")
  // should NOT reuse the cached URL — it must resolve to the attacker upstream.

  // 1. attacker read — should return ATTACKER_UPSTREAM, not VICTIM_PRIVATE_DATA
  const attackerReadRes = await fetch('http://127.0.0.1:31000/proxy/attacker/private')
  t.assert.strictEqual(attackerReadRes.status, 200)
  const attackerReadBody = await attackerReadRes.json()
  t.assert.strictEqual(
    attackerReadBody.marker,
    'ATTACKER_UPSTREAM',
    'attacker request must reach attacker upstream, not victim'
  )

  // 2. attacker write — should write to attacker, not victim
  const attackerWriteRes = await fetch('http://127.0.0.1:31000/proxy/attacker/write', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ changedBy: 'attacker' })
  })
  t.assert.strictEqual(attackerWriteRes.status, 200)

  // 3. verify victim state is unchanged (victim.written should be undefined/null)
  const victimStateRes = await fetch('http://127.0.0.1:31000/proxy/victim/state')
  t.assert.strictEqual(victimStateRes.status, 200)
  const victimStateBody = await victimStateRes.json()
  t.assert.strictEqual(
    victimStateBody.written,
    undefined,
    'victim state must not be affected by attacker write'
  )
}

t.test('GHSA-v574-6498-x57v: cache key collision via ambiguous concatenation', async (t) => {
  t.plan(6)
  await run(t)
})

t.test('GHSA-v574-6498-x57v: cache key delimiter cannot be injected', async (t) => {
  const victim = Fastify()
  victim.get('/*', async (req) => ({ marker: 'VICTIM', path: req.url }))
  t.after(() => victim.close())
  const victimOrigin = await victim.listen({ host: '127.0.0.1', port: 0 })

  const attacker = Fastify()
  attacker.get('/*', async (req) => ({ marker: 'ATTACKER', path: req.url }))
  t.after(() => attacker.close())
  const attackerOrigin = await attacker.listen({ host: '127.0.0.1', port: 0 })

  const victimPair = {
    source: 'private',
    dest: `${victimOrigin}/|${attackerOrigin}/`
  }
  const attackerPair = {
    source: `private|${victimOrigin}/`,
    dest: `${attackerOrigin}/`
  }

  // These pairs collide when the key is source + '|' + dest.
  t.assert.strictEqual(
    victimPair.source + '|' + victimPair.dest,
    attackerPair.source + '|' + attackerPair.dest
  )

  const proxy = Fastify()
  proxy.register(From, {
    base: 'http://localhost',
    http: true
  })
  proxy.get('/prime', (req, reply) => {
    reply.from(victimPair.source, {
      getUpstream: () => victimPair.dest
    })
  })
  proxy.get('/collide', (req, reply) => {
    reply.from(attackerPair.source, {
      getUpstream: () => attackerPair.dest
    })
  })
  t.after(() => proxy.close())

  const primeResponse = await proxy.inject('/prime')
  t.assert.strictEqual(primeResponse.statusCode, 200)
  t.assert.strictEqual(primeResponse.json().marker, 'VICTIM')

  const attackerResponse = await proxy.inject('/collide')
  t.assert.strictEqual(attackerResponse.statusCode, 200)
  t.assert.strictEqual(
    attackerResponse.json().marker,
    'ATTACKER',
    'attacker request must not reuse the victim cache entry'
  )
})

t.test('GHSA-v574-6498-x57v: cache key distinguishes an absent base', async (t) => {
  const target = Fastify()
  target.get('/private', async () => ({ marker: 'TARGET' }))
  t.after(() => target.close())
  const targetOrigin = await target.listen({ host: '127.0.0.1', port: 0 })
  const source = `${targetOrigin}/private`

  const proxy = Fastify()
  proxy.register(From, { http: true })
  proxy.get('/prime', (req, reply) => reply.from(source))
  proxy.get('/invalid', (req, reply) => {
    reply.from(source, {
      getUpstream: () => 'undefined'
    })
  })
  t.after(() => proxy.close())

  const primeResponse = await proxy.inject('/prime')
  t.assert.strictEqual(primeResponse.statusCode, 200)
  t.assert.strictEqual(primeResponse.json().marker, 'TARGET')

  const invalidResponse = await proxy.inject('/invalid')
  t.assert.strictEqual(
    invalidResponse.statusCode,
    500,
    'invalid upstream must not reuse the entry cached without a base'
  )
})
