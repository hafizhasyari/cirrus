package internal

import (
	"context"
	"encoding/json"
	"fmt"

	openapi "github.com/alibabacloud-go/darabonba-openapi/v2/client"
	sts20150401 "github.com/alibabacloud-go/sts-20150401/v2/client"
	"github.com/alibabacloud-go/tea/tea"
)

// TestConnection performs the cheapest authenticated call per PRD §7.3's
// Alibaba Cloud checklist — sts:GetCallerIdentity only, confirming the
// access key/secret pair is valid, with no ECS call at all.
func TestConnection(ctx context.Context, raw json.RawMessage) (string, error) {
	var cc connectionConfig
	if err := json.Unmarshal(raw, &cc); err != nil || cc.AccessKeyID == "" || cc.SecretAccessKey == "" {
		return "", fmt.Errorf("%w: missing/invalid accessKeyId or secretAccessKey in connection config", ErrAuthFailed)
	}

	cred, err := buildAlibabaCredential(cc)
	if err != nil {
		return "", err
	}

	client, err := sts20150401.NewClient(&openapi.Config{
		Credential: cred,
		Endpoint:   tea.String("sts.aliyuncs.com"),
	})
	if err != nil {
		return "", fmt.Errorf("%w: building STS client: %v", ErrUpstream, err)
	}

	resp, err := client.GetCallerIdentity()
	if err != nil {
		return "", classifyAlibabaErr(err)
	}

	arn := ""
	if resp.Body != nil && resp.Body.Arn != nil {
		arn = *resp.Body.Arn
	}
	return fmt.Sprintf("Access key valid, identity confirmed (arn=%s)", arn), nil
}
