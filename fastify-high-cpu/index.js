'use strict';

function setupOpentelemetry(serviceName) {
  const { FastifyInstrumentation } = require('@opentelemetry/instrumentation-fastify')
  const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http')

  const { ignoreIncomingRequestHook, setup } = require('./otel')

  const instrumentations = [
    // Fastify instrumentation expects HTTP layer to be instrumented
    new HttpInstrumentation({ ignoreIncomingRequestHook }),
    new FastifyInstrumentation()
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
    const cpu = getCPUUsage();
    console.log('cpu', cpu);
    result.observe(cpu, metricAttrs);
  })

  const eluUsage = meter.createObservableGauge('thread.elu', {
    description: 'ELU Usage',
  })

  eluUsage.addCallback(result => {
    const elu = getELUUsage();
    console.log('elu', elu);
    result.observe(elu, metricAttrs)
  })

  return {
    cpuUsage,
    eluUsage,
    requestCounter
  }
}

// Setting up observability BEFORE our actual code.
const { meter, metricAttrs, tracer } = setupOpentelemetry('Service 2')
// Create metric instruments
const { requestCounter } = createMetrics(meter, metricAttrs)

const port = process.env.PORT || 8080;
const fastify = require('fastify')();

function fib(n) {
  if (n === 0 || n === 1) return n;
  return fib(n - 1) + fib(n - 2);
}

fastify.get('/high_cpu', (req, reply) => {
  requestCounter.add(1, metricAttrs);
  const value = fib(37);
  reply.send({ value });
})

fastify.listen({ host: '0.0.0.0', port }, (err, address) => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
  // Server is now listening on ${address}
})
