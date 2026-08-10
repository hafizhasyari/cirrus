package internal

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google/externalaccount"
)

// subjectTokenSupplier plugs Cirrus's own Auth Service into the
// externalaccount package's WIF exchange — externalaccount handles the
// STS token-exchange and service-account impersonation calls internally
// once it has a fresh subject token from us.
type subjectTokenSupplier struct {
	connectionID string
}

func (s *subjectTokenSupplier) SubjectToken(ctx context.Context, opts externalaccount.SupplierOptions) (string, error) {
	return mintWifToken(ctx, s.connectionID, opts.Audience)
}

var (
	tokenSourceCacheMu sync.Mutex
	tokenSourceCache    = map[string]oauth2.TokenSource{}
)

// buildTokenSource builds (or reuses, per-connection) an oauth2.TokenSource
// that performs the full WIF exchange: Cirrus JWT -> GCP STS federated token
// -> service-account impersonation. Cached per connection so repeated
// Aggregator cache-refill cycles don't re-run the whole chain every time —
// oauth2.ReuseTokenSource handles refresh-on-expiry transparently.
func buildTokenSource(ctx context.Context, connectionID string, gcfg gcpConfig) (oauth2.TokenSource, error) {
	return cachedTokenSource(ctx, connectionID, gcfg, []string{"https://www.googleapis.com/auth/compute.readonly"})
}

// buildTestTokenSource is the connection-test equivalent of buildTokenSource
// — same WIF exchange, but scoped broadly enough
// ("cloud-platform.read-only") to also call Cloud Resource Manager's
// testIamPermissions, which compute.readonly's narrower scope doesn't cover.
// Cached under a distinct key so it never collides with the full-fetch
// token source above.
func buildTestTokenSource(ctx context.Context, connectionID string, gcfg gcpConfig) (oauth2.TokenSource, error) {
	return cachedTokenSource(ctx, connectionID+":test", gcfg, []string{"https://www.googleapis.com/auth/cloud-platform.read-only"})
}

func cachedTokenSource(ctx context.Context, cacheKey string, gcfg gcpConfig, scopes []string) (oauth2.TokenSource, error) {
	tokenSourceCacheMu.Lock()
	if ts, ok := tokenSourceCache[cacheKey]; ok {
		tokenSourceCacheMu.Unlock()
		return ts, nil
	}
	tokenSourceCacheMu.Unlock()

	audience := fmt.Sprintf(
		"//iam.googleapis.com/projects/%s/locations/global/workloadIdentityPools/%s/providers/%s",
		gcfg.ProjectNumber, gcfg.PoolID, gcfg.ProviderID,
	)

	// The subjectTokenSupplier mints a fresh Cirrus WIF JWT per exchange —
	// it only needs the real connectionID (not the ":test"-suffixed cache
	// key) to look up the connection's config on the Auth Service side.
	connectionID := strings.TrimSuffix(cacheKey, ":test")

	cfg := externalaccount.Config{
		Audience:                       audience,
		SubjectTokenType:               "urn:ietf:params:oauth:token-type:jwt",
		TokenURL:                       "https://sts.googleapis.com/v1/token",
		ServiceAccountImpersonationURL: fmt.Sprintf("https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/%s:generateAccessToken", gcfg.SAEmail),
		SubjectTokenSupplier:           &subjectTokenSupplier{connectionID: connectionID},
		Scopes:                         scopes,
	}

	// Deliberately context.Background(), not the caller's ctx: this token
	// source is cached and reused across future requests (see below), but a
	// request-scoped ctx is canceled the moment the request that created it
	// returns — every later reuse would then fail immediately with "context
	// canceled" instead of attempting a real refresh, since externalaccount's
	// TokenSource has no per-call ctx param to override it with.
	base, err := externalaccount.NewTokenSource(context.Background(), cfg)
	if err != nil {
		return nil, fmt.Errorf("%w: building WIF token source: %v", ErrAuthFailed, err)
	}

	ts := oauth2.ReuseTokenSource(nil, base)

	tokenSourceCacheMu.Lock()
	tokenSourceCache[cacheKey] = ts
	tokenSourceCacheMu.Unlock()

	return ts, nil
}
