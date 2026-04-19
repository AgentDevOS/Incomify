export function isWildcardHost(host) {
  return host === '0.0.0.0' || host === '::';
}

export function isLoopbackHost(host) {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

export function normalizeLoopbackHost(host) {
  if (!host) {
    return host;
  }
  return isLoopbackHost(host) ? 'localhost' : host;
}

// Use localhost for connectable loopback and wildcard addresses in browser-facing URLs.
export function getConnectableHost(host) {
  if (!host) {
    return 'localhost';
  }
  return isWildcardHost(host) || isLoopbackHost(host) ? 'localhost' : host;
}

// Use an explicit IPv4 loopback for local proxy targets to avoid resolving
// "localhost" to an unrelated service bound only on ::1.
export function getProxyTargetHost(host) {
  if (!host) {
    return '127.0.0.1';
  }
  return isWildcardHost(host) || isLoopbackHost(host) ? '127.0.0.1' : host;
}
