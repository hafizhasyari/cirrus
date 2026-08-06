package internal

import (
	"context"
	"encoding/json"
	"fmt"

	"cirrus/collectorkit"
)

// GenerateInstances exchanges a connection's WIF config for a federated +
// impersonated GCP access token, then returns a real Compute Engine
// inventory for that project (or a classified error — ErrAuthFailed /
// ErrUpstream, see errors.go).
func GenerateInstances(ctx context.Context, connectionID string, raw json.RawMessage) ([]collectorkit.Instance, error) {
	var gcfg gcpConfig
	if err := json.Unmarshal(raw, &gcfg); err != nil ||
		gcfg.ProjectNumber == "" || gcfg.PoolID == "" || gcfg.ProviderID == "" || gcfg.SAEmail == "" {
		return nil, fmt.Errorf("%w: missing/invalid WIF config (projectId/poolId/providerId/saEmail)", ErrAuthFailed)
	}

	ts, err := buildTokenSource(ctx, connectionID, gcfg)
	if err != nil {
		return nil, err
	}

	return fetchInstances(ctx, ts, gcfg.ProjectNumber)
}
