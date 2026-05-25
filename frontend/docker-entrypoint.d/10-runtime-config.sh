#!/bin/sh
set -eu

runtime_config="/usr/share/nginx/html/runtime-config.js"

js_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

cat > "$runtime_config" <<EOF
window.__APP_CONFIG__ = {
  REACT_APP_API_BASE: "$(js_escape "${REACT_APP_API_BASE:-}")",
  REACT_APP_COGNITO_AUTHORITY: "$(js_escape "${REACT_APP_COGNITO_AUTHORITY:-}")",
  REACT_APP_COGNITO_CLIENT_ID: "$(js_escape "${REACT_APP_COGNITO_CLIENT_ID:-}")",
  REACT_APP_COGNITO_DOMAIN: "$(js_escape "${REACT_APP_COGNITO_DOMAIN:-}")",
  REACT_APP_OIDC_REDIRECT_URI: "$(js_escape "${REACT_APP_OIDC_REDIRECT_URI:-}")",
  REACT_APP_OIDC_SCOPE: "$(js_escape "${REACT_APP_OIDC_SCOPE:-}")",
  REACT_APP_LOGOUT_URI: "$(js_escape "${REACT_APP_LOGOUT_URI:-}")"
};
EOF
