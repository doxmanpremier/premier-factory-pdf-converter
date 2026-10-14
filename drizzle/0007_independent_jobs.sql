ALTER TABLE entries ADD job_category text;
--> statement-breakpoint
ALTER TABLE entries ADD stage_scope text;
--> statement-breakpoint
INSERT INTO entries (id,owner,kind,name,content,color,created,stage_scope)
SELECT s.id || '-job-' || p.id,s.owner,s.kind,s.name,s.content,s.color,s.created,p.id
FROM entries s JOIN entries p ON p.owner=s.owner AND p.kind='folder' AND p.parent IS NULL
WHERE s.kind IN ('status','status_removed') AND s.stage_scope IS NULL;
