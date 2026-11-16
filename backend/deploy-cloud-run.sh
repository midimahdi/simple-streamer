#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

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

ENV_ARG="--update-env-vars=NODE_ENV=production"
if [ -f ".env" ]; then
  ENV_YAML="$(mktemp /tmp/cloudrun-env-XXXXXX)"
  trap 'rm -f "$ENV_YAML"' EXIT
  node -e '
    const fs = require("fs");
    const lines = fs.readFileSync(".env", "utf8").split("\n");
    const map = new Map();
    map.set("NODE_ENV", "production");
    for (const line of lines) {
      const t = line.trim();
      if (t && !t.startsWith("#") && t.includes("=")) {
        const idx = t.indexOf("=");
        const k = t.slice(0, idx).trim();
        let v = t.slice(idx + 1).trim();
        if ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("\x27") && v.endsWith("\x27"))) {
          v = v.slice(1, -1);
        }
        map.set(k, v);
      }
    }
    const yaml = [];
    for (const [k, v] of map.entries()) {
      yaml.push(`${k}: "${v.replace(/"/g, "\\\"")}"`);
    }
    fs.writeFileSync(process.argv[1], yaml.join("\n"));
  ' "$ENV_YAML"
  ENV_ARG="--env-vars-file=$ENV_YAML"
  echo "Loaded environment variables from local .env"
fi

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
  --quiet \
  $ENV_ARG

echo ""
echo "Deployment Complete! Service URL:"
gcloud run services describe "$SERVICE_NAME" --project="$PROJECT_ID" --region="$REGION" --account="$ACCOUNT" --format="value(status.url)"
