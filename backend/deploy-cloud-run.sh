#!/usr/bin/env bash
set -euo pipefail

# Deploy Mosque Stream Orchestrator to Google Cloud Run (Free Tier Eligible)
# Usage: ./deploy-cloud-run.sh [GCP_PROJECT_ID] [REGION]

PROJECT_ID="${1:-$(gcloud config get-value project 2>/dev/null || echo "")}"
REGION="${2:-europe-west1}"
SERVICE_NAME="mosque-stream-orchestrator"
ACCOUNT="${GCP_ACCOUNT:-midimahdi6@gmail.com}"

if [ -z "$PROJECT_ID" ]; then
  echo "Error: GCP_PROJECT_ID not provided and gcloud default project not set."
  echo "Usage: ./deploy-cloud-run.sh <PROJECT_ID> [REGION]"
  exit 1
fi

echo "=================================================="
echo "Deploying to Cloud Run: $SERVICE_NAME"
echo "Project: $PROJECT_ID | Region: $REGION"
echo "=================================================="

gcloud run deploy "$SERVICE_NAME" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --account="$ACCOUNT" \
  --source="." \
  --platform="managed" \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=2 \
  --memory=256Mi \
  --cpu=1 \
  --timeout=30s \
  --update-env-vars="NODE_ENV=production"

echo ""
echo "Deployment Complete! Service URL:"
gcloud run services describe "$SERVICE_NAME" --project="$PROJECT_ID" --region="$REGION" --account="$ACCOUNT" --format="value(status.url)"
