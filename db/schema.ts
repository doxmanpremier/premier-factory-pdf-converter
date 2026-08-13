import { sql } from "drizzle-orm";
import { index, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    name: text("name").notNull(),
    factory: text("factory").notNull().default("Cline's Welding and Fabrication"),
    dealers: text("dealers").notNull().default("[]"),
    premierEstimator: text("premier_estimator").notNull().default(""),
    premierSalesRep: text("premier_sales_rep").notNull().default(""),
    totalAmount: real("total_amount").notNull().default(0),
    specification: text("specification").notNull().default("Prime Spec"),
    uploadDate: text("upload_date").notNull().default(""),
    bidDate: text("bid_date").notNull().default(""),
    sourceFile: text("source_file").notNull().default(""),
    items: text("items").notNull().default("[]"),
    quotes: text("quotes").notNull().default("[]"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("projects_owner_created_idx").on(table.ownerKey, table.createdAt)]
);
