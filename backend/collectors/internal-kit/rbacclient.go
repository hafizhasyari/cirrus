package collectorkit

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	neturl "net/url"
	"time"
)

// ConnectionConfig is RBAC's internal-only single-connection lookup response.
// Config stays opaque (json.RawMessage) — each collector's own package is
// the only place that knows its own provider-specific field shape
// ({accessKeyId, secretAccessKey} for AWS/Alibaba,
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
//
// Provider/CollectorSecret authenticate this specific call as "the aws
// collector", not just "some trusted internal service" — GetConnectionConfig
// returns a connection's config with its Vault secret merged in, plaintext,
// so RBAC additionally checks the caller is the one collector allowed to
// read connections of that provider (routes/internal.ts). Distinct from
// Secret (the general INTERNAL_SHARED_SECRET every internal service shares).
type RBACClient struct {
	BaseURL         string
	Secret          string
	Provider        string
	CollectorSecret string
	HTTP            *http.Client
}

func NewRBACClient(baseURL, secret, provider, collectorSecret string) *RBACClient {
	return &RBACClient{
		BaseURL:         baseURL,
		Secret:          secret,
		Provider:        provider,
		CollectorSecret: collectorSecret,
		HTTP:            &http.Client{Timeout: 10 * time.Second},
	}
}

// GetConnectionConfig calls GET {BaseURL}/internal/connections/{connectionID}.
// The optional testToken (used only by /test's ephemeral, currently-typed-
// but-unsaved config path — see rbac's lib/testOverrides.ts) is a variadic
// so every existing call site (the full /instances fetch, which never has
// one) is unaffected.
func (c *RBACClient) GetConnectionConfig(ctx context.Context, connectionID string, testToken ...string) (*ConnectionConfig, error) {
	url := c.BaseURL + "/internal/connections/" + connectionID
	if len(testToken) > 0 && testToken[0] != "" {
		url += "?testToken=" + neturl.QueryEscape(testToken[0])
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("collectorkit: building rbac request: %w", err)
	}
	req.Header.Set("X-Internal-Secret", c.Secret)
	req.Header.Set("X-Collector-Provider", c.Provider)
	req.Header.Set("X-Collector-Secret", c.CollectorSecret)
	if id := requestIDFromContext(ctx); id != "" {
		req.Header.Set("X-Request-Id", id)
	}

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
