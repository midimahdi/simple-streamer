#!/usr/bin/env bash
set -euo pipefail

# Deploy Mosque Stream Orchestrator as GCP Cloud Function (2nd Gen)
# Usage: ./deploy-function.sh [GCP_PROJECT_ID] [REGION]

PROJECT_ID="${1:-$(gcloud config get-value project 2>/dev/null || echo "")}"
REGION="${2:-europe-west1}"
FUNCTION_NAME="mosque-stream-orchestrator"

if [ -z "$PROJECT_ID" ]; then
  echo "Error: GCP_PROJECT_ID not provided and gcloud default project not set."
  echo "Usage: ./deploy-function.sh <PROJECT_ID> [REGION]"
  exit 1
fi

echo "=================================================="
echo "Deploying Cloud Function (2nd Gen): $FUNCTION_NAME"
echo "Project: $PROJECT_ID | Region: $REGION"
echo "=================================================="

gcloud functions deploy "$FUNCTION_NAME" \
  --gen2 \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --runtime="nodejs20" \
  --source="." \
  --entry-point="handleRequest" \
  --trigger-http \
  --allow-unauthenticated \
  --memory=256Mi \
  --timeout=30s \
  --min-instances=0 \
  --max-instances=2

echo ""
echo "Deployment Complete! Function URL:"
gcloud functions describe "$FUNCTION_NAME" --gen2 --project="$PROJECT_ID" --region="$REGION" --format="value(serviceConfig.uri)"
