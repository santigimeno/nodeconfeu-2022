'use strict';

const { ConsoleSpanExporter,
        SimpleSpanProcessor,
        BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base')
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node')
const { MeterProvider } = require('@opentelemetry/sdk-metrics-base')
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http')
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus')
const { Resource } = require('@opentelemetry/resources')
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions')
const { registerInstrumentations } = require('@opentelemetry/instrumentation')

function setup(serviceName, instrumentations) {
  const attrs = {
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    [SemanticResourceAttributes.CONTAINER_ID]: require('os').hostname()
  };

  // Create the TracerProvider for Node.js
  const provider = new NodeTracerProvider({
    resource: new Resource(attrs)
  });

  // Setup OTLP over HTTP exporter
  const jaegerEndpoint = process.env.JAEGER_OTLP_ENDPOINT || 'localhost';
  provider.addSpanProcessor(new BatchSpanProcessor(new OTLPTraceExporter({
    url: `http://${jaegerEndpoint}:4318/v1/traces`
  })));

  // Uncomment this to activate trace logging to the console.
  // provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  provider.register();

  registerInstrumentations(instrumentations);

  // Tracer instance to allow for manual Span creation.
  const tracer = provider.getTracer(serviceName);
  
  // Creates MeterProvider and installs the exporter as a MetricReader
  const meterProvider = new MeterProvider({
    resource: new Resource(attrs)
  });

  // Setup Prometheus exporter
  const exporter = new PrometheusExporter({}, () => {
    const { endpoint, port } = PrometheusExporter.DEFAULT_OPTIONS;
    console.log(
      `prometheus scrape endpoint: http://localhost:${port}${endpoint}`,
    );
  });

  meterProvider.addMetricReader(exporter);
  // Meter instance allows to create Meter Instruments (counter, gauges, etc.)
  const meter = meterProvider.getMeter(serviceName);
  return {
    meter,
    metricAttrs: attrs,
    tracer
  }
}

// Ignore incoming Prometheus requests
function ignoreIncomingRequestHook(req) {
  return req.headers &&
         req.headers['user-agent'] &&
         req.headers['user-agent'].startsWith('Prometheus');
}

module.exports = {
  ignoreIncomingRequestHook,
  setup
}