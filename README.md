# FlowGuard

A water utility management system for the (fictional) Marinduque water district, with
role-based dashboards for customers and operations staff.

This repository was converted from a static HTML/CSS/JS prototype into a full
**React + TypeScript** frontend and a separate **Express + TypeScript** backend, both
following an **MVC** architecture.

```
maynilad/
├── backend/     # Express + TypeScript API (Models · Services · Controllers · Routes)
├── frontend/    # Vite + React + TypeScript SPA (Models · Services · Controllers · Views)
├── legacy/      # The original static prototype, preserved for reference
└── package.json # Convenience scripts to run both apps together
```

## Architecture

### Backend — `backend/` (MVC)

| Layer | Folder | Responsibility |
| --- | --- | --- |
| **Model** | `src/models` | Domain types (`types.ts`), the in-memory data store (`store.ts`) and seed data (`seed.ts`). |
| **Service** | `src/services` | Business logic — auth (hashing, JWT, validation) and dashboard data/actions. Controllers stay thin. |
| **Controller** | `src/controllers` | HTTP adapters that translate requests into service calls. |
| **Routes** | `src/routes` | Endpoint wiring. |
| **Middleware** | `src/middleware` | JWT authentication and centralised error handling. |

The store is in-memory and seeded on boot, so the API runs with **zero external
dependencies** (no database to install). The `store.ts` module is the only place that
touches the data, so swapping in a real database later is a localised change.

### Frontend — `frontend/` (MVC)

| Layer | Folder | Responsibility |
| --- | --- | --- |
| **Model** | `src/models` | TypeScript types mirroring the API contract. |
| **Service** | `src/services` | API client, auth and dashboard data access. |
| **Controller** | `src/controllers` | React context providers (`AuthContext`, `ToastContext`) — session and notification state. |
| **View** | `src/views` | Components: `auth/`, `dashboard/`, and shared `components/`. |
| **Config** | `src/config` | Declarative, data-driven dashboard definitions (`roleViews.tsx`) and modal forms (`modals.ts`). |

The five near-identical dashboard HTML files from the prototype are now a **single
data-driven system**: `config/roleViews.tsx` declares each role's navigation and views,
and reusable view components render them.

## Getting started

```bash
# 1. Install dependencies for both apps
npm run install:all

# 2. Run the backend and frontend together (http://localhost:5173)
npm run dev
```

The frontend dev server proxies `/api` to the backend on port `4000`, so no CORS or
URL configuration is needed during development.

To run them separately: `npm run dev:api` and `npm run dev:web`.

### Demo accounts

Every seeded account uses the password **`password123`**:

| Role | Email |
| --- | --- |
| Customer | `customer@flowguard.ph` |
| Zone Specialist | `ramos@flowguard.ph` |
| General Manager | `reyes@flowguard.ph` |
| Inventory Officer | `cruz@flowguard.ph` |
| Technical Team | `santiago@flowguard.ph` |

You can also create a new account from the **Sign up** page.

## API reference

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/health` | — | Health check. |
| `POST` | `/api/auth/register` | — | Create an account; returns a JWT. |
| `POST` | `/api/auth/login` | — | Log in; returns a JWT. |
| `GET` | `/api/auth/me` | ✓ | Current user. |
| `GET` | `/api/dashboard` | ✓ | Role-specific dashboard data. |
| `POST` | `/api/dashboard/records` | ✓ | Create a record (complaint, PO, MRF, etc.). |

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run backend + frontend together. |
| `npm run build` | Type-check and build both apps. |
| `npm run typecheck` | Type-check both apps. |

## Configuration

Copy `backend/.env.example` to `backend/.env` to override `PORT`, `JWT_SECRET`,
`JWT_EXPIRES_IN` or `CORS_ORIGIN`.

## Notes

- The backend store is in-memory; data resets on restart. Replace `backend/src/models/store.ts`
  with a database-backed implementation to persist data.
- Icons are rendered by name via `lucide-react`. For the smallest possible production
  bundle you can later switch `views/components/Icon.tsx` to per-icon imports.
