"""OpenTelemetry tracing for the web process, on only when an OTLP endpoint is set.

Probes are never traced. Log lines inside a span carry its `trace_id` and `span_id`.
"""

from typing import Any

from fastapi import FastAPI
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SpanExporter

PROBES = "healthz,readyz"


def configure_tracing(
    app: FastAPI, endpoint: str | None, exporter: SpanExporter | None = None
) -> TracerProvider | None:
    if exporter is None:
        if not endpoint:
            return None
        exporter = OTLPSpanExporter(endpoint=f"{endpoint.rstrip('/')}/v1/traces")
    provider = TracerProvider(resource=Resource.create({"service.name": "web"}))
    provider.add_span_processor(BatchSpanProcessor(exporter))
    FastAPIInstrumentor.instrument_app(app, tracer_provider=provider, excluded_urls=PROBES)
    return provider


def add_trace_ids(_logger: Any, _method: str, event: dict[str, Any]) -> dict[str, Any]:
    context = trace.get_current_span().get_span_context()
    if context.is_valid:
        event["trace_id"] = format(context.trace_id, "032x")
        event["span_id"] = format(context.span_id, "016x")
    return event
