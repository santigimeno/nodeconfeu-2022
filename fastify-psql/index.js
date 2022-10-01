'use strict';

function setupOpentelemetry(serviceName) {
  const { FastifyInstrumentation } = require('@opentelemetry/instrumentation-fastify')
  const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http')
  const { PgInstrumentation } = require('@opentelemetry/instrumentation-pg')

  const { ignoreIncomingRequestHook, setup } = require('./otel')

  const instrumentations = [
    // Fastify instrumentation expects HTTP layer to be instrumented
    new HttpInstrumentation({ ignoreIncomingRequestHook }),
    new FastifyInstrumentation(),
    new PgInstrumentation()
  ];

  return setup(serviceName, instrumentations);
}

function createMetrics(meter, metricAttrs) {
  const {
    getCPUUsage,
    getELUUsage,
  } = require('./tools')

  const requestCounter = meter.createCounter('http.requests', {
    description: 'HTTP Requests Counter',
  })

  const cpuUsage = meter.createObservableGauge('process.cpu', {
    description: 'CPU Usage',
  })

  cpuUsage.addCallback(result => {
    result.observe(getCPUUsage(), metricAttrs);
  })

  const eluUsage = meter.createObservableGauge('thread.elu', {
    description: 'ELU Usage',
  })

  eluUsage.addCallback(result => {
    result.observe(getELUUsage(), metricAttrs)
  })

  return {
    cpuUsage,
    eluUsage,
    requestCounter
  }
}

// Setting up observability BEFORE our actual code.
const { meter, metricAttrs, tracer } = setupOpentelemetry('Service 1')
// Create metric instruments
const { requestCounter } = createMetrics(meter, metricAttrs)

const api = require('@opentelemetry/api')
const port = process.env.PORT || 8080;
const fastify = require('fastify')();
const fetch = require('node-fetch');
const { setTimeout } = require('node:timers/promises')
const { Pool } = require('pg')
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: process.env.PG_PORT || 5432,
  user: 'postgres',
  password: 'postgres'
})

fastify.register(PgConnectionPlugin);

fastify.get('/users/:id', async (req, reply) => {
  requestCounter.add(1, metricAttrs);
  const id = req.params.id;
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE user_id=$1', [ id ]);
    if (rows.length > 0) {
      const randomTimeout = generateRandomInt(1, 200);
      await setTimeout(randomTimeout);
      const activeSpan = api.trace.getSpan(api.context.active());
      activeSpan.addEvent(`Response Generated after ${randomTimeout} ms`);
      reply.send(rows);
    } else {
      await fetch('http://service_2:8080/high_cpu');
      reply.send({});
    }
  } catch (err) {
    const activeSpan = api.trace.getSpan(api.context.active());
    activeSpan.recordException(err);
    return reply.send(err);
  }
})

fastify.listen({ host: '0.0.0.0', port }, (err, address) => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
  // Server is now listening on ${address}
})

function PgConnectionPlugin(fastify, opts, cb) {
  pool.connect((err, client, release) => {
    if (err) {
      return cb(err);
    }

    release();
    cb();
  });
}

function generateRandomInt(min, max) {
  min = Math.ceil(min)
  max = Math.floor(max)
  return Math.floor(Math.random() * (max - min + 1) + min)
}
