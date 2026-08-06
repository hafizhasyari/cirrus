package internal

import (
	"context"
	"os"
	"sync"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
)

var (
	hubOnce   sync.Once
	hubConfig aws.Config
	hubErr    error
)

// hubAWSConfig loads Cirrus's own "hub" credential once per process, via the
// AWS SDK's default credential chain (AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY
// env vars today, or an attached IAM role if ever deployed inside AWS —
// Vault later just populates the same env vars at container boot, no code
// change needed then).
func hubAWSConfig(ctx context.Context) (aws.Config, error) {
	hubOnce.Do(func() {
		region := os.Getenv("AWS_REGION")
		if region == "" {
			region = "us-east-1"
		}
		hubConfig, hubErr = config.LoadDefaultConfig(ctx, config.WithRegion(region))
	})
	return hubConfig, hubErr
}
