#!/usr/bin/env bash
# Exports the Account Focus demo accounts from your Salesforce org (needs the Salesforce CLI, `sf`).
# Usage: scripts/export-salesforce.sh <org-alias>
set -euo pipefail
ALIAS="${1:-account-focus}"
cd "$(dirname "$0")/.."
mkdir -p salesforce/exports
sf data query --target-org "$ALIAS" --json \
  --query "SELECT Id, AccountNumber, Name FROM Account WHERE Site = 'Account Focus demo' ORDER BY AccountNumber" \
  > salesforce/exports/accounts.json
COUNT=$(node -e "console.log(require('./salesforce/exports/accounts.json').result.totalSize)")
echo "Exported $COUNT accounts to salesforce/exports/accounts.json"
echo "Next: cd app && npm run sync-sql"
