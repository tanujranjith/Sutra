# Production security headers

Sutra keeps a meta CSP in Sutra.html as a defense for file:// and simple
static-server use. Production deployments must also send response headers:
some directives, especially frame-ancestors, are not enforceable from a meta
element.

## Supported targets

- **Vercel:** vercel.json applies CSP, frame-ancestors, MIME sniffing,
  referrer, permissions, opener/resource isolation, and HSTS headers. COEP is
  intentionally omitted because Sutra supports approved cross-origin embeds,
  OAuth popups, and provider APIs. The service worker is served with
  no-cache, no-store, must-revalidate so update checks reach the deployment.
- **GitHub Pages:** Pages publishes static files and does not provide a
  repository-level response-header configuration surface. The meta CSP still
  protects directives supported in meta, but frame-ancestors and the other
  HTTP-only protections cannot be guaranteed. Use Vercel or a header-capable
  reverse proxy/custom host when those protections are required.
- **Local/file use:** no HSTS or cross-origin isolation is attempted. This
  preserves offline startup, local provider endpoints, and OAuth callback
  compatibility.

Run npm run check:headers to validate the checked-in Vercel policy. To inspect
what a deployment actually sends:

    npm run check:headers -- https://your-deployment.example/Sutra.html

The deployed check fails closed when a required header or directive is absent.
