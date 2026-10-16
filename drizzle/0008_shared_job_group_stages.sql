-- Retain job-specific rows as historical records; new shared rows are category-scoped.
INSERT INTO entries (id,owner,kind,name,content,color,created,stage_scope)
SELECT id || '-shared-' || category,owner,kind,name,content,color,created,category
FROM (
 SELECT s.*,COALESCE(p.job_category,'quoting') AS category,
 ROW_NUMBER() OVER (PARTITION BY s.owner,COALESCE(p.job_category,'quoting'),COALESCE(NULLIF(s.content,''),s.name)
 ORDER BY CASE s.kind WHEN 'status' THEN 0 ELSE 1 END,s.created DESC,s.id DESC) AS preference
 FROM entries s JOIN entries p ON p.id=s.stage_scope AND p.owner=s.owner AND p.kind='folder' AND p.parent IS NULL
 WHERE s.kind IN ('status','status_removed')
) WHERE preference=1;
--> statement-breakpoint
WITH RECURSIVE jobs(id,root,owner,category) AS (
 SELECT id,id,owner,COALESCE(job_category,'quoting') FROM entries WHERE kind='folder' AND parent IS NULL
 UNION ALL SELECT e.id,j.root,j.owner,j.category FROM entries e JOIN jobs j ON e.parent=j.id AND e.owner=j.owner
), renamed AS (
 SELECT item.id,shared.name FROM entries item JOIN jobs j ON j.id=item.id
 JOIN entries old ON old.owner=item.owner AND old.stage_scope=j.root AND old.kind='status' AND old.name=item.stage
 JOIN entries shared ON shared.owner=item.owner AND shared.stage_scope=j.category AND shared.kind='status'
 AND COALESCE(NULLIF(shared.content,''),shared.name)=COALESCE(NULLIF(old.content,''),old.name)
 WHERE item.kind='item'
)
UPDATE entries SET stage=(SELECT name FROM renamed WHERE renamed.id=entries.id LIMIT 1)
WHERE id IN (SELECT id FROM renamed);
