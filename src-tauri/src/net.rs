//! Outbound HTTP egress for the AI layer (Phase 3.1).
//!
//! Every request the AI layer makes leaves through this command rather than the
//! webview. That is deliberate:
//!
//!   * the Keywire vault sends no CORS headers, and a request carrying an
//!     `Authorization` header is not a CORS-simple request — a webview fetch
//!     would be blocked at preflight;
//!   * Tauri's CSP `connect-src` is static, while the LLM base URL is
//!     user-configurable, so provider origins cannot be pre-listed.
//!
//! The command is *not* an open proxy. `is_allowed_url` permits HTTPS anywhere
//! (the user chooses their provider) and plain HTTP only on loopback (Keywire,
//! Ollama, a local llama.cpp server). Anything else is rejected before a socket
//! is opened.

use serde::Serialize;
use std::collections::HashMap;
use std::time::Duration;

/// Refuse to buffer more than this from a single response.
const MAX_BODY_BYTES: usize = 4 * 1024 * 1024;
/// Hard ceiling on a single request.
const REQUEST_TIMEOUT_SECS: u64 = 60;

#[derive(Debug, Serialize)]
pub struct HttpResponsePayload {
    pub status: u16,
    pub body: String,
}

/// Extract the host from an `http://` URL's authority, handling `[::1]:port`.
fn loopback_host(rest: &str) -> bool {
    let end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let authority = &rest[..end];
    let host = if authority.starts_with('[') {
        format!("{}]", authority.split(']').next().unwrap_or(""))
    } else {
        authority.split(':').next().unwrap_or("").to_string()
    };
    matches!(host.as_str(), "127.0.0.1" | "localhost" | "[::1]")
}

/// True when the URL is safe to fetch from this process.
///
/// HTTPS to any host, or plain HTTP to loopback only. Everything else — other
/// schemes, and cleartext HTTP to a remote host — is refused.
pub fn is_allowed_url(url: &str) -> bool {
    let trimmed = url.trim();
    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("https://") {
        // Reject the bare scheme with no host.
        return lower.len() > "https://".len();
    }
    if let Some(rest) = lower.strip_prefix("http://") {
        return !rest.is_empty() && loopback_host(rest);
    }
    false
}

/// Perform one HTTP request on behalf of the renderer.
#[tauri::command]
pub async fn http_request(
    url: String,
    method: Option<String>,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
) -> Result<HttpResponsePayload, String> {
    if !is_allowed_url(&url) {
        return Err("blocked: only https, or http on loopback, is permitted".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|e| format!("http client error: {e}"))?;

    let verb = method.unwrap_or_else(|| "GET".to_string()).to_uppercase();
    let parsed = reqwest::Method::from_bytes(verb.as_bytes())
        .map_err(|_| format!("invalid HTTP method: {verb}"))?;

    let mut request = client.request(parsed, &url);
    if let Some(map) = headers {
        for (key, value) in map {
            request = request.header(key, value);
        }
    }
    if let Some(payload) = body {
        request = request.body(payload);
    }

    let response = request.send().await.map_err(|e| format!("request failed: {e}"))?;
    let status = response.status().as_u16();

    let bytes = response.bytes().await.map_err(|e| format!("read failed: {e}"))?;
    if bytes.len() > MAX_BODY_BYTES {
        return Err(format!("response too large: {} bytes", bytes.len()));
    }

    Ok(HttpResponsePayload {
        status,
        body: String::from_utf8_lossy(&bytes).into_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_https_anywhere() {
        assert!(is_allowed_url("https://api.openai.com/v1/chat/completions"));
        assert!(is_allowed_url("https://openrouter.ai/api/v1"));
        assert!(is_allowed_url("HTTPS://API.EXAMPLE.COM/x"));
    }

    #[test]
    fn allows_http_on_loopback_only() {
        assert!(is_allowed_url("http://127.0.0.1:3000/api/v1/x"));
        assert!(is_allowed_url("http://localhost:11434/v1"));
        assert!(is_allowed_url("http://[::1]:3000/api"));
    }

    #[test]
    fn refuses_cleartext_to_remote_hosts_and_other_schemes() {
        assert!(!is_allowed_url("http://evil.example.com/x"));
        assert!(!is_allowed_url("http://127.0.0.1.evil.com/x"));
        assert!(!is_allowed_url("ftp://127.0.0.1/x"));
        assert!(!is_allowed_url("file:///etc/passwd"));
        assert!(!is_allowed_url("ws://localhost:3000"));
        assert!(!is_allowed_url("javascript:alert(1)"));
        assert!(!is_allowed_url("https://"));
        assert!(!is_allowed_url(""));
    }
}
