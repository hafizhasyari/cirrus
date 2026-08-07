package collectorkit

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

// ConnectionConfig is RBAC's internal-only single-connection lookup response.
// Config stays opaque (json.RawMessage) — each collector's own package is
// the only place that knows its own provider-specific field shape
// ({accessKeyId, secretAccessKey} for AWS, {roleArn, regionId} for Alibaba,
// {projectId, poolId, providerId, saEmail} for GCP), preserving the
// isolation goal: this shared client carries zero provider-specific logic.
type ConnectionConfig struct {
	ConnectionID string          `json:"connectionId"`
	Provider     string          `json:"provider"`
	Account      string          `json:"account"`
	Identifier   string          `json:"identifier"`
	Status       string          `json:"status"`
	Config       json.RawMessage `json:"config"`
}

// ErrConnectionNotFound is returned when RBAC 404s the lookup.
var ErrConnectionNotFound = errors.New("collectorkit: connection not found")

// RBACClient fetches a connection's config from RBAC's internal API — the
// only path a collector has to provider-specific credentials/config; the
// Aggregator never sees or forwards this material.
type RBACClient struct {
	BaseURL string
	Secret  string
	HTTP    *http.Client
}

func NewRBACClient(baseURL, secret string) *RBACClient {
	return &RBACClient{
		BaseURL: baseURL,
		Secret:  secret,
		HTTP:    &http.Client{Timeout: 10 * time.Second},
	}
}

// GetConnectionConfig calls GET {BaseURL}/internal/connections/{connectionID}.
func (c *RBACClient) GetConnectionConfig(ctx context.Context, connectionID string) (*ConnectionConfig, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+"/internal/connections/"+connectionID, nil)
	if err != nil {
		return nil, fmt.Errorf("collectorkit: building rbac request: %w", err)
	}
	req.Header.Set("X-Internal-Secret", c.Secret)

	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("collectorkit: calling rbac: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode == http.StatusNotFound {
		return nil, ErrConnectionNotFound
	}
	if res.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(res.Body)
		return nil, fmt.Errorf("collectorkit: rbac responded %d: %s", res.StatusCode, string(body))
	}

	var cfg ConnectionConfig
	if err := json.NewDecoder(res.Body).Decode(&cfg); err != nil {
		return nil, fmt.Errorf("collectorkit: decoding rbac response: %w", err)
	}
	return &cfg, nil
}
