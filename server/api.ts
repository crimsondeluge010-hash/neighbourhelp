import { createHash } from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import type { Session } from "express-session";
import type { RowDataPacket } from "mysql2";
import { execute, queryRows, withTransaction } from "./apiDb";
import { isFirebaseAdmin, verifyFirebaseRequest, type FirebaseUser } from "./firebase";
import { sdk } from "./_core/sdk";

interface AuthRequest extends Request {
  firebaseUser?: FirebaseUser;
  dbUserId?: number;
}

interface AdminSession extends Session {
  adminFirebaseUid?: string;
  adminEmail?: string;
}

type SessionRequest = Request & { session: AdminSession };
const LEGACY_ADMIN_USERNAME = process.env.ADMIN_LEGACY_USERNAME ?? "admin";
const LEGACY_ADMIN_PASSWORD = process.env.ADMIN_LEGACY_PASSWORD ?? "25879899";

function ok(res: Response, data: unknown = {}, message = "Success") {
  res.json({ success: true, message, data });
}

function fail(res: Response, status: number, message: string) {
  res.status(status).json({ success: false, message });
}

function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

async function requireFirebase(req: Request, res: Response, next: NextFunction) {
  try {
    const authUser = await verifyFirebaseRequest(req);
    const authReq = req as AuthRequest;
    authReq.firebaseUser = authUser;
    let rows = await queryRows<Array<{ id: number } & RowDataPacket>>(
      "SELECT id FROM users WHERE firebase_uid = ? LIMIT 1",
      [authUser.uid],
    );
    if (rows.length === 0) {
      const openId = `firebase:${createHash("sha256").update(authUser.uid).digest("hex").slice(0, 56)}`;
      const email = authUser.email?.trim().toLowerCase() || `${authUser.uid}@firebase.local`;
      const name = authUser.name?.trim() || email.split("@")[0] || "Neighbour";
      const matchingEmail = await queryRows<Array<{ openId: string } & RowDataPacket>>("SELECT openId FROM users WHERE email = ? LIMIT 1", [email]);
      if (matchingEmail.length > 0) {
        await execute("UPDATE users SET firebase_uid = ?, name = ?, full_name = ?, loginMethod = 'firebase', lastSignedIn = NOW() WHERE openId = ?", [authUser.uid, name, name, matchingEmail[0].openId]);
      } else {
        await execute(
          `INSERT INTO users (openId, firebase_uid, name, full_name, email, loginMethod, is_helper, is_verified, verification_status, completed_tasks, average_rating, createdAt, updatedAt, lastSignedIn)
           VALUES (?, ?, ?, ?, ?, 'firebase', 0, 0, 'Not Verified', 0, 0, NOW(), NOW(), NOW())
           ON DUPLICATE KEY UPDATE firebase_uid = VALUES(firebase_uid), name = VALUES(name), full_name = VALUES(full_name), email = VALUES(email), lastSignedIn = NOW()`,
          [openId, authUser.uid, name, name, email],
        );
      }
      rows = await queryRows<Array<{ id: number } & RowDataPacket>>("SELECT id FROM users WHERE firebase_uid = ? LIMIT 1", [authUser.uid]);
    }
    if (rows.length > 0) authReq.dbUserId = Number(rows[0].id);
    next();
  } catch (error) {
    try {
      const sessionUser = await sdk.authenticateRequest(req);
      const authReq = req as AuthRequest;
      const compatibleFirebaseUser: FirebaseUser = { uid: sessionUser.openId, email: sessionUser.email ?? undefined, name: sessionUser.name ?? undefined, picture: undefined };
      authReq.firebaseUser = compatibleFirebaseUser;
      await execute("UPDATE users SET firebase_uid = ? WHERE openId = ? AND (firebase_uid IS NULL OR firebase_uid = '')", [sessionUser.openId, sessionUser.openId]);
      const rows = await queryRows<Array<{ id: number } & RowDataPacket>>("SELECT id FROM users WHERE firebase_uid = ? LIMIT 1", [sessionUser.openId]);
      if (rows.length > 0) authReq.dbUserId = Number(rows[0].id);
      next();
    } catch {
      const message = error instanceof Error ? error.message : "Authentication failed";
      fail(res, message.includes("not configured") ? 503 : 401, message.includes("not configured") ? "Firebase server verification is not configured" : "Authentication required");
    }
  }
}

function requireDbUser(req: AuthRequest, res: Response) {
  if (!req.dbUserId) {
    fail(res, 409, "Complete your NeighbourHelp profile before continuing");
    return false;
  }
  return true;
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!(req as SessionRequest).session?.adminFirebaseUid) {
    fail(res, 401, "Administrator session required");
    return;
  }
  next();
}

