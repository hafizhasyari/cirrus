package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"cirrus/collector-oci/internal"
	"cirrus/collectorkit"
)

const providerName = "oci"

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /instances", handleInstances)
	mux.HandleFunc("GET /healthz", collectorkit.HealthHandler)

	handler := collectorkit.WithTimeout(mux, 5*time.Second)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("%s collector listening on :%s", providerName, port)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatal(err)
	}
}

func handleInstances(w http.ResponseWriter, r *http.Request) {
	connectionID := r.URL.Query().Get("connectionId")
	if connectionID == "" {
		collectorkit.WriteJSON(w, http.StatusBadRequest, collectorkit.ErrorResponse{
			Error: collectorkit.ErrorBody{Code: "UPSTREAM_ERROR", Message: "connectionId query param is required"},
		})
		return
	}

	select {
	case <-r.Context().Done():
		return
	default:
	}

	collectorkit.WriteJSON(w, http.StatusOK, collectorkit.InstancesResponse{
		ConnectionID: connectionID,
		Provider:     providerName,
		FetchedAt:    time.Now().UTC().Format(time.RFC3339),
		Instances:    internal.GenerateInstances(connectionID),
	})
}
