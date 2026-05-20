export const DEV_INCOMING_REQUEST_IGNORE: RegExp[] = [
  /^\/poster\//,
  /^\/backdrop\//,
  /^\/logo\//,
  /^\/meta\//,
  /^\/catalog\//,
  /^\/manifest(\.full)?\.json$/,
  /^\/api\/config(?:\/[^/]+)?$/,
  /^\/[A-Za-z0-9_-]{12,48}\/(poster|backdrop|logo|meta|catalog)\//,
  /^\/[A-Za-z0-9_-]{12,48}\/manifest(\.full)?\.json$/,
];
