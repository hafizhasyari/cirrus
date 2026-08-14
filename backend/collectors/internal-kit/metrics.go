package collectorkit

import (
	"net/http"
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Metrics is a per-collector-process Prometheus registry plus the two
// generic HTTP metrics every collector exposes the same way (mirrors the 4
// Node services' own lib/metrics.ts one-for-one). Route-level detail (which
// provider call failed, AUTH_FAILED vs UPSTREAM_ERROR) already lives in each
// collector's own JSON error body and logs — status-code-only granularity
// here is enough to answer "is this collector up and responding."
type Metrics struct {
	registry        *prometheus.Registry
	requestsTotal   *prometheus.CounterVec
	requestDuration *prometheus.HistogramVec
}

// NewMetrics builds a fresh registry for one collector process, labeled with
// its own provider name so multiple collectors' scraped output (each on its
// own /metrics endpoint) stays unambiguous once aggregated in Prometheus.
func NewMetrics(provider string) *Metrics {
	reg := prometheus.NewRegistry()
	reg.MustRegister(prometheus.NewGoCollector())
	reg.MustRegister(prometheus.NewProcessCollector(prometheus.ProcessCollectorOpts{}))

	requestsTotal := prometheus.NewCounterVec(prometheus.CounterOpts{
		Name:        "collector_requests_total",
		Help:        "Total requests handled by this collector, labeled by route and response status code.",
		ConstLabels: prometheus.Labels{"provider": provider},
	}, []string{"route", "status_code"})
	reg.MustRegister(requestsTotal)

	requestDuration := prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:        "collector_request_duration_seconds",
		Help:        "Request duration in seconds, labeled by route.",
		ConstLabels: prometheus.Labels{"provider": provider},
	}, []string{"route"})
	reg.MustRegister(requestDuration)

	return &Metrics{registry: reg, requestsTotal: requestsTotal, requestDuration: requestDuration}
}

// Handler backs GET /metrics.
func (m *Metrics) Handler() http.Handler {
	return promhttp.HandlerFor(m.registry, promhttp.HandlerOpts{})
}

// statusCapturingWriter records the status code eventually written so Wrap
// can label the metric with it — net/http gives no other way to observe
// what a wrapped handler (or http.TimeoutHandler, if this wraps one) ends
// up sending.
type statusCapturingWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusCapturingWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

// Wrap instruments h under the given route label (e.g. "instances", "test").
// Put this outermost around WithTimeout so it captures whatever status the
// timeout handler itself eventually writes too, not just a normal return.
func (m *Metrics) Wrap(h http.Handler, route string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sw := &statusCapturingWriter{ResponseWriter: w, status: http.StatusOK}
		start := time.Now()
		h.ServeHTTP(sw, r)
		m.requestDuration.WithLabelValues(route).Observe(time.Since(start).Seconds())
		m.requestsTotal.WithLabelValues(route, strconv.Itoa(sw.status)).Inc()
	})
}
