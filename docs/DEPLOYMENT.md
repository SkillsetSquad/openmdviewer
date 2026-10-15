# Static deployment

OpenMDViewer exports a static Next.js application. The production runtime only serves files. All document operations run in the browser. Do not deploy `next start`; deploy `out/`.

## GitHub Pages

The public project is `SkillsetSquad/openmdviewer`. In Settings → Pages, select **GitHub Actions** as the source. The included deployment workflow checks the app, builds with `NEXT_PUBLIC_BASE_PATH=/openmdviewer`, and uploads `out/` to Pages. The URL is https://skillsetsquad.github.io/openmdviewer/.

For a different repository path, update that build environment variable. For a custom domain serving from `/`, omit it. Never put private credentials in `NEXT_PUBLIC_*` variables.

## Docker / Compose

```sh
docker compose up --build -d
```

Visit http://localhost:8080. The image builds with Node.js 24 and runs with Nginx; the runtime image has no Node application process. The container has no document volumes because user documents live in browser IndexedDB. Restarting the container does not erase a workspace, but changing the origin or subpath changes the browser storage context.

The image includes a healthcheck and security headers. Docker runtime execution must be verified on the target host; availability of a Dockerfile is not proof of a production deployment.

## Nginx

```sh
npm ci
npm run build
# Copy out/ contents to /usr/share/nginx/html (or your configured web root).
```

Use [deploy/nginx.conf](../deploy/nginx.conf). It serves directory indexes, caches hashed Next assets, and prevents stale service worker scripts. Add a TLS reverse proxy or your existing HTTPS configuration. Do not interrupt an existing server while changing its configuration; validate with `nginx -t` before reloading.

## Caddy

Use [deploy/Caddyfile](../deploy/Caddyfile), set your hostname and web root, and copy `out/` there. With valid public DNS, Caddy manages HTTPS automatically. For a private intranet, supply certificates trusted by the devices using the site.

## Apache

Copy `out/` into your document root. `DirectoryIndex index.html` must be enabled. The optional [deploy/.htaccess](../deploy/.htaccess) adds security headers when `mod_headers` and per-directory configuration are allowed. Serve over HTTPS for offline/PWA features.

## NAS / Raspberry Pi / intranet

Build on a development machine or CI and copy the generated `out/` files to the device's static web server. No Node.js installation is required on the serving device. Configure HTTPS with a certificate trusted by clients; browsers require a secure context for service workers. `localhost` is a development exception.

## Subpath hosting

```sh
NEXT_PUBLIC_BASE_PATH=/reader npm run build
```

To exercise the same browser suite under the project subpath, run `NEXT_PUBLIC_BASE_PATH=/openmdviewer npm run build` followed by `npm run test:subpath`. CI performs both root and subpath browser checks.

Mount the **contents** of `out/` at `/reader/`, preserving `_next/` and all other asset paths. The generated manifest, icons, service worker scope, and cached asset URLs use this prefix. Use a leading slash and no trailing slash for the environment variable. For a subpath Docker image:

```sh
docker build --build-arg NEXT_PUBLIC_BASE_PATH=/reader -t openmdviewer .
docker run --rm -p 8080:80 openmdviewer
```

Open http://localhost:8080/reader/. A reverse proxy must forward the prefix unchanged. Browser storage is scoped to origin, so two instances on one origin currently share the IndexedDB database; use separate origins for isolated workspaces.

## Offline operation and updates

On the initial visit the service worker downloads the app assets, including lazy editor, diagram, math, and code modules (roughly 17 MB uncompressed for the initial release). After activation, the app starts offline. Documents remain in IndexedDB; remote media is only available if the network permits it. Core operation does not depend on a remote API.

Each build gets a content-based cache version. Deploy the entire artifact atomically so hashed modules and HTML agree. New workers wait while an existing instance is open; close all app tabs, then reopen to activate the update. Previous application caches for that deployment prefix are removed during activation. Document storage is never cleared by app updates. Keep the same origin to retain local documents, and export a ZIP backup before major upgrades or clearing site data.

A CSP is embedded into exported HTML by `scripts/prepare-static.mjs`. The static Next.js hydration payload needs inline scripts; this is documented rather than described as a strict nonce policy. Active imported Markdown is separately sanitized. Do not add untrusted scripts to the app origin.

## Privacy and maintenance

No private tokens are needed to deploy or run the application. CI uses GitHub's scoped temporary deployment token. Review dependency audits when upgrading. Avoid automatic forced major downgrades to silence advisories. HTTPS protects transport; browser-local storage is not application-level encryption.
