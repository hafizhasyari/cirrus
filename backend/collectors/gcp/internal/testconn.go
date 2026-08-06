package internal

import (
	"context"
	"encoding/json"
	"fmt"
)

// TestConnection performs the cheapest authenticated call per PRD §7.3's GCP
// checklist — the WIF token exchange itself, then
// resourcemanager.testIamPermissions — without listing any real instances.
func TestConnection(ctx context.Context, connectionID string, raw json.RawMessage) (string, error) {
	var gcfg gcpConfig
	if err := json.Unmarshal(raw, &gcfg); err != nil ||
		gcfg.ProjectNumber == "" || gcfg.PoolID == "" || gcfg.ProviderID == "" || gcfg.SAEmail == "" {
		return "", fmt.Errorf("%w: missing/invalid WIF config (projectId/poolId/providerId/saEmail)", ErrAuthFailed)
	}

	ts, err := buildTestTokenSource(ctx, connectionID, gcfg)
	if err != nil {
		return "", err
	}

	granted, err := testIamPermissions(ctx, ts, gcfg.ProjectNumber)
	if err != nil {
		return "", err
	}

	return fmt.Sprintf("WIF token exchange ok; permissions granted: %v", granted), nil
}
