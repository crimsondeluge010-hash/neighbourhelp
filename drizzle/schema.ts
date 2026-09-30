import { decimal, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  firebaseUid: varchar("firebase_uid", { length: 128 }).unique(),
  name: text("name"),
  fullName: varchar("full_name", { length: 120 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 32 }),
  profilePhoto: varchar("profile_photo", { length: 500 }),
  address: varchar("address", { length: 255 }),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  bio: text("bio"),
  skills: varchar("skills", { length: 500 }),
  availability: varchar("availability", { length: 120 }),
  isHelper: int("is_helper").default(0).notNull(),
  isRequester: int("is_requester").default(1).notNull(),
  isVerified: int("is_verified").default(0).notNull(),
  verificationStatus: mysqlEnum("verification_status", ["Verified", "Pending Verification", "Not Verified"]).default("Not Verified").notNull(),
  isDisabled: int("is_disabled").default(0).notNull(),
  completedTasks: int("completed_tasks").default(0).notNull(),
  averageRating: decimal("average_rating", { precision: 3, scale: 2 }).default("0").notNull(),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// TODO: Add your tables here
