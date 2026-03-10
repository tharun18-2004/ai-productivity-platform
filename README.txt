AI Productivity SaaS Platform (Free Stack)

Frontend:
Next.js + React

Backend:
Node.js + Express

AI:
HuggingFace free models

Local setup:

1. Install Node.js

2. Configure frontend env
Copy frontend/.env.example to frontend/.env.local and set:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY

3. Apply the Supabase schema
Run frontend/supabase/schema.sql in the Supabase SQL editor.

4. Start Backend
cd backend
npm install
node server.js

5. Start Frontend
cd frontend
npm install
npm run verify:env
npm run dev

6. Open browser
http://localhost:3000

Features included:
- Note editor
- AI summarization
- Full stack architecture
- Workspace collaboration
- Member invites and role management
- Shared tasks, notes, notifications, and activity feed

Useful verification commands:
- npm run smoke:core
- npm run smoke:ai
- set SMOKE_EMAIL=you@example.com && npm run smoke:workspace
- set SMOKE_OWNER_EMAIL=owner@example.com && set SMOKE_MEMBER_EMAIL=member@example.com && npm run smoke:permissions
- set SMOKE_OWNER_EMAIL=owner@example.com && set SMOKE_ADMIN_EMAIL=admin@example.com && npm run smoke:permissions
- set SMOKE_OWNER_EMAIL=owner@example.com && npm run smoke:isolation
- set SMOKE_OWNER_EMAIL=owner@example.com && set SMOKE_INVITE_EMAIL=invitee@example.com && npm run smoke:members
- add SMOKE_SUPABASE_TOKEN=<supabase_access_token> to run smokes against a deployed site that requires Authorization headers

Production notes:
- Rotate exposed secrets immediately if any key was shared or pasted during testing.
- Keep NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY valid for the deployed frontend.
- Keep SUPABASE_SERVICE_ROLE_KEY server-only and never expose it in browser code.
- Restart Next.js after any .env.local change.
- Run npm run build in frontend before deployment.
