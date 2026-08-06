package internal

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"cirrus/collectorkit"

	openapi "github.com/alibabacloud-go/darabonba-openapi/v2/client"
	ecs20140526 "github.com/alibabacloud-go/ecs-20140526/v7/client"
	"github.com/alibabacloud-go/tea/tea"
	"github.com/aliyun/credentials-go/credentials"
)

type connectionConfig struct {
	RoleArn  string `json:"roleArn"`
	RegionID string `json:"regionId"`
}

// buildAssumedCredential assumes the connection's RAM role via Cirrus's own
// hub credential (AccessKey/Secret from env) — shared by the full inventory
// fetch and the lightweight connection-test path.
func buildAssumedCredential(cc connectionConfig) (credentials.Credential, error) {
	credCfg := new(credentials.Config).
		SetType("ram_role_arn").
		SetAccessKeyId(os.Getenv("ALIBABA_CLOUD_ACCESS_KEY_ID")).
		SetAccessKeySecret(os.Getenv("ALIBABA_CLOUD_ACCESS_KEY_SECRET")).
		SetRoleArn(cc.RoleArn).
		SetRoleSessionName("cirrus-collector")
	cred, err := credentials.NewCredential(credCfg)
	if err != nil {
		return nil, fmt.Errorf("%w: building credential: %v", ErrAuthFailed, err)
	}
	return cred, nil
}

// FetchInstances resolves a connection's roleArn/regionId, assumes the RAM
// role via Cirrus's own hub credential (AccessKey/Secret from env), and
// returns a real ECS inventory for that region (or a classified error —
// ErrAuthFailed / ErrUpstream, see errors.go).
func FetchInstances(ctx context.Context, raw json.RawMessage) ([]collectorkit.Instance, error) {
	var cc connectionConfig
	if err := json.Unmarshal(raw, &cc); err != nil || cc.RoleArn == "" || cc.RegionID == "" {
		return nil, fmt.Errorf("%w: missing/invalid roleArn or regionId in connection config", ErrAuthFailed)
	}

	cred, err := buildAssumedCredential(cc)
	if err != nil {
		return nil, err
	}

	client, err := ecs20140526.NewClient(&openapi.Config{
		Credential: cred,
		RegionId:   tea.String(cc.RegionID),
		Endpoint:   tea.String(fmt.Sprintf("ecs.%s.aliyuncs.com", cc.RegionID)),
	})
	if err != nil {
		return nil, fmt.Errorf("%w: building ECS client: %v", ErrUpstream, err)
	}

	var all []*ecs20140526.DescribeInstancesResponseBodyInstancesInstance
	for page := int32(1); ; page++ {
		resp, err := client.DescribeInstances(&ecs20140526.DescribeInstancesRequest{
			RegionId:   tea.String(cc.RegionID),
			PageSize:   tea.Int32(100),
			PageNumber: tea.Int32(page),
		})
		if err != nil {
			return nil, classifyAlibabaErr(err)
		}
		if resp.Body == nil || resp.Body.Instances == nil {
			break
		}
		insts := resp.Body.Instances.Instance
		all = append(all, insts...)
		if len(insts) < 100 {
			break
		}
	}

	result := make([]collectorkit.Instance, 0, len(all))
	for _, inst := range all {
		result = append(result, mapInstance(inst, cc.RegionID))
	}
	return result, nil
}

// classifyAlibabaErr distinguishes access/trust-policy failures (AUTH_FAILED)
// from everything else (UPSTREAM_ERROR). Alibaba's tea-generated clients
// surface API errors as *tea.SDKError with a Code string.
func classifyAlibabaErr(err error) error {
	if sdkErr, ok := err.(*tea.SDKError); ok && sdkErr.Code != nil {
		code := *sdkErr.Code
		if strings.Contains(code, "Forbidden") || strings.Contains(code, "Unauthorized") ||
			strings.Contains(code, "InvalidAccessKeyId") || code == "AccessDenied" {
			return fmt.Errorf("%w: %v", ErrAuthFailed, err)
		}
	}
	return fmt.Errorf("%w: %v", ErrUpstream, err)
}
