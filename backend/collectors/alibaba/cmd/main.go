package main

import (
	"errors"
	"log"
	"net/http"
	"os"
	"time"

	"cirrus/collector-alibaba/internal"
	"cirrus/collectorkit"
)

const providerName = "alibaba"

var rbacClient *collectorkit.RBACClient

func main() {
	rbacClient = collectorkit.NewRBACClient(requireEnv("RBAC_URL"), requireEnv("INTERNAL_SHARED_SECRET"))

	mux := http.NewServeMux()
	// Now fans out across every enabled region (DescribeRegions + per-region
	// DescribeInstances, see internal/instances.go), not just one — needs
	// more than the old single-region 10s budget, though still less than
	// AWS's 45s since each Alibaba region only makes one paginated
	// DescribeInstances call, no extra DescribeVolumes/DescribeInstanceTypes
	// round-trips. Each region is separately bounded by the SDK's own
	// ReadTimeout/ConnectTimeout (regionFetchTimeoutMs in instances.go) since
	// Alibaba's tea-generated SDK methods don't accept a Go context at all —
	// unlike AWS, deriving a cancellable context here wouldn't actually stop
	// an in-flight call, so this handler doesn't bother.
	mux.Handle("GET /instances", collectorkit.WithTimeout(http.HandlerFunc(handleInstances), 30*time.Second))
	// The lightweight connection test is AssumeRole + one identity call only.
	mux.Handle("GET /test", collectorkit.WithTimeout(http.HandlerFunc(handleTest), 10*time.Second))
	mux.HandleFunc("GET /healthz", collectorkit.HealthHandler)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("%s collector listening on :%s", providerName, port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}

func requireEnv(name string) string {
	v := os.Getenv(name)
	if v == "" {
		log.Fatalf("missing required env var: %s", name)
	}
	return v
}

func handleInstances(w http.ResponseWriter, r *http.Request) {
	connectionID := r.URL.Query().Get("connectionId")
	if connectionID == "" {
		collectorkit.WriteJSON(w, http.StatusBadRequest, collectorkit.ErrorResponse{
			Error: collectorkit.ErrorBody{Code: "UPSTREAM_ERROR", Message: "connectionId query param is required"},
		})
		return
	}

	ctx := collectorkit.WithRequestID(r.Context(), r)
	select {
	case <-ctx.Done():
		return
	default:
	}

	cfg, err := rbacClient.GetConnectionConfig(ctx, connectionID)
	if err != nil {
		if errors.Is(err, collectorkit.ErrConnectionNotFound) {
			collectorkit.WriteJSON(w, http.StatusBadGateway, collectorkit.ErrorResponse{
				Error: collectorkit.ErrorBody{Code: "AUTH_FAILED", Message: "connection not found in RBAC"},
			})
			return
		}
		collectorkit.WriteJSON(w, http.StatusBadGateway, collectorkit.ErrorResponse{
			Error: collectorkit.ErrorBody{Code: "UPSTREAM_ERROR", Message: err.Error()},
		})
		return
	}

	instances, err := internal.FetchInstances(ctx, cfg.Config)
	if err != nil {
		code := "UPSTREAM_ERROR"
		if errors.Is(err, internal.ErrAuthFailed) {
			code = "AUTH_FAILED"
		}
		collectorkit.WriteJSON(w, http.StatusBadGateway, collectorkit.ErrorResponse{
			Error: collectorkit.ErrorBody{Code: code, Message: err.Error()},
		})
		return
	}

	collectorkit.WriteJSON(w, http.StatusOK, collectorkit.InstancesResponse{
		ConnectionID: connectionID,
		Provider:     providerName,
		FetchedAt:    time.Now().UTC().Format(time.RFC3339),
		Instances:    instances,
	})
}

func handleTest(w http.ResponseWriter, r *http.Request) {
	connectionID := r.URL.Query().Get("connectionId")
	if connectionID == "" {
		collectorkit.WriteJSON(w, http.StatusBadRequest, collectorkit.ErrorResponse{
			Error: collectorkit.ErrorBody{Code: "UPSTREAM_ERROR", Message: "connectionId query param is required"},
		})
		return
	}
	testToken := r.URL.Query().Get("testToken")

	ctx := collectorkit.WithRequestID(r.Context(), r)
	select {
	case <-ctx.Done():
		return
	default:
	}

	cfg, err := rbacClient.GetConnectionConfig(ctx, connectionID, testToken)
	if err != nil {
		if errors.Is(err, collectorkit.ErrConnectionNotFound) {
			collectorkit.WriteJSON(w, http.StatusBadGateway, collectorkit.ErrorResponse{
				Error: collectorkit.ErrorBody{Code: "AUTH_FAILED", Message: "connection not found in RBAC"},
			})
			return
		}
		collectorkit.WriteJSON(w, http.StatusBadGateway, collectorkit.ErrorResponse{
			Error: collectorkit.ErrorBody{Code: "UPSTREAM_ERROR", Message: err.Error()},
		})
		return
	}

	message, err := internal.TestConnection(ctx, cfg.Config)
	if err != nil {
		code := "UPSTREAM_ERROR"
		if errors.Is(err, internal.ErrAuthFailed) {
			code = "AUTH_FAILED"
		}
		collectorkit.WriteJSON(w, http.StatusBadGateway, collectorkit.ErrorResponse{
			Error: collectorkit.ErrorBody{Code: code, Message: err.Error()},
		})
		return
	}

	collectorkit.WriteJSON(w, http.StatusOK, collectorkit.TestResult{
		ConnectionID: connectionID,
		Provider:     providerName,
		CheckedAt:    time.Now().UTC().Format(time.RFC3339),
		Message:      message,
	})
}
