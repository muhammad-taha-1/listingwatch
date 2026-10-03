// Vite replaces import.meta.env.VITE_* at build time, so these values are
// public: anything here ships to every browser. Never put secrets in VITE_ vars.
const apiUrl = import.meta.env.VITE_API_URL

// Fail fast, like the API's config: a missing URL would otherwise surface as
// confusing fetch errors against the dev server.
if (!apiUrl) {
  throw new Error('VITE_API_URL is not set. Copy web/.env.example to web/.env.')
}

export const config = {
  apiUrl: apiUrl.replace(/\/+$/, ''),
}
