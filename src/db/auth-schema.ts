import { relations, sql } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .default(false)
    .notNull(),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  // 規約同意の記録(段階3-5、docs/architecture.md 第7節)。いずれもnull可で、既存ユーザーは
  // 同意の記録が無いためnullのままにする。サインアップ時にサーバー側(src/lib/auth.tsの
  // databaseHooks.user.create.before)でのみ設定し、利用者が送った値では上書きされないよう
  // Better Authのuser.additionalFieldsで全てinput: falseにする
  termsAcceptedAt: integer("terms_accepted_at", { mode: "timestamp_ms" }),
  // 同意した利用規約の制定・改定日(例: "2026-09-18")。値はsrc/shared/constants/legal-versions.ts
  termsVersion: text("terms_version"),
  // 同意したプライバシーポリシーの制定・改定日。同意のチェックボックスは両方への同意のため、
  // 両方の版を別々に記録する
  privacyPolicyVersion: text("privacy_policy_version"),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

// Better Authのレート制限データ保存用テーブル(rateLimit.storage: "database")。
// src/lib/auth.tsのrateLimit設定に対応する。フィールド名(key/count/lastRequest)は
// Better Auth側でrateLimit.fieldsを上書きしていないため、既定のフィールド名と揃える必要がある
// (DBのカラム名自体は他テーブルと同様にsnake_caseで問題ない。Better Authのdrizzleアダプターは
// TypeScript側のプロパティ名でマッピングするため)
export const rateLimit = sqliteTable("rateLimit", {
  id: text("id").primaryKey(),
  // レート制限の集計単位となるキー(例: "sign-in/email:<IPアドレス>")。IPアドレス+パス単位で一意
  key: text("key").notNull().unique(),
  // 現在のウィンドウ内でのリクエスト回数
  count: integer("count").notNull(),
  // 直近のリクエスト時刻(エポックミリ秒)。ウィンドウの開始・リセット判定に使う
  lastRequest: integer("last_request").notNull(),
});

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));
