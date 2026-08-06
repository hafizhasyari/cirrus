package internal

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

var authHTTPClient = &http.Client{Timeout: 10 * time.Second}

type wifTokenResponse struct {
	Token     string `json:"token"`
	ExpiresIn int    `json:"expiresIn"`
}

// mintWifToken calls the Auth Service's internal-only POST /internal/wif-token
// to get a fresh, short-lived JWT for the given connection+audience, which
// this collector then exchanges via GCP's STS for a federated access token.
func mintWifToken(ctx context.Context, connectionID, audience string) (string, error) {
	body, err := json.Marshal(map[string]string{"connectionId": connectionID, "audience": audience})
	if err != nil {
		return "", fmt.Errorf("%w: encoding wif-token request: %v", ErrUpstream, err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, os.Getenv("AUTH_URL")+"/internal/wif-token", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("%w: building wif-token request: %v", ErrUpstream, err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Secret", os.Getenv("INTERNAL_SHARED_SECRET"))

	res, err := authHTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("%w: calling auth service: %v", ErrUpstream, err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(res.Body)
		return "", fmt.Errorf("%w: auth service responded %d: %s", ErrUpstream, res.StatusCode, string(respBody))
	}

	var parsed wifTokenResponse
	if err := json.NewDecoder(res.Body).Decode(&parsed); err != nil {
		return "", fmt.Errorf("%w: decoding wif-token response: %v", ErrUpstream, err)
	}
	return parsed.Token, nil
}