function numberOrNull(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function removeExpiredRequests() {
  await execute("DELETE FROM help_requests WHERE preferred_date IS NOT NULL AND preferred_date < CURRENT_DATE()");
}

export function registerApiRoutes(app: Express) {
  const expiryTimer = setInterval(() => { void removeExpiredRequests().catch(() => undefined); }, 60 * 60 * 1000);
  expiryTimer.unref?.();
  app.get("/api/session/me", asyncRoute(async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      ok(res, { authenticated: true, user: { name: user.name, email: user.email, openId: user.openId } });
    } catch {
      ok(res, { authenticated: false, user: null });
    }
  }));
  app.get("/api/health", asyncRoute(async (_req, res) => {
    try {
      await queryRows("SELECT 1 AS ok");
      ok(res, { api: "online", database: "connected" });
    } catch {
      ok(res, { api: "online", database: "not-configured" }, "API is running; add DATABASE_URL to enable persistence");
    }
  }));

  app.get("/api/config/firebase", (_req, res) => {
    ok(res, {
      configured: Boolean(process.env.VITE_FIREBASE_API_KEY && process.env.VITE_FIREBASE_PROJECT_ID),
      provider: "firebase-authentication",
    });
  });

  app.post("/api/auth/register", requireFirebase, asyncRoute(async (req, res) => {
    const authReq = req as AuthRequest;
    const authUser = authReq.firebaseUser!;
    const { fullName, phone, address, skills, bio, availability, latitude, longitude } = req.body ?? {};
    const name = String(fullName ?? authUser.name ?? "").trim();
    const email = String(authUser.email ?? "").trim().toLowerCase();
    if (!name || !email) return fail(res, 400, "Full name and a verified Firebase email are required");
    const result = await execute(
      `INSERT INTO users (firebase_uid, full_name, email, phone, address, latitude, longitude, bio, skills, availability, is_helper, is_requester, is_verified, verification_status, completed_tasks, average_rating, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 0, 'Not Verified', 0, 0, NOW(), NOW())
       ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), email = VALUES(email), phone = VALUES(phone), address = VALUES(address), latitude = VALUES(latitude), longitude = VALUES(longitude), bio = VALUES(bio), skills = VALUES(skills), availability = VALUES(availability), is_requester = 1, updatedAt = NOW()`,
      [authUser.uid, name, email, phone ?? null, address ?? null, numberOrNull(latitude), numberOrNull(longitude), bio ?? null, skills ?? null, availability ?? null],
    );
    const userRows = await queryRows("SELECT id, full_name, email, is_verified, verification_status, average_rating, completed_tasks FROM users WHERE firebase_uid = ? LIMIT 1", [authUser.uid]);
    ok(res, { user: userRows[0], created: Boolean((result as { insertId?: number }).insertId) }, "Profile saved");
  }));

  app.post("/api/auth/login", requireFirebase, asyncRoute(async (req, res) => {
    const authReq = req as AuthRequest;
    const authUser = authReq.firebaseUser!;
    const rows = await queryRows("SELECT id, full_name, email, is_verified, verification_status, average_rating, completed_tasks FROM users WHERE firebase_uid = ? LIMIT 1", [authUser.uid]);
    ok(res, { user: rows[0] ?? null, profileComplete: rows.length > 0 }, "Firebase session accepted");
  }));

  app.get("/api/auth/me", requireFirebase, asyncRoute(async (req, res) => {
    const authReq = req as AuthRequest;
    const rows = await queryRows("SELECT * FROM users WHERE firebase_uid = ? LIMIT 1", [authReq.firebaseUser!.uid]);
    ok(res, { user: rows[0] ?? null, firebaseUser: authReq.firebaseUser, profileComplete: rows.length > 0 });
  }));

  app.post("/api/auth/logout", (_req, res) => ok(res, {}, "Signed out"));

  app.get("/api/users/profile", requireFirebase, asyncRoute(async (req, res) => {
    const authReq = req as AuthRequest;
    const rows = await queryRows("SELECT id, full_name, email, phone, address, latitude, longitude, bio, skills, availability, is_helper, is_requester, is_verified, verification_status, completed_tasks, average_rating, (SELECT status FROM verification_requests vr WHERE vr.user_id = users.id AND vr.verification_type = 'Helper application' ORDER BY vr.submitted_at DESC LIMIT 1) AS helper_application_status, createdAt AS created_at FROM users WHERE firebase_uid = ? LIMIT 1", [authReq.firebaseUser!.uid]);
    ok(res, { user: rows[0] ?? null });
  }));

  app.put("/api/users/profile", requireFirebase, asyncRoute(async (req, res) => {
    const authReq = req as AuthRequest;
    if (!requireDbUser(authReq, res)) return;
    const { fullName, phone, address, skills, bio, availability, latitude, longitude, isHelper, isRequester } = req.body ?? {};
    await execute(
      `UPDATE users SET full_name = ?, phone = ?, address = ?, skills = ?, bio = ?, availability = ?, latitude = ?, longitude = ?, is_helper = CASE WHEN is_helper = 1 THEN ? ELSE 0 END, is_requester = ?, updatedAt = NOW() WHERE id = ?`,
      [String(fullName ?? "").trim(), phone ?? null, address ?? null, skills ?? null, bio ?? null, availability ?? null, numberOrNull(latitude), numberOrNull(longitude), Boolean(isHelper), isRequester === undefined ? true : Boolean(isRequester), authReq.dbUserId],
    );
    ok(res, {}, "Profile updated");
  }));

  app.get("/api/users/helpers", asyncRoute(async (req, res) => {
    const lat = numberOrNull(req.query.lat);
    const lng = numberOrNull(req.query.lng);
    const radius = numberOrNull(req.query.radius) ?? 25;
    const distanceSql = lat !== null && lng !== null
      ? ", (6371 * ACOS(LEAST(1, GREATEST(-1, COS(RADIANS(?)) * COS(RADIANS(u.latitude)) * COS(RADIANS(u.longitude) - RADIANS(?)) + SIN(RADIANS(?)) * SIN(RADIANS(u.latitude)))))) AS distance_km"
      : ", NULL AS distance_km";
    const params = lat !== null && lng !== null ? [lat, lng, lat] : [];
    const rows = await queryRows(`${`SELECT u.id, u.full_name, u.skills, u.availability, u.is_verified, u.verification_status, u.completed_tasks, u.average_rating, u.latitude, u.longitude${distanceSql}
      FROM users u WHERE u.is_helper = 1 AND u.is_disabled = 0 AND u.latitude IS NOT NULL AND u.longitude IS NOT NULL`}${lat !== null && lng !== null ? " HAVING distance_km <= ?" : ""} ORDER BY ${lat !== null && lng !== null ? "distance_km" : "average_rating"} ASC LIMIT 50`, lat !== null && lng !== null ? [...params, radius] : []);
    ok(res, { helpers: rows });
  }));

  app.get("/api/users/:id", asyncRoute(async (req, res) => {
    const rows = await queryRows("SELECT id, full_name, skills, availability, bio, is_verified, verification_status, completed_tasks, average_rating, createdAt AS created_at FROM users WHERE id = ? AND is_disabled = 0 LIMIT 1", [Number(req.params.id)]);
    if (!rows[0]) return fail(res, 404, "Helper not found");
    const reviews = await queryRows("SELECT r.rating, r.review, r.created_at, u.full_name AS reviewer_name FROM ratings r JOIN users u ON u.id = r.reviewer_id WHERE r.reviewed_user_id = ? ORDER BY r.created_at DESC LIMIT 12", [Number(req.params.id)]);
    ok(res, { user: rows[0], reviews });
  }));

  app.get("/api/requests", asyncRoute(async (req, res) => {
    await removeExpiredRequests();
    const conditions = ["r.status <> 'Cancelled'"];
    const params: unknown[] = [];
    if (req.query.category) { conditions.push("r.category = ?"); params.push(String(req.query.category)); }
    if (req.query.status) { conditions.push("r.status = ?"); params.push(String(req.query.status)); }
    if (req.query.date) { conditions.push("DATE(r.preferred_date) = ?"); params.push(String(req.query.date)); }
    if (req.query.minBudget) { conditions.push("r.budget_max >= ?"); params.push(Number(req.query.minBudget)); }
    if (req.query.maxBudget) { conditions.push("r.budget_min <= ?"); params.push(Number(req.query.maxBudget)); }
    const rows = await queryRows(`SELECT r.id, r.title, r.description, r.category, r.location, r.latitude, r.longitude, r.preferred_date, r.preferred_time, r.budget_min, r.budget_max, r.status, r.created_at, u.id AS requester_id, u.full_name AS requester_name, u.average_rating AS requester_rating FROM help_requests r JOIN users u ON u.id = r.requester_id WHERE ${conditions.join(" AND ")} ORDER BY r.created_at DESC LIMIT 100`, params);
    ok(res, { requests: rows });
  }));

  app.post("/api/requests", requireFirebase, asyncRoute(async (req, res) => {
    const authReq = req as AuthRequest;
    if (!requireDbUser(authReq, res)) return;
    const { title, description, category, location, latitude, longitude, preferredDate, preferredTime, budgetMin, budgetMax } = req.body ?? {};
    const requesterLatitude = numberOrNull(latitude);
    const requesterLongitude = numberOrNull(longitude);
    if (!String(title ?? "").trim() || !String(description ?? "").trim() || !String(category ?? "").trim() || !String(location ?? "").trim()) return fail(res, 400, "Title, description, category and location are required");
    if (requesterLatitude === null || requesterLongitude === null) return fail(res, 400, "Allow location access so helpers can receive an approximate route");
    await execute("UPDATE users SET is_requester = 1, updatedAt = NOW() WHERE id = ?", [authReq.dbUserId]);
    const result = await execute("INSERT INTO help_requests (requester_id, title, description, category, location, latitude, longitude, preferred_date, preferred_time, budget_min, budget_max, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Open', NOW(), NOW())", [authReq.dbUserId, String(title).trim(), String(description).trim(), category, location, requesterLatitude, requesterLongitude, preferredDate || null, preferredTime || null, numberOrNull(budgetMin) ?? 0, numberOrNull(budgetMax) ?? numberOrNull(budgetMin) ?? 0]);
    ok(res, { id: (result as { insertId?: number }).insertId }, "Help request posted");
  }));

  app.get("/api/requests/:id", asyncRoute(async (req, res) => {
    await removeExpiredRequests();
    const rows = await queryRows("SELECT r.*, u.full_name AS requester_name, u.average_rating AS requester_rating, t.helper_id, h.full_name AS helper_name FROM help_requests r JOIN users u ON u.id = r.requester_id LEFT JOIN tasks t ON t.request_id = r.id LEFT JOIN users h ON h.id = t.helper_id WHERE r.id = ? LIMIT 1", [Number(req.params.id)]);
    if (!rows[0]) return fail(res, 404, "Help request not found");
    ok(res, { request: rows[0] });
  }));

  app.post("/api/messages", requireFirebase, asyncRoute(async (req, res) => {
    const authReq = req as AuthRequest;
    if (!requireDbUser(authReq, res)) return;
    const requestId = Number(req.body?.requestId);
    const body = String(req.body?.body ?? "").trim();
    if (!requestId || !body) return fail(res, 400, "Request and message are required");
    const rows = await queryRows<Array<{ requester_id: number; helper_id: number | null } & RowDataPacket>>("SELECT r.requester_id, t.helper_id FROM help_requests r LEFT JOIN tasks t ON t.request_id = r.id WHERE r.id = ? LIMIT 1", [requestId]);
    const request = rows[0];
    if (!request) return fail(res, 404, "Help request not found");
    const recipientId = Number(request.requester_id) === Number(authReq.dbUserId) ? request.helper_id : request.requester_id;
    if (!recipientId) return fail(res, 409, "This request has no other participant to message yet");
    await execute("INSERT INTO messages (request_id, sender_id, recipient_id, body, created_at) VALUES (?, ?, ?, ?, NOW())", [requestId, authReq.dbUserId, recipientId, body]);
    ok(res, {}, "Message sent");
  }));

  app.put("/api/requests/:id", requireFirebase, asyncRoute(async (req, res) => {
    const authReq = req as AuthRequest;
    if (!requireDbUser(authReq, res)) return;
    const { title, description, category, location, preferredDate, preferredTime, budgetMin, budgetMax } = req.body ?? {};
    const result = await execute("UPDATE help_requests SET title = ?, description = ?, category = ?, location = ?, preferred_date = ?, preferred_time = ?, budget_min = ?, budget_max = ?, updated_at = NOW() WHERE id = ? AND requester_id = ? AND status = 'Open'", [title, description, category, location, preferredDate || null, preferredTime || null, numberOrNull(budgetMin) ?? 0, numberOrNull(budgetMax) ?? 0, Number(req.params.id), authReq.dbUserId]);
    if ((result as { affectedRows?: number }).affectedRows !== 1) return fail(res, 404, "Request not found or no longer editable");
    ok(res, {}, "Request updated");
  }));

  app.delete("/api/requests/:id", requireFirebase, asyncRoute(async (req, res) => {
    const authReq = req as AuthRequest;
    if (!requireDbUser(authReq, res)) return;
    const result = await execute("UPDATE help_requests SET status = 'Cancelled', updated_at = NOW() WHERE id = ? AND requester_id = ? AND status = 'Open'", [Number(req.params.id), authReq.dbUserId]);
    if ((result as { affectedRows?: number }).affectedRows !== 1) return fail(res, 404, "Request not found or cannot be cancelled");
    ok(res, {}, "Request cancelled");
  }));

  app.post("/api/tasks/:requestId/accept", requireFirebase, asyncRoute(async (req, res) => {
    const authReq = req as AuthRequest;
    if (!requireDbUser(authReq, res)) return;
    if (Number(req.params.requestId) <= 0) return fail(res, 400, "Invalid request");
    let taskId: number;
    try {
      taskId = await withTransaction(async (connection) => {
        const [requestRows] = await connection.query<Array<{ id: number; requester_id: number; status: string } & import("mysql2").RowDataPacket[]>>("SELECT id, requester_id, status FROM help_requests WHERE id = ? FOR UPDATE", [Number(req.params.requestId)]);
        const request = requestRows[0];
        if (!request || request.status !== "Open") throw new Error("Request is no longer available");
        if (request.requester_id === authReq.dbUserId) throw new Error("You cannot accept your own request");
        const [result] = await connection.execute("INSERT INTO tasks (request_id, requester_id, helper_id, accepted_at, status, created_at, updated_at) VALUES (?, ?, ?, NOW(), 'Accepted', NOW(), NOW())", [request.id, request.requester_id, authReq.dbUserId]);
        await connection.execute("UPDATE help_requests SET status = 'Accepted', updated_at = NOW() WHERE id = ?", [request.id]);
        return (result as { insertId: number }).insertId;
      });
    } catch (error) {
      return fail(res, 409, error instanceof Error ? error.message : "Unable to accept this request");
    }
    ok(res, { taskId }, "You are now helping with this request");
  }));

  app.get("/api/tasks", requireFirebase, asyncRoute(async (req, res) => {
    const authReq = req as AuthRequest;
    if (!requireDbUser(authReq, res)) return;
    const rows = await queryRows("SELECT t.id, t.request_id, t.requester_id, t.helper_id, t.accepted_at, t.started_at, t.completed_at, t.status, r.title, r.category, r.location, r.budget_min, r.budget_max, requester.full_name AS requester_name, helper.full_name AS helper_name FROM tasks t JOIN help_requests r ON r.id = t.request_id JOIN users requester ON requester.id = t.requester_id JOIN users helper ON helper.id = t.helper_id WHERE t.requester_id = ? OR t.helper_id = ? ORDER BY t.updated_at DESC", [authReq.dbUserId, authReq.dbUserId]);
    ok(res, { tasks: rows });
  }));

  app.get("/api/tasks/:id", requireFirebase, asyncRoute(async (req, res) => {
    const authReq = req as AuthRequest;
    if (!requireDbUser(authReq, res)) return;
    const rows = await queryRows("SELECT t.*, r.title, r.description, r.category, r.location, r.preferred_date, r.preferred_time, r.budget_min, r.budget_max, requester.full_name AS requester_name, helper.full_name AS helper_name FROM tasks t JOIN help_requests r ON r.id = t.request_id JOIN users requester ON requester.id = t.requester_id JOIN users helper ON helper.id = t.helper_id WHERE t.id = ? AND (t.requester_id = ? OR t.helper_id = ?) LIMIT 1", [Number(req.params.id), authReq.dbUserId, authReq.dbUserId]);
    if (!rows[0]) return fail(res, 404, "Task not found");
    ok(res, { task: rows[0] });
  }));

  app.put("/api/tasks/:id/status", requireFirebase, asyncRoute(async (req, res) => {
    const authReq = req as AuthRequest;
    if (!requireDbUser(authReq, res)) return;
    const status = String(req.body?.status ?? "");
    if (!["In Progress", "Completed", "Cancelled"].includes(status)) return fail(res, 400, "Invalid task status");
    const rows = await queryRows("SELECT helper_id, requester_id, status FROM tasks WHERE id = ? LIMIT 1", [Number(req.params.id)]);
    const task = rows[0] as { helper_id: number; requester_id: number; status: string } | undefined;
    if (!task || (task.helper_id !== authReq.dbUserId && task.requester_id !== authReq.dbUserId)) return fail(res, 403, "You are not a participant in this task");
    const isHelper = task.helper_id === authReq.dbUserId;
    if (status === "In Progress" && !isHelper) return fail(res, 403, "Only the helper can start a task");
    if (status === "Completed" && !isHelper) return fail(res, 403, "Only the helper can complete a task");
    const timestampColumn = status === "In Progress" ? "started_at" : status === "Completed" ? "completed_at" : null;
    await execute(`UPDATE tasks SET status = ?, ${timestampColumn ? `${timestampColumn} = NOW(),` : ""} updated_at = NOW() WHERE id = ?`, [status, Number(req.params.id)]);
    await execute("UPDATE help_requests r JOIN tasks t ON t.request_id = r.id SET r.status = ?, r.updated_at = NOW() WHERE t.id = ?", [status, Number(req.params.id)]);
    if (status === "Completed") await execute("UPDATE users u JOIN tasks t ON t.helper_id = u.id SET u.completed_tasks = u.completed_tasks + 1 WHERE t.id = ?", [Number(req.params.id)]);
    ok(res, {}, `Task marked ${status.toLowerCase()}`);
  }));

  app.post("/api/ratings", requireFirebase, asyncRoute(async (req, res) => {
    const authReq = req as AuthRequest;
    if (!requireDbUser(authReq, res)) return;
    const taskId = Number(req.body?.taskId);
    const rating = Number(req.body?.rating);
    const review = String(req.body?.review ?? "").trim();
    if (!taskId || !Number.isInteger(rating) || rating < 1 || rating > 5) return fail(res, 400, "Rating must be an integer from 1 to 5");
    const tasks = await queryRows("SELECT requester_id, helper_id, status FROM tasks WHERE id = ? LIMIT 1", [taskId]);
    const task = tasks[0] as { requester_id: number; helper_id: number; status: string } | undefined;
    if (!task || task.status !== "Completed") return fail(res, 400, "Only completed tasks can be rated");
    if (task.requester_id !== authReq.dbUserId && task.helper_id !== authReq.dbUserId) return fail(res, 403, "You did not participate in this task");
    const reviewedUserId = task.requester_id === authReq.dbUserId ? task.helper_id : task.requester_id;
    try {
      await execute("INSERT INTO ratings (task_id, reviewer_id, reviewed_user_id, rating, review, created_at) VALUES (?, ?, ?, ?, ?, NOW())", [taskId, authReq.dbUserId, reviewedUserId, rating, review || null]);
    } catch (error) {
      if (String(error).includes("Duplicate")) return fail(res, 409, "You have already rated this participant");
      throw error;
    }
    await execute("UPDATE users SET average_rating = (SELECT COALESCE(AVG(rating), 0) FROM ratings WHERE reviewed_user_id = ?), updatedAt = NOW() WHERE id = ?", [reviewedUserId, reviewedUserId]);
    ok(res, {}, "Review submitted");
  }));

  app.get("/api/users/:id/ratings", asyncRoute(async (req, res) => {
    const rows = await queryRows("SELECT r.rating, r.review, r.created_at, u.full_name AS reviewer_name FROM ratings r JOIN users u ON u.id = r.reviewer_id WHERE r.reviewed_user_id = ? ORDER BY r.created_at DESC", [Number(req.params.id)]);
    ok(res, { ratings: rows });
  }));

  app.post("/api/verifications", requireFirebase, asyncRoute(async (req, res) => {
    const authReq = req as AuthRequest;
    if (!requireDbUser(authReq, res)) return;
    const verificationType = String(req.body?.verificationType ?? "Profile review");
    if (verificationType === "Helper application") {
      const profileRows = await queryRows<Array<{ full_name: string | null; phone: string | null; address: string | null; skills: string | null; bio: string | null; availability: string | null } & RowDataPacket>>("SELECT full_name, phone, address, skills, bio, availability FROM users WHERE id = ? LIMIT 1", [authReq.dbUserId]);
      const profile = profileRows[0];
      if (!profile || !profile.full_name?.trim() || !profile.phone?.trim() || !profile.address?.trim() || !profile.skills?.trim() || !profile.bio?.trim() || !profile.availability?.trim()) return fail(res, 400, "Complete your name, phone, neighbourhood, skills, bio, and availability before submitting as a helper");
      const pending = await queryRows("SELECT id FROM verification_requests WHERE user_id = ? AND verification_type = 'Helper application' AND status = 'Pending' LIMIT 1", [authReq.dbUserId]);
      if (pending.length > 0) return fail(res, 409, "Your helper application is already pending admin review");
    }
    await execute("INSERT INTO verification_requests (user_id, verification_type, document_reference, status, submitted_at) VALUES (?, ?, ?, 'Pending', NOW())", [authReq.dbUserId, verificationType, String(req.body?.documentReference ?? "").trim() || null]);
    await execute("UPDATE users SET verification_status = 'Pending Verification', updatedAt = NOW() WHERE id = ?", [authReq.dbUserId]);
    ok(res, {}, "Verification request submitted");
  }));

  app.get("/api/dashboard", requireFirebase, asyncRoute(async (req, res) => {
    const authReq = req as AuthRequest;
    if (!requireDbUser(authReq, res)) return;
    await removeExpiredRequests();
    const [profile, openRequests, activeTasks, nearbyRequests] = await Promise.all([
      queryRows("SELECT id, full_name, email, is_verified, verification_status, average_rating, completed_tasks FROM users WHERE id = ? LIMIT 1", [authReq.dbUserId]),
      queryRows("SELECT COUNT(*) AS count FROM help_requests WHERE requester_id = ? AND status = 'Open'", [authReq.dbUserId]),
      queryRows("SELECT COUNT(*) AS count FROM tasks WHERE (requester_id = ? OR helper_id = ?) AND status IN ('Accepted', 'In Progress')", [authReq.dbUserId, authReq.dbUserId]),
      queryRows("SELECT id, title, category, location, budget_min, budget_max, status FROM help_requests WHERE status = 'Open' ORDER BY created_at DESC LIMIT 4"),
    ]);
    ok(res, { profile: profile[0], openRequests: Number((openRequests[0] as { count: number }).count), activeTasks: Number((activeTasks[0] as { count: number }).count), nearbyRequests });
  }));

  app.post("/api/admin/login", asyncRoute(async (req, res) => {
    const username = String(req.body?.username ?? "").trim();
    const password = String(req.body?.password ?? "");
    if (username === LEGACY_ADMIN_USERNAME && password === LEGACY_ADMIN_PASSWORD) {
      const sessionReq = req as SessionRequest;
      sessionReq.session.adminFirebaseUid = "legacy:admin";
      sessionReq.session.adminEmail = "admin";
      await new Promise<void>((resolve, reject) => sessionReq.session.save((error) => error ? reject(error) : resolve()));
      console.info("[AdminAuth] LOCAL COMPATIBILITY SESSION CREATED");
      return ok(res, { username }, "Administrator session started");
    }
    let firebaseUser: FirebaseUser;
    try {
      firebaseUser = await verifyFirebaseRequest(req);
      console.info(`[AdminAuth] TOKEN VERIFIED uid=${firebaseUser.uid}`);
    } catch {
      console.warn("[AdminAuth] FIREBASE AUTH FAILED");
      return fail(res, 401, "Valid Firebase authentication is required");
    }
    console.info(`[AdminAuth] ADMIN CHECK uid=${firebaseUser.uid}`);
    if (!isFirebaseAdmin(firebaseUser)) return fail(res, 403, "This Firebase account is not authorized as an administrator");
    const sessionReq = req as SessionRequest;
    sessionReq.session.adminFirebaseUid = firebaseUser.uid;
    sessionReq.session.adminEmail = firebaseUser.email;
    await new Promise<void>((resolve, reject) => sessionReq.session.save((error) => error ? reject(error) : resolve()));
    console.info(`[AdminAuth] SESSION CREATED uid=${firebaseUser.uid}`);
    ok(res, { email: firebaseUser.email ?? null }, "Administrator session started");
  }));

  app.post("/api/admin/logout", (req, res) => {
    (req as SessionRequest).session.destroy(() => ok(res, {}, "Administrator signed out"));
  });

  app.get("/api/admin/dashboard", requireAdmin, asyncRoute(async (_req, res) => {
    const [users, verified, requests, open, tasks, completed, reviews] = await Promise.all([
      queryRows("SELECT COUNT(*) AS count FROM users"), queryRows("SELECT COUNT(*) AS count FROM users WHERE is_verified = 1"), queryRows("SELECT COUNT(*) AS count FROM help_requests"), queryRows("SELECT COUNT(*) AS count FROM help_requests WHERE status = 'Open'"), queryRows("SELECT COUNT(*) AS count FROM tasks WHERE status IN ('Accepted', 'In Progress')"), queryRows("SELECT COUNT(*) AS count FROM tasks WHERE status = 'Completed'"), queryRows("SELECT COUNT(*) AS count FROM ratings"),
    ]);
    ok(res, { totalUsers: Number((users[0] as { count: number }).count), verifiedUsers: Number((verified[0] as { count: number }).count), totalRequests: Number((requests[0] as { count: number }).count), openRequests: Number((open[0] as { count: number }).count), activeTasks: Number((tasks[0] as { count: number }).count), completedTasks: Number((completed[0] as { count: number }).count), totalReviews: Number((reviews[0] as { count: number }).count) });
  }));

  app.get("/api/admin/users", requireAdmin, asyncRoute(async (req, res) => {
    const search = String(req.query.search ?? "").trim();
    const rows = await queryRows("SELECT id, full_name, email, phone, is_helper, is_verified, verification_status, is_disabled, completed_tasks, average_rating, createdAt AS created_at FROM users WHERE full_name LIKE ? OR email LIKE ? ORDER BY created_at DESC LIMIT 200", [`%${search}%`, `%${search}%`]);
    ok(res, { users: rows });
  }));

  app.put("/api/admin/users/:id", requireAdmin, asyncRoute(async (req, res) => {
    const action = String(req.body?.action ?? "");
    if (!["verify", "unverify", "disable", "enable"].includes(action)) return fail(res, 400, "Unsupported user action");
    await execute("UPDATE users SET is_verified = ?, verification_status = ?, is_disabled = ?, updatedAt = NOW() WHERE id = ?", [action === "verify" ? 1 : 0, action === "verify" ? "Verified" : action === "unverify" ? "Not Verified" : "Not Verified", action === "disable" ? 1 : 0, Number(req.params.id)]);
    ok(res, {}, "User updated");
  }));

  app.get("/api/admin/requests", requireAdmin, asyncRoute(async (_req, res) => {
    await removeExpiredRequests();
    const rows = await queryRows("SELECT r.id, r.title, r.category, r.location, r.status, r.budget_min, r.budget_max, r.created_at, requester.full_name AS requester_name, helper.full_name AS helper_name FROM help_requests r JOIN users requester ON requester.id = r.requester_id LEFT JOIN tasks t ON t.request_id = r.id LEFT JOIN users helper ON helper.id = t.helper_id ORDER BY r.created_at DESC LIMIT 200");
    ok(res, { requests: rows });
  }));

  app.put("/api/admin/requests/:id", requireAdmin, asyncRoute(async (req, res) => {
    const status = String(req.body?.status ?? "Cancelled");
    if (!["Open", "Cancelled"].includes(status)) return fail(res, 400, "Unsupported request status");
    await execute("UPDATE help_requests SET status = ?, updated_at = NOW() WHERE id = ?", [status, Number(req.params.id)]);
    ok(res, {}, "Request updated");
  }));

  app.get("/api/admin/tasks", requireAdmin, asyncRoute(async (_req, res) => {
    const rows = await queryRows("SELECT t.id, t.status, t.accepted_at, t.started_at, t.completed_at, r.title, requester.full_name AS requester_name, helper.full_name AS helper_name FROM tasks t JOIN help_requests r ON r.id = t.request_id JOIN users requester ON requester.id = t.requester_id JOIN users helper ON helper.id = t.helper_id ORDER BY t.created_at DESC LIMIT 200");
    ok(res, { tasks: rows });
  }));

  app.get("/api/admin/reviews", requireAdmin, asyncRoute(async (_req, res) => {
    const rows = await queryRows("SELECT r.id, r.rating, r.review, r.created_at, reviewer.full_name AS reviewer_name, reviewed.full_name AS reviewed_name FROM ratings r JOIN users reviewer ON reviewer.id = r.reviewer_id JOIN users reviewed ON reviewed.id = r.reviewed_user_id ORDER BY r.created_at DESC LIMIT 200");
    ok(res, { reviews: rows });
  }));

  app.delete("/api/admin/reviews/:id", requireAdmin, asyncRoute(async (req, res) => {
    await execute("DELETE FROM ratings WHERE id = ?", [Number(req.params.id)]);
    ok(res, {}, "Review removed");
  }));

  app.get("/api/admin/verifications", requireAdmin, asyncRoute(async (_req, res) => {
    const rows = await queryRows("SELECT v.id, v.verification_type, v.document_reference, v.status, v.admin_notes, v.submitted_at, v.reviewed_at, u.id AS user_id, u.full_name, u.email FROM verification_requests v JOIN users u ON u.id = v.user_id ORDER BY v.submitted_at DESC LIMIT 200");
    ok(res, { verifications: rows });
  }));

  app.put("/api/admin/verifications/:id", requireAdmin, asyncRoute(async (req, res) => {
    const status = String(req.body?.status ?? "");
    if (!["Approved", "Rejected"].includes(status)) return fail(res, 400, "Verification status must be Approved or Rejected");
    await execute("UPDATE verification_requests v JOIN users u ON u.id = v.user_id SET v.status = ?, v.admin_notes = ?, v.reviewed_at = NOW(), u.is_verified = ?, u.is_helper = CASE WHEN v.verification_type = 'Helper application' THEN ? ELSE u.is_helper END, u.verification_status = ?, u.updatedAt = NOW() WHERE v.id = ?", [status, String(req.body?.adminNotes ?? "").trim() || null, status === "Approved" ? 1 : 0, status === "Approved" ? 1 : 0, status === "Approved" ? "Verified" : "Not Verified", Number(req.params.id)]);
    ok(res, {}, "Verification reviewed");
  }));
}
