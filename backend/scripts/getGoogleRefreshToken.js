/**
 * One-time local helper to obtain a Google OAuth2 refresh token for Drive access.
 *
 * Run from the backend folder:
 *   node scripts/getGoogleRefreshToken.js
 *
 * Required env vars:
 *   GOOGLE_OAUTH_CLIENT_ID
 *   GOOGLE_OAUTH_CLIENT_SECRET
 *
 * Optional env vars:
 *   GOOGLE_OAUTH_REDIRECT_URI
 *     - Defaults to http://127.0.0.1:3000/oauth2callback
 *
 * What it does:
 *   1. Prints a Google consent URL
 *   2. Waits for the OAuth callback on localhost
 *   3. Exchanges the code for tokens
 *   4. Prints the refresh token clearly so you can store it in your env
 *
 * Notes:
 *   - This uses a desktop OAuth2 client, not a service account.
 *   - Google Drive scope is requested so the same credentials can upload/read/delete.
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env") });

const http = require("http");
const { exec } = require("child_process");
const { URL } = require("url");
const { google } = require("googleapis");

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const DEFAULT_REDIRECT_URI = "http://127.0.0.1:3000/oauth2callback";

const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || DEFAULT_REDIRECT_URI;

if (!clientId || !clientSecret) {
  console.error("Missing required env vars.");
  console.error("Please set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET first.");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: [DRIVE_SCOPE],
  include_granted_scopes: true,
});

const callbackUrl = new URL(redirectUri);
const callbackPath = callbackUrl.pathname || "/oauth2callback";
const callbackPort = Number(callbackUrl.port || 3000);
const callbackHost = callbackUrl.hostname || "127.0.0.1";

let resolveCode;
let rejectCode;

const codePromise = new Promise((resolve, reject) => {
  resolveCode = resolve;
  rejectCode = reject;
});

const server = http.createServer((req, res) => {
  try {
    console.log("");
    console.log(`[HTTP] ${req.method} ${req.url}`);

    const requestUrl = new URL(req.url, redirectUri);
    if (requestUrl.pathname !== callbackPath) {
      console.log(`[HTTP] Ignored non-callback request for ${requestUrl.pathname}`);
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }

    const queryParams = Object.fromEntries(requestUrl.searchParams.entries());
    console.log("OAuth callback received:");
    console.log(`Raw URL: ${req.url}`);
    console.log(`Parsed URL: ${requestUrl.toString()}`);
    console.log("Query params:", JSON.stringify(queryParams, null, 2));

    const error = requestUrl.searchParams.get("error");
    const code = requestUrl.searchParams.get("code");

    if (error) {
      const errorDescription = requestUrl.searchParams.get("error_description");
      const errorUri = requestUrl.searchParams.get("error_uri");
      console.error("");
      console.error("Google returned an OAuth error:");
      console.error(`error: ${error}`);
      if (errorDescription) console.error(`error_description: ${errorDescription}`);
      if (errorUri) console.error(`error_uri: ${errorUri}`);
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end(`OAuth error: ${error}`);
      rejectCode(new Error(`OAuth error: ${error}`));
      return;
    }

    if (!code) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Missing authorization code.");
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`
      <html>
        <body style="font-family: sans-serif; padding: 24px;">
          <h2>Authorization complete</h2>
          <p>You can close this tab and return to the terminal.</p>
        </body>
      </html>
    `);

    resolveCode(code);
  } catch (error) {
    rejectCode(error);
  }
});

server.listen(callbackPort, callbackHost, () => {
  console.log("Google OAuth refresh token helper");
  console.log("");
  console.log("1. Open this URL in your browser:");
  console.log(authUrl);
  console.log("");
  console.log(`2. Sign in with your homework@lorettocentralschool.edu.in account.`);
  console.log("3. Approve the Drive access request.");
  console.log(`4. Google will redirect to ${redirectUri} and the script will capture the code.`);
  console.log("");
  console.log("Waiting for the callback...");

  exec(`open "${authUrl}"`, (error) => {
    if (error) {
      console.log("");
      console.log("Auto-open failed. Please copy the URL above into your browser.");
    } else {
      console.log("Opened the authorization URL in your default browser.");
    }
  });
});

const shutdown = async (exitCode = 0) => {
  await new Promise(resolve => server.close(resolve));
  process.exit(exitCode);
};

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));

(async () => {
  try {
    const code = await codePromise;
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    console.log("");
    console.log("Refresh token obtained:");
    if (tokens.refresh_token) {
      console.log(tokens.refresh_token);
    } else {
      console.log("(No refresh token returned)");
      console.log("If this happens, revoke the app's access in Google Account settings and run the script again.");
    }
    console.log("");
    console.log("Recommended env vars for later:");
    console.log(`GOOGLE_OAUTH_CLIENT_ID=${clientId}`);
    console.log("GOOGLE_OAUTH_CLIENT_SECRET=***");
    console.log("GOOGLE_OAUTH_REFRESH_TOKEN=***");

    await shutdown(0);
  } catch (error) {
    console.error("");
    console.error("Failed to obtain refresh token:");
    console.error(error.message || error);
    await shutdown(1);
  }
})();
