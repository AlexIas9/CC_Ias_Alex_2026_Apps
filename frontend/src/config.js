const runtimeEnv = globalThis.window?.__APP_CONFIG__ || {};
const buildEnv = process.env;
const APP_ORIGIN = "https://app-tucn-cc-dev-agi-ias.azurewebsites.net";
const API_ORIGIN = "https://func-tucn-cc-dev-agi-ias.azurewebsites.net";

function configValue(key, fallback = "") {
  return runtimeEnv[key] || buildEnv[key] || fallback;
}

// OIDC config for react-oidc-context
export const OIDC_CONFIG = {
  authority: configValue("REACT_APP_COGNITO_AUTHORITY"), // https://cognito-idp.<region>.amazonaws.com/<userPoolId>
  client_id: configValue("REACT_APP_COGNITO_CLIENT_ID"), // your app client id
  redirect_uri: configValue("REACT_APP_OIDC_REDIRECT_URI", APP_ORIGIN), // must match callback URL in Cognito
  response_type: "code",
  scope: configValue("REACT_APP_OIDC_SCOPE", "openid email profile"),
};

// Your Cognito domain (for logout)
export const COGNITO_DOMAIN = configValue("REACT_APP_COGNITO_DOMAIN");
// e.g. https://my-domain.auth.eu-central-1.amazoncognito.com
// You can find it in the Cognito User Pool console under "Managed Login" > "Domain".

// Logout redirect (must be in allowed logout URLs)
export const LOGOUT_URI = configValue("REACT_APP_LOGOUT_URI", APP_ORIGIN);

// Azure Functions backend
export const API_BASE = configValue("REACT_APP_API_BASE", API_ORIGIN);
