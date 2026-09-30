# NeighbourHelp — Help. Earn. Belong.

NeighbourHelp is a hyperlocal community platform that connects people who need help with nearby people who can provide it. The first release includes a responsive Bootstrap experience, Firebase Authentication, a Node.js/Express REST API, MySQL persistence, jQuery AJAX interactions, and Leaflet/OpenStreetMap discovery.

The implementation follows the approved Option A decision: **Firebase Authentication and Bootstrap are intentionally included**, even though the original pasted brief listed them as exclusions.

## What is included

The landing page presents the Need help → Post request → Find nearby helpers → Accept → Complete → Rate workflow. Authenticated users can create a trust profile, post and browse help requests, discover nearby helpers, accept tasks, update task status, and submit ratings after completion. The backend exposes REST-style routes for users, requests, tasks, ratings, verification, dashboard data, and a separate administrator console.

Firebase handles the user identity lifecycle in the browser. The browser sends a Firebase ID token to the Express API as a bearer token. When `FIREBASE_SERVICE_ACCOUNT_JSON` is configured, the server verifies that token with Firebase Admin before any protected route proceeds. The server does not accept a user ID from the browser as proof of identity.

## Technology stack

- Frontend: HTML5 entry document, CSS3, TypeScript compiled to browser JavaScript, Bootstrap 5, jQuery AJAX, Firebase Authentication, Leaflet, and OpenStreetMap tiles.
- Backend: Node.js, Express, Express Session for the separate administrator console, Firebase Admin token verification, and parameterized MySQL queries.
- Database: MySQL database named `neighbourhelp`.
- Maps: Leaflet with OpenStreetMap. Public cards use approximate neighbourhood labels rather than exposing exact home addresses.

## Project structure

```text
neighbourhelp/
├── client/
│   ├── index.html
│   └── src/
│       ├── auth.ts              # Firebase client authentication boundary
│       ├── main.ts              # Bootstrap, Leaflet, and app entry point
│       ├── ui.ts                # Routes, views, forms, AJAX, and map rendering
│       └── index.css            # NeighbourHelp design system and responsive styles
├── database/
│   └── schema.sql               # MySQL schema, constraints, indexes, and initial admin
├── server/
│   ├── api.ts                   # REST controllers and route registration
│   ├── apiDb.ts                 # MySQL pool, queries, and transactions
│   ├── firebase.ts              # Firebase Admin token verification
│   ├── db.ts                    # Existing WebDev/tRPC database compatibility layer
│   └── _core/index.ts           # Managed Express runtime and middleware registration
├── ENVIRONMENT_SETUP.md         # Required configuration variable names
├── package.json
└── README.md
```

The managed WebDev scaffold still contains its original tRPC support files for runtime compatibility, but the NeighbourHelp UI uses the documented REST API and jQuery AJAX boundary. SQL is kept server-side; no SQL query is placed in frontend code.

## Requirements

- Node.js 20 or newer
- pnpm or npm
- MySQL 8 or a compatible MySQL service
- A Firebase project with Email/Password sign-in enabled
- Firebase Web App configuration values
- A Firebase Admin service-account JSON value for server-side token verification

## MySQL setup

Create the database and tables by importing the schema:

```bash
mysql -u root -p < database/schema.sql
```

The schema creates the `neighbourhelp` database, foreign keys, status constraints, indexes, and a unique `(task_id, reviewer_id)` constraint that prevents duplicate ratings. It creates no fake users, help requests, tasks, or reviews. It seeds only the required administrator row.

The managed WebDev database starts with a scaffold-compatible `users` table. For that environment, the profile columns and related tables are applied through the equivalent migration documented in `database/managed-migration.sql`; the running project database has already been initialized with this compatible shape.

## Environment configuration

Use the variable names in `ENVIRONMENT_SETUP.md` and add them through the WebDev project secret configuration for deployed environments. For a local setup, create an untracked `.env` file with those values.

The `VITE_FIREBASE_*` values are safe Firebase web configuration values. `FIREBASE_SERVICE_ACCOUNT_JSON`, `DATABASE_URL`, `SESSION_SECRET`, and `JWT_SECRET` must remain server-side secrets.

## Install and run

For Windows users, see `START_HERE_WINDOWS.md`. The folder also includes `START_NEIGHBOURHELP_WINDOWS.bat`, which installs dependencies and starts the development server when double-clicked.

```bash
pnpm install
pnpm dev
```

The managed preview URL is supplied by the WebDev project environment. For a normal local setup, the server listens on port `3000` unless `PORT` is set.

Production validation and build:

```bash
pnpm check
pnpm build
pnpm start
```

## Firebase Authentication setup

