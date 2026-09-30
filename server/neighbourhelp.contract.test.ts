import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const read = (file: string) => readFileSync(resolve(projectRoot, file), "utf8");

describe("NeighbourHelp integration contracts", () => {
  it("defines the relational MySQL tables and integrity constraints", () => {
    const schema = read("database/schema.sql");
    expect(schema).toContain("CREATE DATABASE IF NOT EXISTS neighbourhelp");
    for (const table of ["users", "help_requests", "tasks", "ratings", "verification_requests"]) {
      expect(schema).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(schema).toContain("CONSTRAINT chk_rating_range CHECK (rating BETWEEN 1 AND 5)");
    expect(schema).toContain("UNIQUE KEY uq_task_reviewer (task_id, reviewer_id)");
    expect(schema).toContain("fk_tasks_request");
  });

  it("keeps Firebase token verification and server-side ownership checks in the API", () => {
    const api = read("server/api.ts");
    const firebase = read("server/firebase.ts");
    expect(firebase).toContain("verifyIdToken");
    expect(api).toContain("verifyFirebaseRequest(req)");
    expect(api).toContain("requester_id = ? AND status = 'Open'");
    expect(api).toContain("t.requester_id = ? OR t.helper_id = ?");
    expect(api).toContain("requireAdmin");
  });

  it("protects concurrent request acceptance and duplicate ratings", () => {
    const api = read("server/api.ts");
    expect(api).toContain("withTransaction(async (connection)");
    expect(api).toContain("FOR UPDATE");
    expect(api).toContain("request.status !== \"Open\"");
    expect(api).toContain("You have already rated this participant");
    expect(api).toContain("average_rating = (SELECT COALESCE(AVG(rating), 0)");
  });

  it("connects the agreed Bootstrap, jQuery AJAX, Firebase, and Leaflet layers", () => {
    const packageJson = read("package.json");
    const entry = read("client/src/main.ts");
    const ui = read("client/src/ui.ts");
    const auth = read("client/src/auth.ts");
    expect(packageJson).toContain('"bootstrap"');
    expect(packageJson).toContain('"jquery"');
    expect(packageJson).toContain('"firebase"');
    expect(packageJson).toContain('"leaflet"');
    expect(entry).toContain("bootstrap/dist/css/bootstrap.min.css");
    expect(entry).toContain("leaflet/dist/leaflet.css");
    expect(ui).toContain("$.ajax");
    expect(ui).toContain("tile.openstreetmap.org");
    expect(auth).toContain("signInWithEmailAndPassword");
    expect(auth).toContain("createUserWithEmailAndPassword");
    expect(auth).toContain("GoogleAuthProvider");
    expect(auth).toContain("FacebookAuthProvider");
    expect(auth).toContain("TwitterAuthProvider");
    expect(auth).toContain("signInWithPopup");
  });

  it("offers permission-based live location without exposing exact addresses by default", () => {
    const ui = read("client/src/ui.ts");
    expect(ui).toContain("data-social-provider=\"google\"");
    expect(ui).toContain("data-social-provider=\"facebook\"");
    expect(ui).toContain("data-social-provider=\"twitter\"");
    expect(ui).toContain("navigator.geolocation.getCurrentPosition");
    expect(ui).toContain("data-action=\"use-live-location\"");
    expect(ui).toContain("requestLatitude");
    expect(ui).toContain("requestLongitude");
    expect(ui).toContain("accuracy");
    expect(ui).toContain("Your exact address is never shown");
  });

  it("keeps a working secure login path when Firebase client keys are absent", () => {
    const api = read("server/api.ts");
    const ui = read("client/src/ui.ts");
    expect(api).toContain('app.get("/api/session/me"');
    expect(api).toContain("sdk.authenticateRequest(req)");
    expect(api).toContain("UPDATE users SET firebase_uid = ? WHERE openId = ?");
    expect(ui).toContain("data-action=\"manus-login\"");
    expect(ui).toContain("startLogin()");
    expect(ui).toContain("/api/session/me");
  });

  it("automatically provisions customer data after successful authentication", () => {
    const api = read("server/api.ts");
    const ui = read("client/src/ui.ts");
    expect(api).toContain("createHash(\"sha256\")");
    expect(api).toContain("INSERT INTO users (openId, firebase_uid, name, full_name, email");
    expect(api).toContain("ON DUPLICATE KEY UPDATE firebase_uid = VALUES(firebase_uid)");
    expect(ui).toContain("/api/auth/login");
    expect(ui).toContain("/api/auth/register");
  });

  it("routes unavailable Firebase login actions to the working fallback", () => {
    const ui = read("client/src/ui.ts");
    expect(ui).toContain('if (!firebaseConfigured) { startLogin(); return; }');
    expect(ui).toContain('if (!firebaseConfigured) { startLogin(); return; }');
  });

  it("adds an interactive mini-map to the landing page", () => {
    const ui = read("client/src/ui.ts");
    const css = read("client/src/index.css");
    expect(ui).toContain('id="home-mini-map"');
    expect(ui).toContain('data-action="use-live-location" data-map-target="home-mini-map"');
    expect(ui).toContain('if (routeName === "home") mapView("home-mini-map")');
    expect(css).toContain(".mini-map-panel");
    expect(css).toContain(".mini-map-canvas");
  });

  it("routes request cards to a detail page with accept and message actions", () => {
    const ui = read("client/src/ui.ts");
    const api = read("server/api.ts");
    const schema = read("database/schema.sql");
    expect(ui).toContain('case "request": content = requestDetailView(); break;');
    expect(ui).toContain('id="accept-request"');
    expect(ui).toContain('data-action="show-message-form"');
    expect(ui).toContain('api(`/api/tasks/${button.data("request-id")}/accept`');
    expect(ui).toContain('api("/api/messages"');
    expect(api).toContain('app.post("/api/messages"');
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS messages");
  });

  it("supports clear acceptance feedback and an approximate live-location route", () => {
    const ui = read("client/src/ui.ts");
    const api = read("server/api.ts");
    expect(api).toContain('return fail(res, 409, error instanceof Error ? error.message : "Unable to accept this request")');
    expect(ui).toContain('showApproximateRoute(state.routeRequest)');
    expect(ui).toContain('id="request-route-map"');
    expect(ui).toContain('L.polyline');
    expect(ui).toContain("confirm the exact meeting point privately");
    expect(ui).toContain('data-action="show-requester-route"');
    expect(ui).toContain('"#accept-request", async function');
  });

  it("keeps dynamically rendered accept and message controls operational", () => {
    const ui = read("client/src/ui.ts");
    expect(ui).toContain('"[data-action=show-message-form]").on("click.neighbourhelp"');
    expect(ui).toContain('"#message-request-form").on("submit.neighbourhelp"');
    expect(ui).toContain("state.routeRequest?.id");
  });

  it("removes requests after their preferred date", () => {
    const api = read("server/api.ts");
    expect(api).toContain("DELETE FROM help_requests WHERE preferred_date IS NOT NULL AND preferred_date < CURRENT_DATE()");
    expect(api).toContain("setInterval");
  });

  it("captures requester location before posting a request", () => {
    const ui = read("client/src/ui.ts");
    const api = read("server/api.ts");
    expect(ui).toContain("captureRequesterLocation()");
    expect(ui).toContain("approximate requester location for helper routing");
    expect(api).toContain("Allow location access so helpers can receive an approximate route");
    expect(api).toContain("requesterLatitude");
  });

  it("guides unauthenticated accept and message actions back to the request", () => {
    const ui = read("client/src/ui.ts");
    expect(ui).toContain("Sign in before accepting a request.");
    expect(ui).toContain("Sign in before messaging the requester.");
    expect(ui).toContain("neighbourhelp:returnAfterAuth");
    expect(ui).toContain("continueAfterAuth()");
  });

  it("automatically persists helper and requester role changes", () => {
    const ui = read("client/src/ui.ts");
    const api = read("server/api.ts");
    const schema = read("database/schema.sql");
    expect(ui).toContain('id="profileRequester"');
    expect(ui).toContain('change.neighbourhelp", "#profileHelper, #profileRequester"');
    expect(ui).toContain('Role saved automatically');
    expect(api).toContain("is_requester = ?");
    expect(api).toContain("UPDATE users SET is_requester = 1");
    expect(schema).toContain("is_requester TINYINT(1) NOT NULL DEFAULT 1");
  });

  it("provides an admin verification panel backed by protected endpoints", () => {
    const ui = read("client/src/ui.ts");
    const api = read("server/api.ts");
    expect(ui).toContain('href="#/admin"');
    expect(ui).toContain('data-admin-user-action="verify"');
    expect(ui).toContain('data-admin-user-action="unverify"');
    expect(ui).toContain('data-admin-verification-action="Approved"');
    expect(ui).toContain('/api/admin/users?search=');
    expect(api).toContain('app.get("/api/admin/users"');
    expect(api).toContain('app.put("/api/admin/users/:id"');
    expect(api).toContain('app.put("/api/admin/verifications/:id"');
    expect(api).toContain("requireAdmin");
  });

  it("requires helper details and admin approval before directory visibility", () => {
    const ui = read("client/src/ui.ts");
    const api = read("server/api.ts");
    const css = read("client/src/index.css");
    const schema = read("database/schema.sql");
    expect(ui).toContain('class="admin-panel-launcher"');
    expect(css).toContain(".admin-panel-launcher");
    expect(ui).toContain('id="submit-helper-application"');
    expect(ui).toContain('verificationType: "Helper application"');
    expect(api).toContain("Complete your name, phone, neighbourhood, skills, bio, and availability");
    expect(api).toContain("is_helper = CASE WHEN is_helper = 1 THEN ? ELSE 0 END");
    expect(api).toContain("v.verification_type = 'Helper application'");
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS verification_requests");
  });

  it("submits named administrator credentials from the login form", () => {
    const ui = read("client/src/ui.ts");
    expect(ui).toContain('id="adminEmail" name="username"');
    expect(ui).toContain('id="adminPassword" name="password"');
    expect(ui).toContain('/api/admin/login');
    expect(ui).toContain("firebaseSignIn");
  });

  it("supports the requested local administrator compatibility login", () => {
    const api = read("server/api.ts");
    const ui = read("client/src/ui.ts");
    expect(api).toContain('process.env.ADMIN_LEGACY_USERNAME ?? "admin"');
    expect(api).toContain('process.env.ADMIN_LEGACY_PASSWORD ?? "25879899"');
    expect(api).toContain('sessionReq.session.adminFirebaseUid = "legacy:admin"');
    expect(ui).toContain('username === "admin" && password === "25879899"');
  });

  it("sends browser session credentials with protected AJAX requests", () => {
    const ui = read("client/src/ui.ts");
    expect(ui).toContain("withCredentials: true");
  });

  it("makes pending helper applications visible and actionable to admins", () => {
    const ui = read("client/src/ui.ts");
    expect(ui).toContain("Helper applications for approval");
    expect(ui).toContain("No helper applications are waiting for approval.");
    expect(ui).toContain("data-admin-verification-action=\"Approved\"");
    expect(ui).toContain("item.document_reference");
  });

  it("guards Leaflet resize callbacks from detached map instances", () => {
    const ui = read("client/src/ui.ts");
    expect(ui).toContain("mapResizeTimers");
    expect(ui).toContain("maps[targetId] !== map");
    expect(ui).toContain("document.body.contains(node)");
    expect(ui).toContain("invalidateSize({ pan: false })");
  });

  it("requires verified Firebase administrator authorization before creating a session", () => {
    const api = read("server/api.ts");
    const firebase = read("server/firebase.ts");
    const schema = read("database/schema.sql");
    const env = read("ENVIRONMENT_SETUP.md");
    expect(api).toContain('verifyFirebaseRequest(req)');
    expect(api).toContain('isFirebaseAdmin(firebaseUser)');
    expect(api).toContain('sessionReq.session.save');
    expect(api).toContain('adminFirebaseUid');
    expect(firebase).toContain('decoded.admin === true');
    expect(firebase).toContain('ADMIN_FIREBASE_UIDS');
    expect(env).toContain('ADMIN_FIREBASE_EMAILS');
    expect(schema).not.toContain('INSERT INTO admin_users');
  });
});
