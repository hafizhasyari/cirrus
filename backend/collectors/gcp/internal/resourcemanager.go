package internal

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"golang.org/x/oauth2"
)

var resourceManagerHTTPClient = &http.Client{Timeout: 10 * time.Second}

// testIamPermissions calls Cloud Resource Manager v3's testIamPermissions —
// PRD §7.3's GCP checklist item confirming the impersonated service account
// has at least compute-read scope on the project. The call itself requires
// no IAM permission to make, only to interpret which permissions come back
// granted, so a plain net/http call (no SDK dependency) is enough for this
// single lightweight check.
func testIamPermissions(ctx context.Context, ts oauth2.TokenSource, projectNumber string) ([]string, error) {
	token, err := ts.Token()
	if err != nil {
		return nil, fmt.Errorf("%w: minting access token: %v", ErrAuthFailed, err)
	}

	reqBody, err := json.Marshal(map[string][]string{"permissions": {"compute.instances.list"}})
	if err != nil {
		return nil, fmt.Errorf("%w: encoding testIamPermissions request: %v", ErrUpstream, err)
	}

	url := fmt.Sprintf("https://cloudresourcemanager.googleapis.com/v3/projects/%s:testIamPermissions", projectNumber)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(reqBody))
	if err != nil {
		return nil, fmt.Errorf("%w: building testIamPermissions request: %v", ErrUpstream, err)
	}
	req.Header.Set("Content-Type", "application/json")
	token.SetAuthHeader(req)

	res, err := resourceManagerHTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: calling cloudresourcemanager: %v", ErrUpstream, err)
	}
	defer res.Body.Close()

	body, _ := io.ReadAll(res.Body)

	if res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden {
		return nil, fmt.Errorf("%w: testIamPermissions rejected (%d): %s", ErrAuthFailed, res.StatusCode, string(body))
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w: cloudresourcemanager responded %d: %s", ErrUpstream, res.StatusCode, string(body))
	}

	var parsed struct {
		Permissions []string `json:"permissions"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("%w: decoding testIamPermissions response: %v", ErrUpstream, err)
	}
	return parsed.Permissions, nil
}
