package internal

import (
	"context"
	"encoding/json"
	"fmt"
)

// TestConnection performs the cheapest authenticated call per PRD §7.3's
// Biznet Gio checklist — a single GET against the NEO Lite accounts list,
// discarding the body, since a 200 response alone confirms the x-token.
func TestConnection(ctx context.Context, raw json.RawMessage) (string, error) {
	var cc connectionConfig
	if err := json.Unmarshal(raw, &cc); err != nil || cc.XToken == "" {
		return "", fmt.Errorf("%w: missing/invalid xToken in connection config", ErrAuthFailed)
	}

	if _, err := newBiznetClient(cc.XToken).getRaw(ctx, "/neolites/accounts"); err != nil {
		return "", err
	}

	return "x-token accepted; GET /neolites/accounts confirmed", nil
}
