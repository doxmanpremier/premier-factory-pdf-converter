# Premier Convertor/PM Tool

This is the existing converter Site (`appgprj_6a7c730956688191ba833b2946c8f969`), with Project Management at `/pm`. The converter's existing signed username/password cookie protects both tools. Preserve the existing environment secrets and Site URL. Static assets must run through the Worker first (`assets.run_worker_first=true`, binding `ASSETS`); all requests are authenticated before PM data or assets are served.

The converter's original `projects` table and migration history remain intact. Migration 0005 creates `entries` and `pm_meta`; R2 binding `BUCKET` stores PM uploads. Worker PM APIs are `/api/pm/entries` and `/api/pm/file`. PM records belong to the shared converter login workspace. On the first authenticated PM data request, a transaction imports the retained optional transfer records and sets an import marker. This initialization never overwrites existing records or reimports deleted ones. The original Project Desk Site remains intact as a retained copy; use the combined Site for ongoing changes.

The React PM source is `pm/`, bundled by `scripts/build-pm.mjs` during the production build. Generated `public/pm.html` and bundle files are ignored. Build dependencies and original converter parsing are retained, with portable Node build scripts and a compatible Vinext version for this Windows workspace.

Equipment includes shop drawing requirement (Yes/No/Not set), PO number, checkbox selection, filtered selection, bulk status/PO assignment, and dated bulk notes. Item note forms can apply the same update to every item with the same PO in that project folder. Updates preserve notes, files, statuses, and item IDs. Filters cover status, open items, attention, required drawings, missing PO, overdue tasks, and text including PO number.

Validation: TypeScript check; 34 passing tests covering converter extraction/totals/pagination/login and PM transfer, bulk updates, PO/drawing preservation, shared notes, and auth/origin protection. Isolated local browser QA confirmed one login, navigation from converter to PM, all nine transferred equipment items, bulk changes for items 1–5 and shared notes visible inside items 1 and 5. No test records were written to production.

Public repository exports omit production records and runtime credentials. `worker/pm-transfer.json` intentionally contains an empty list. The PM test suite uses synthetic records; live projects are stored in D1 and documents in R2.
