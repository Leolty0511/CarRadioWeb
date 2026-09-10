#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ROOT="${1:-/opt/CarRadioWeb}"
RELEASE_URL="${CARRADIOWEB_RELEASE_URL:-https://github.com/Leolty0511/CarRadioWeb/releases/download/latest/caradioweb-deploy.tar.gz}"

if [[ "$PROJECT_ROOT" != /* || ! -f "$PROJECT_ROOT/package.json" || ! -d "$PROJECT_ROOT/backend" ]]; then
  echo "Invalid CarRadioWeb project directory: $PROJECT_ROOT" >&2
  exit 1
fi

for command_name in curl tar node pm2; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is unavailable: $command_name" >&2
    exit 1
  fi
done

umask 077
bootstrap_dir="$(mktemp -d)"
trap 'rm -rf -- "$bootstrap_dir"' EXIT

if command -v flock >/dev/null 2>&1; then
  exec 9>"$PROJECT_ROOT/.manual-update.lock"
  if ! flock -n 9; then
    echo "Another CarRadioWeb update is already running." >&2
    exit 1
  fi
fi

archive="$bootstrap_dir/caradioweb-deploy.tar.gz"
package_dir="$bootstrap_dir/package"
mkdir -p "$package_dir"

echo "Downloading the latest CarRadioWeb deployment package..."
curl --fail --location --silent --show-error --retry 3 --connect-timeout 20 --max-time 900 \
  "$RELEASE_URL" --output "$archive"
tar -tzf "$archive" >/dev/null
tar -xzf "$archive" -C "$package_dir"

runner="$package_dir/backend/dist/scripts/projectUpdateRunner.js"
release_file="$package_dir/release.json"
if [[ ! -f "$runner" || ! -f "$release_file" ]]; then
  echo "The deployment package is incomplete." >&2
  exit 1
fi

previous_commit="artifact"
if [[ -d "$PROJECT_ROOT/.git" ]]; then
  previous_commit="$(git -C "$PROJECT_ROOT" rev-parse HEAD 2>/dev/null || echo artifact)"
elif [[ -f "$PROJECT_ROOT/release.json" ]]; then
  previous_commit="$(node -e 'const fs=require("fs"); try { console.log(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).commit || "artifact") } catch { console.log("artifact") }' "$PROJECT_ROOT/release.json")"
fi

target_commit="$(node -e 'const fs=require("fs"); const value=JSON.parse(fs.readFileSync(process.argv[1], "utf8")).commit; if (!/^[0-9a-f]{40}$/i.test(value || "")) process.exit(1); console.log(value)' "$release_file")"
job_id="manual-$(date -u +%Y%m%dT%H%M%SZ)-$$"
status_file="$PROJECT_ROOT/.update-state/$job_id.json"
mkdir -p "$(dirname "$status_file")"

payload="$(UPDATE_JOB_ID="$job_id" \
  UPDATE_PROJECT_ROOT="$PROJECT_ROOT" \
  UPDATE_PREVIOUS_COMMIT="$previous_commit" \
  UPDATE_TARGET_COMMIT="$target_commit" \
  UPDATE_STATUS_FILE="$status_file" \
  UPDATE_ARTIFACT_FILE="$archive" \
  node -e '
const payload = {
  jobId: process.env.UPDATE_JOB_ID,
  repoRoot: process.env.UPDATE_PROJECT_ROOT,
  branch: "main",
  previousCommit: process.env.UPDATE_PREVIOUS_COMMIT,
  targetCommit: process.env.UPDATE_TARGET_COMMIT,
  statusFile: process.env.UPDATE_STATUS_FILE,
  pm2Target: process.env.PM2_PROCESS_NAME || "official-backend",
  frontendPm2Target: process.env.FRONTEND_PM2_PROCESS_NAME || undefined,
  healthUrl: process.env.UPDATE_HEALTH_URL || "http://127.0.0.1:3000/health/ready",
  artifactFile: process.env.UPDATE_ARTIFACT_FILE,
};
process.stdout.write(Buffer.from(JSON.stringify(payload)).toString("base64url"));
')"

echo "Backing up production data and installing commit $target_commit..."
if ! NODE_ENV=production UPDATE_BACKUP_ENABLED=true UPDATE_BACKUP_REQUIRED=true \
  node "$runner" "$payload"; then
  echo "CarRadioWeb update failed. Status: $status_file" >&2
  if [[ -f "$status_file" ]]; then
    cat "$status_file" >&2
  fi
  exit 1
fi

echo "CarRadioWeb update completed. Status: $status_file"
