<p align="center">
  <img src="public/logo.png" alt="POLIS" width="280" />
</p>

# POLIS

**Poster Overlay Layer Integration Service** for self-hosted poster overlays with ratings, genre lines, trend tags, and configurable artwork sources.

<p align="center">
  <a href="https://buymeacoffee.com/Crazy1"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-support-FFDD00?logo=buy-me-a-coffee&logoColor=black" alt="Buy Me a Coffee" /></a>
</p>

POLIS renders posters on demand from IMDb ids (WebP by default), then serves them through addon manifest and art URLs. Built for [Aurora Media Center](https://auroramediacenter.com). Also works with [AIOMetadata](https://github.com/cedya77/aiometadata) art patterns or any Stremio-compatible addon client.

<p><small><em>Inspired by the Better Posters addon.</em></small></p>

---

## Quick start

### Prerequisites

- [Bun](https://bun.sh) 1.3+
- TMDB API key 
- MDBList API key

### Run locally

```bash
cp env.example .env
# Edit .env: TMDB_ACCESS_TOKEN or TMDB_API_KEY, POLIS_PUBLIC_URL

bun install
bun run dev
```

Open `http://localhost:3050/configure` to configure overlays and copy your install URL.

### Production

```bash
bun run build
bun run start
```

Default port: **3050** (override with `-p` on `next start` / `next dev`).

Poster routes return **WebP** by default (`POLIS_POSTER_FORMAT` / `NEXT_PUBLIC_POLIS_POSTER_FORMAT` in `env.example`).

---

## Docker

```bash
cp env.example .env
# Set POLIS_PUBLIC_URL and TMDB keys in .env

docker compose up -d
```

Image: `ghcr.io/crazycacti/polis:latest`

`compose.yaml` mounts `./data` to `/app/data`. The entrypoint creates that directory and the app creates `polis.sqlite` on first use.

---

## Support

[Buy Me a Coffee](https://buymeacoffee.com/Crazy1)

---

## License

MIT. See [LICENSE](LICENSE).
