#!/usr/bin/env bash
# Which apps to deploy to production for commit $SHA (the deploy workflow's
# plan job). An app is deployed when turbo says it is affected since its last
# successful production deploy: its own files, a package it depends on (UI,
# auth, its db package, …), or the lockfile and turbo's global inputs. An app
# with no successful deploy yet, or whose last deployed commit is not in this
# history, is deployed. $FORCE ("all" or a comma list) deploys those anyway.
#
# Writes `apps=<json array of {app, project}>` to $GITHUB_OUTPUT.
set -euo pipefail

: "${SHA:?}" "${GITHUB_REPOSITORY:?}" "${GITHUB_OUTPUT:?}"
FORCE="${FORCE:-}"

# app name (turbo package) → Vercel project id
project_of() {
  case "$1" in
    construction-management) echo prj_UqfGQZmmJ92d6RHb2oXun9aAy8Ky ;;
    whiteboard) echo prj_pAxsYV1zsjRWRv2isfdfICl1tOaK ;;
    marketing) echo prj_Bx4xVNnSziUI8laCM1p2mZQ8kI64 ;;
  esac
}

# The commit of an app's latest production deploy if it succeeded, else
# nothing (no deploy yet, or the newest one failed or never finished, which
# deploys the app again). GitHub's list order is not guaranteed, so both
# lists are read in full (every page) and sorted by creation time, then by
# id for records created in the same second.
last_deployed() {
  local environment="production/$1"
  local latest id sha state
  latest=$(gh api --paginate --slurp \
    "repos/$GITHUB_REPOSITORY/deployments?environment=$environment&per_page=100" |
    jq -r 'add // [] | sort_by([.created_at, .id]) | last | select(. != null) | "\(.id) \(.sha)"')
  [ -z "$latest" ] && return
  read -r id sha <<< "$latest"
  state=$(gh api --paginate --slurp \
    "repos/$GITHUB_REPOSITORY/deployments/$id/statuses?per_page=100" |
    jq -r 'add // [] | sort_by([.created_at, .id]) | last | .state // ""')
  if [ "$state" = "success" ]; then echo "$sha"; fi
}

forced() {
  [ "$FORCE" = "all" ] || [[ ",$FORCE," == *",$1,"* ]]
}

plan="[]"
for app in construction-management whiteboard marketing; do
  reason=""
  if forced "$app"; then
    reason="forced"
  else
    base=$(last_deployed "$app")
    if [ -z "$base" ]; then
      reason="no successful last deploy to compare with"
    elif ! git cat-file -e "$base^{commit}" 2>/dev/null; then
      reason="last deploy $base is not in this history"
    else
      # Outside any condition, so a turbo failure fails the plan instead of
      # reading as "unchanged" and skipping a deploy.
      affected=$(TURBO_SCM_BASE="$base" TURBO_SCM_HEAD="$SHA" \
        bunx turbo ls --affected --output json)
      if jq -e --arg app "$app" '.packages.items | any(.name == $app)' \
        <<< "$affected" > /dev/null; then
        reason="changed since ${base:0:8}"
      fi
    fi
  fi
  if [ -n "$reason" ]; then
    echo "deploy $app: $reason"
    plan=$(jq -c --arg app "$app" --arg project "$(project_of "$app")" \
      '. + [{app: $app, project: $project}]' <<< "$plan")
  else
    echo "skip $app: unchanged since its last deploy"
  fi
done

echo "apps=$plan" >> "$GITHUB_OUTPUT"