1. Create or select a Firebase project.
2. Add a Web App and copy its configuration into the `VITE_FIREBASE_*` values.
3. In Firebase Authentication, enable Email/Password sign-in.
4. In Firebase Authentication → Sign-in method, enable Google, Facebook, and Twitter. Facebook and Twitter additionally require their OAuth app ID/secret and the Firebase callback domain in each provider console.
5. Create a Firebase Admin service account and serialize the JSON into `FIREBASE_SERVICE_ACCOUNT_JSON`. Newline characters inside the private key may be stored as `\\n`.
6. Import the MySQL schema and set `DATABASE_URL`.

If the web values are missing, the interface clearly reports that Firebase is not configured. It does not silently create a fake logged-in user. If the Admin service-account value is missing, protected Express endpoints return a configuration error rather than trusting client input.

The login and registration screens now offer **Continue with Google**, **Continue with Facebook**, and **Continue with Twitter** through Firebase popup authentication. Provider buttons remain visible when configuration is incomplete, and Firebase returns the actionable setup error instead of pretending the sign-in succeeded.

## Live location and maps

The Find help map uses Leaflet and OpenStreetMap. Users can select **Use my live location**; the browser asks for permission, then the map centers on the current position and shows an accuracy circle. When posting a request, the form automatically asks for the requester’s approximate coordinates and stores them with the request so an accepted helper can receive a route. The public interface continues to show neighbourhood-level locations and does not expose an exact home address by default.

Helper and requester roles are saved automatically in MySQL. Every authenticated customer is a requester by default; switching **I want to help nearby** or **I may request help** on the profile updates `users.is_helper` or `users.is_requester` immediately, without requiring a separate save action.

## API surface

The API is registered from `server/api.ts` and uses consistent JSON responses:

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/users/profile`, `PUT /api/users/profile`, `GET /api/users/helpers`, `GET /api/users/:id`, `GET /api/users/:id/ratings`
- `POST /api/requests`, `GET /api/requests`, `GET /api/requests/:id`, `PUT /api/requests/:id`, `DELETE /api/requests/:id`
- `POST /api/tasks/:requestId/accept`, `GET /api/tasks`, `GET /api/tasks/:id`, `PUT /api/tasks/:id/status`
- `POST /api/ratings`, `POST /api/verifications`, `GET /api/dashboard`
- `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/dashboard`
- `GET/PUT /api/admin/users`, `GET/PUT /api/admin/requests`, `GET /api/admin/tasks`, `GET/DELETE /api/admin/reviews`, `GET/PUT /api/admin/verifications`

Task acceptance is transaction-protected with a row lock so two helpers cannot accept the same open request. Status changes verify task participation server-side. Ratings verify participation, completion, valid 1–5 range, and duplicate submission before recalculating the reviewed user’s average.

## Administrator console

Open `#/admin` in the site, or use `/admin` in a normal local URL. The administrator signs in through Firebase Authentication. The server verifies the Firebase ID token, checks a Firebase `admin=true` or `role=admin` custom claim or the configured `ADMIN_FIREBASE_UIDS`/`ADMIN_FIREBASE_EMAILS` allowlist, and only then creates the HTTP-only administrator session.

The Firebase Web App configuration and server-side Firebase Admin service account are required. Configure the administrator allowlist variables described in `ENVIRONMENT_SETUP.md`; no administrator password or credential is hardcoded in the frontend. Admin-only APIs validate the server session on every request, and logout destroys that session.

## User workflow

A user creates an account through Firebase Authentication, then saves a NeighbourHelp profile with skills, availability, approximate location, and helper preference. To become a helper, the user must complete the required profile details and submit a **Helper application**; an administrator approves or rejects it before the user appears in the helper directory. Users can post requests with a category, date, time, location, budget, and description. Other authenticated users can browse open requests, accept one if they are not the requester, move the task from Accepted to In Progress to Completed, and then both participants can review one another.

## Admin workflow

The administrator signs in through the separate session-backed console and can view live counts, users, requests, tasks, reviews, and verification records. For the requested local workflow, use username `admin` and password `25879899`; these values are checked server-side and can be overridden with `ADMIN_LEGACY_USERNAME` and `ADMIN_LEGACY_PASSWORD`. Firebase administrator sign-in remains available when configured. Admin actions are checked server-side. Verification is a simple administrator-controlled project feature labelled Verified, Pending Verification, or Not Verified; it is not government-certified identity verification.

## Privacy and security notes

Passwords for normal users are handled by Firebase and are never stored in MySQL. The server uses parameterized queries, Firebase ID-token verification, secure HTTP-only admin cookies, server-side ownership checks, MySQL foreign keys, and validation for statuses and ratings. Public discovery returns approximate location labels and does not expose private contact details unnecessarily.
