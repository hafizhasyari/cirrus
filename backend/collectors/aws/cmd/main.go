package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"time"

	"cirrus/collector-aws/internal"
	"cirrus/collectorkit"
)

const providerName = "aws"

// instancesTimeout is the hard upper bound for a full multi-region fetch —
// real accounts with many enabled regions legitimately need more than the
// old 20s stub-era budget now that each region is individually bounded to
// 12s (see internal.FetchInstances), so a single bad region can't stall the
// rest.
const instancesTimeout = 45 * time.Second

var rbacClient *collectorkit.RBACClient

func main() {
	rbacClient = collectorkit.NewRBACClient(requireEnv("RBAC_URL"), requireEnv("INTERNAL_SHARED_SECRET"))

	mux := http.NewServeMux()
	// Real multi-region DescribeInstances/DescribeVolumes/DescribeInstanceTypes
	// doesn't fit in the old 5s stub-era budget.
	mux.Handle("GET /instances", collectorkit.WithTimeout(http.HandlerFunc(handleInstances), instancesTimeout))
	// The lightweight connection test is just two single-call APIs, no region
	// fan-out — a much smaller budget than the full fetch.
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

	// http.TimeoutHandler (collectorkit.WithTimeout) doesn't cancel r.Context()
	// when it fires — it just writes its own timeout response while the
	// handler keeps running in the background. Deriving our own deadline here
	// makes the AWS SDK's in-flight calls actually stop instead of leaking
	// goroutines/API calls past the point the client already gave up.
	ctx, cancel := context.WithTimeout(collectorkit.WithRequestID(r.Context(), r), instancesTimeout)
	defer cancel()
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
