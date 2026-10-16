ALTER TABLE entries ADD quote_number text;
--> statement-breakpoint
WITH RECURSIVE quoting(id,owner) AS (
 SELECT id,owner FROM entries WHERE kind='folder' AND parent IS NULL AND COALESCE(job_category,'quoting')='quoting'
 UNION ALL SELECT e.id,q.owner FROM entries e JOIN quoting q ON e.parent=q.id AND e.owner=q.owner
)
UPDATE entries SET quote_number=po_number WHERE kind='item' AND id IN (SELECT id FROM quoting) AND quote_number IS NULL;
