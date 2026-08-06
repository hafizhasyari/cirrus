package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"

	"cirrus/collectorkit"
)

type connectionConfig struct {
	XToken string `json:"xToken"`
}

// productLine pairs a Biznet Portal resource path with the InstanceType
// prefix the stub used to distinguish the two NEO product lines.
type productLine struct {
	listPath   string
	detailPath func(id string) string
	label      string
}

var productLines = []productLine{
	{
		listPath:   "/neolites/accounts",
		detailPath: func(id string) string { return "/neolites/" + id + "/vm-details" },
		label:      "NEO Lite ",
	},
	{
		listPath:   "/neolite-pros/accounts",
		detailPath: func(id string) string { return "/neolite-pros/" + id + "/vm-details" },
		label:      "NEO Lite Pro ",
	},
}

// detailFetchConcurrency bounds parallel vm-details lookups per product
// line — a plain channel semaphore, not errgroup, to keep this collector
// dependency-free.
const detailFetchConcurrency = 8

// FetchInstances resolves the connection's x-token and fans out to both NEO
// Lite/NEO Lite Pro product lines in parallel, merging their results. A
// failure in one product line doesn't fail the whole fetch as long as the
// other succeeds — only erroring out if both fail.
func FetchInstances(ctx context.Context, raw json.RawMessage) ([]collectorkit.Instance, error) {
	var cc connectionConfig
	if err := json.Unmarshal(raw, &cc); err != nil || cc.XToken == "" {
		return nil, fmt.Errorf("%w: missing/invalid xToken in connection config", ErrAuthFailed)
	}
	client := newBiznetClient(cc.XToken)

	type lineResult struct {
		instances []collectorkit.Instance
		err       error
	}
	results := make([]lineResult, len(productLines))

	var wg sync.WaitGroup
	for i, pl := range productLines {
		wg.Add(1)
		go func(i int, pl productLine) {
			defer wg.Done()
			instances, err := fetchProductLine(ctx, client, pl)
			results[i] = lineResult{instances: instances, err: err}
		}(i, pl)
	}
	wg.Wait()

	var merged []collectorkit.Instance
	failures := 0
	var lastErr error
	for _, r := range results {
		if r.err != nil {
			failures++
			lastErr = r.err
			continue
		}
		merged = append(merged, r.instances...)
	}

	// Only error out if every product line failed — a single failing line
	// (e.g. a tenant with no NEO Lite Pro subscription at all) shouldn't
	// hide the other line's real inventory.
	if failures == len(results) {
		return nil, lastErr
	}

	if merged == nil {
		merged = []collectorkit.Instance{}
	}
	return merged, nil
}

// fetchProductLine lists accounts for one product line, then fills in
// cpu/memory for any list item that's missing spec fields via a bounded
// number of parallel vm-details calls.
func fetchProductLine(ctx context.Context, client *biznetClient, pl productLine) ([]collectorkit.Instance, error) {
	body, err := client.getRaw(ctx, pl.listPath)
	if err != nil {
		return nil, err
	}
	items := decodeList(body)

	type detailed struct {
		listRaw   json.RawMessage
		detailRaw json.RawMessage
	}
	prepared := make([]detailed, len(items))
	for i, item := range items {
		prepared[i] = detailed{listRaw: item}
	}

	sem := make(chan struct{}, detailFetchConcurrency)
	var wg sync.WaitGroup
	for i, item := range items {
		if hasSpecFields(item) {
			continue
		}
		id := instanceID(item)
		if id == "" {
			continue
		}
		wg.Add(1)
		sem <- struct{}{}
		go func(i int, id string) {
			defer wg.Done()
			defer func() { <-sem }()
			detailBody, err := client.getRaw(ctx, pl.detailPath(id))
			if err != nil {
				return // fall back to the thin list item
			}
			prepared[i].detailRaw = firstOrSelf(decodeList(detailBody), detailBody)
		}(i, id)
	}
	wg.Wait()

	result := make([]collectorkit.Instance, 0, len(prepared))
	for _, p := range prepared {
		result = append(result, mapInstance(p.listRaw, p.detailRaw, pl.label))
	}
	return result, nil
}

// firstOrSelf handles vm-details responses that come back as either a
// single object or a single-element array — undocumented, so both are
// tolerated.
func firstOrSelf(list []json.RawMessage, body []byte) json.RawMessage {
	if len(list) > 0 {
		return list[0]
	}
	return json.RawMessage(body)
}
