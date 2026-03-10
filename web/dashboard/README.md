# Dashboard (React UI)

Run the dashboard separately from the API. Use two terminals.

**Terminal 1 — API server** (project root)

```bash
npm run web
```

Runs the backend at http://localhost:3000.

**Terminal 2 — Dashboard** (this folder)

```bash
cd web/dashboard
npm install
npm run dev
```

Runs the React app at http://localhost:5173. API and Socket.IO requests are proxied to port 3000.

- `npm run build` — production build (output in `web/public-react` for the server to serve).
