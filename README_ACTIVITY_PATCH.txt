COSMOSKIN Activity Backend Patch

Files:
- functions/api/activity/index.js
- functions/api/notifications/index.js
- functions/api/notifications/mark-read.js
- functions/api/notifications/mark-all-read.js
- database/activity-notifications.sql

Install:
1. Copy files into the project root.
2. Run database/activity-notifications.sql in Supabase SQL Editor.
3. Deploy to Cloudflare Pages.
4. Test:
   /api/activity
   /api/notifications
   POST /api/notifications/mark-read
   POST /api/notifications/mark-all-read

Important:
- Requires SUPABASE_URL and SUPABASE_ANON_KEY env vars.
- Requests must include user auth token if your frontend does not already inject Authorization.
- account-api.js should attach Authorization: Bearer <access_token>.
