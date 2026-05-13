#!/bin/bash
#
# Stage-Gated Workflow Kit - Project Installer
# Installs the kit to a brand new project
#
# Usage:
#   ./install-workflow.sh <target-project-path> <project-name>
#
# Example:
#   ./install-workflow.sh /path/to/my-new-project "My Project"

set -e

KIT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_PROJECT_PATH="$1"
PROJECT_NAME="$2"

log() {
  echo "[install-workflow] $1"
}

error() {
  echo "[install-workflow] ERROR: $1" >&2
  exit 1
}

validate_args() {
  if [ -z "$TARGET_PROJECT_PATH" ] || [ -z "$PROJECT_NAME" ]; then
    echo ""
    echo "Usage: $0 <target-project-path> <project-name>"
    echo ""
    echo "Example:"
    echo "  $0 /path/to/my-new-project \"My Project\""
    echo ""
    exit 1
  fi

  if [ ! -d "$TARGET_PROJECT_PATH" ]; then
    error "Target project path does not exist: $TARGET_PROJECT_PATH"
  fi

  local state_example="${KIT_DIR}/.workflow/state.example.json"
  if [ ! -f "$state_example" ]; then
    error "Kit is missing expected file: ${state_example}"
  fi

  log "Kit directory:  ${KIT_DIR}"
  log "Target project: ${TARGET_PROJECT_PATH}"
  log "Project name:   ${PROJECT_NAME}"
}

step1_rsync() {
  log "Step 1: Copying kit files to target project..."
  log "  Using rsync to preserve dot directories (.workflow, etc.)"

  local cmd="rsync -av \"${KIT_DIR}/\" \"${TARGET_PROJECT_PATH}/\""
  log "  Running: ${cmd}"

  if ! command -v rsync &> /dev/null; then
    error "rsync is not installed. Please install rsync and try again."
  fi

  rsync -av "${KIT_DIR}/" "${TARGET_PROJECT_PATH}/"
  log "  rsync completed successfully."
}

step2_setup_workflow_state() {
  log "Step 2: Setting up workflow state file..."

  local workflow_dir="${TARGET_PROJECT_PATH}/.workflow"
  local state_example="${workflow_dir}/state.example.json"
  local state_file="${workflow_dir}/state.json"

  if [ ! -d "$workflow_dir" ]; then
    log "  Creating ${workflow_dir}"
    mkdir -p "$workflow_dir"
  fi

  if [ ! -f "$state_example" ]; then
    error "state.example.json not found at ${state_example}"
  fi

  if [ ! -f "$state_file" ]; then
    log "  Copying state.example.json -> state.json"
    cp "$state_example" "$state_file"
    log "  State file created."
  else
    log "  state.json already exists, skipping."
  fi
}

step3_validate_installation() {
  log "Step 3: Validating copied workflow files..."

  local required_files=(
    "${TARGET_PROJECT_PATH}/scripts/package.json"
    "${TARGET_PROJECT_PATH}/scripts/verify-prototype.js"
    "${TARGET_PROJECT_PATH}/scripts/test-verify-prototype.js"
    "${TARGET_PROJECT_PATH}/scripts/test-workflow-config.js"
    "${TARGET_PROJECT_PATH}/scripts/test-sync-backend-api-paths.js"
    "${TARGET_PROJECT_PATH}/scripts/workflow/gate.js"
    "${TARGET_PROJECT_PATH}/scripts/workflow/config.js"
    "${TARGET_PROJECT_PATH}/scripts/workflow/sync-backend-api-paths.js"
    "${TARGET_PROJECT_PATH}/scripts/workflow/state.js"
    "${TARGET_PROJECT_PATH}/scripts/workflow/doctor.js"
    "${TARGET_PROJECT_PATH}/scripts/hooks/workflow-stage-guard.js"
    "${TARGET_PROJECT_PATH}/scripts/hooks/workflow-stage-sync.js"
    "${TARGET_PROJECT_PATH}/scripts/hooks/workflow-session-start.js"
    "${TARGET_PROJECT_PATH}/scripts/hooks/workflow-session-end.js"
    "${TARGET_PROJECT_PATH}/AGENTS.md"
    "${TARGET_PROJECT_PATH}/.workflow/state.example.json"
    "${TARGET_PROJECT_PATH}/.workflow/test-contract.example.json"
    "${TARGET_PROJECT_PATH}/.workflow/backend-contract.example.json"
    "${TARGET_PROJECT_PATH}/.workflow/e2e-report.example.json"
    "${TARGET_PROJECT_PATH}/.workflow/api-report.example.json"
  )

  local missing=()
  local file
  for file in "${required_files[@]}"; do
    if [ ! -f "$file" ]; then
      missing+=("$file")
    fi
  done

  if [ ${#missing[@]} -gt 0 ]; then
    printf '[install-workflow] ERROR: missing required installed files:\n' >&2
    printf '  - %s\n' "${missing[@]}" >&2
    error "Installation is incomplete. Please check the target project and rerun the installer."
  fi

  log "  Workflow files look complete."
}

step4_init_gate() {
  log "Step 4: Initializing workflow with project name..."
  log "  Running: node scripts/workflow/gate.js init \"${PROJECT_NAME}\""

  if ! command -v node &> /dev/null; then
    error "Node.js is not installed. Please install Node.js and try again."
  fi

  cd "$TARGET_PROJECT_PATH"
  node scripts/workflow/gate.js init "${PROJECT_NAME}"
  log "  Gate initialized successfully."
}

step5_status() {
  log "Step 5: Checking workflow status..."
  log "  Running: node scripts/workflow/gate.js status"

  cd "$TARGET_PROJECT_PATH"
  node scripts/workflow/gate.js status || true
}

show_next_steps() {
  echo ""
  echo "========================================"
  echo "Installation complete!"
  echo "========================================"
  echo ""
  echo "Next steps:"
  echo "  cd ${TARGET_PROJECT_PATH}"
  echo "  node scripts/workflow/doctor.js        # Verify Codex workflow setup"
  echo "  node scripts/workflow/gate.js status    # View current workflow state"
  echo "  npm run verify:prototype                # Verify prototype stage output when ready"
  echo ""
  echo "For usage instructions, see:"
  echo "  - PROJECT-INSTALL.md (this kit)"
  echo "  - AGENTS.md (installed in target project for Codex)"
  echo ""
}

main() {
  echo "========================================"
  echo "Stage-Gated Workflow Kit - Project Installer"
  echo "Install to a brand new project"
  echo "========================================"
  echo ""

  validate_args
  step1_rsync
  step2_setup_workflow_state
  step3_validate_installation
  step4_init_gate
  step5_status
  show_next_steps
}

main
