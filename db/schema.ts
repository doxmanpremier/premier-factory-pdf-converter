import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
    territory: text("territory").notNull().default(""),
    uploadDate: text("upload_date").notNull().default(""),
    bidDate: text("bid_date").notNull().default(""),
    sourceFile: text("source_file").notNull().default(""),
    items: text("items").notNull().default("[]"),
    quotes: text("quotes").notNull().default("[]"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("projects_owner_created_idx").on(table.ownerKey, table.createdAt)]
);

export const pmEntries=sqliteTable('entries',{id:text('id').primaryKey(),owner:text('owner').notNull(),parent:text('parent'),kind:text('kind').notNull(),name:text('name').notNull(),content:text('content'),url:text('url'),key:text('key'),mime:text('mime'),size:real('size'),date:text('date'),stage:text('stage'),itemnumber:text('itemnumber'),manufacturer:text('manufacturer'),model:text('model'),quantity:real('quantity'),color:text('color'),created:text('created').notNull(),shop_drawings:text('shop_drawings'),po_number:text('po_number'),quote_number:text('quote_number'),shipping_destination:text('shipping_destination'),expected_receiving_date:text('expected_receiving_date'),order_position:real('order_position'),job_category:text('job_category'),stage_scope:text('stage_scope'),unit_price_cents:integer('unit_price_cents'),unit_cost_cents:integer('unit_cost_cents'),freight_cost_cents:integer('freight_cost_cents'),freight_charge_cents:integer('freight_charge_cents'),pricing_mode:text('pricing_mode'),markup_percent:real('markup_percent')});
export const pmMeta=sqliteTable('pm_meta',{id:text('id').primaryKey()});
