package internal

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"time"
)

const baseURL = "https://api.portal.biznetgio.com/v1"

type biznetClient struct {
	token string
	http  *http.Client
}

func newBiznetClient(token string) *biznetClient {
	return &biznetClient{token: token, http: &http.Client{Timeout: 10 * time.Second}}
}

// getRaw returns the raw response body — the caller decodes it, since
// Biznet's real OpenAPI spec declares an empty response schema for every
// endpoint here (no confirmed shape to decode straight into a struct).
func (c *biznetClient) getRaw(ctx context.Context, path string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+path, nil)
	if err != nil {
		return nil, fmt.Errorf("%w: building request: %v", ErrUpstream, err)
	}
	req.Header.Set("x-token", c.token)

	res, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUpstream, err)
	}
	defer res.Body.Close()

	body, readErr := io.ReadAll(res.Body)

	if res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden {
		return nil, fmt.Errorf("%w: x-token rejected (%d)", ErrAuthFailed, res.StatusCode)
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w: biznet responded %d: %s", ErrUpstream, res.StatusCode, string(body))
	}
	if readErr != nil {
		return nil, fmt.Errorf("%w: reading response: %v", ErrUpstream, readErr)
	}
	return body, nil
}
