package internal

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/service/ec2"
	"github.com/aws/aws-sdk-go-v2/service/sts"
)

// TestConnection performs the cheapest authenticated call per PRD §7.3's
// AWS checklist — sts:GetCallerIdentity, then ec2:DescribeRegions — without
// touching any per-region instance data.
func TestConnection(ctx context.Context, raw json.RawMessage) (string, error) {
	var cc connectionConfig
	if err := json.Unmarshal(raw, &cc); err != nil || cc.AccessKeyID == "" || cc.SecretAccessKey == "" {
		return "", fmt.Errorf("%w: missing/invalid accessKeyId/secretAccessKey in connection config", ErrAuthFailed)
	}

	base, err := buildAWSConfig(ctx, cc)
	if err != nil {
		return "", err
	}

	identity, err := sts.NewFromConfig(base).GetCallerIdentity(ctx, &sts.GetCallerIdentityInput{})
	if err != nil {
		return "", classifyAWSErr(err)
	}

	regionsOut, err := ec2.NewFromConfig(base).DescribeRegions(ctx, &ec2.DescribeRegionsInput{})
	if err != nil {
		return "", classifyAWSErr(err)
	}

	arn := ""
	if identity.Arn != nil {
		arn = *identity.Arn
	}
	return fmt.Sprintf("Access key valid (arn=%s); EC2 read access confirmed across %d enabled region(s)", arn, len(regionsOut.Regions)), nil
}
