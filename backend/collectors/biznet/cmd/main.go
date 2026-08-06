package main

import (
	"errors"
	"log"
	"net/http"
	"os"
	"time"

	"cirrus/collector-biznet/internal"
	"cirrus/collectorkit"
)

const providerName = "biznet"

var rbacClient *collectorkit.RBACClient

func main() {
	rbacClient = collectorkit.NewRBACClient(requireEnv("RBAC_URL"), requireEnv("INTERNAL_SHARED_SECRET"))

	mux := http.NewServeMux()
	// Two product-line list calls (parallel) plus a bounded fan-out of
	// per-VM vm-details calls doesn't fit in the old 5s stub-era budget.
	mux.Handle("GET /instances", collectorkit.WithTimeout(http.HandlerFunc(handleInstances), 15*time.Second))
	// The lightweight connection test is a single unauthenticated-shape GET.
	mux.Handle("GET /test", collectorkit.WithTimeout(http.HandlerFunc(handleTest), 5*time.Second))
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

	ctx := r.Context()
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

	ctx := r.Context()
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
