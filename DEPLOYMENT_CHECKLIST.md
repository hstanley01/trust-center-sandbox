# Deployment Checklist

Use this checklist to track your progress through either deployment option.

---

## Pre-Deployment Verification

Before you start, confirm you have everything:

```
PREREQUISITES
─────────────────────────────────────────────────────

[ ] GitHub repository connected and ready to push
[ ] Supabase project created with database configured
[ ] Environment variables documented (you said these are set):
    [ ] NEXT_PUBLIC_SUPABASE_URL
    [ ] NEXT_PUBLIC_SUPABASE_ANON_KEY
    [ ] SUPABASE_SERVICE_KEY
    [ ] EMAIL_PROVIDER (resend/sendgrid/smtp)
    [ ] EMAIL_PROVIDER_API_KEY (RESEND_API_KEY, SENDGRID_API_KEY, or SMTP credentials)

[ ] Vercel account ready
[ ] Railway account ready (for Option A only)
[ ] Text editor / IDE ready
[ ] Terminal/command line access ready

─────────────────────────────────────────────────────
Status: ⭕ Ready to proceed
```

---

## OPTION A: Hybrid Deployment (15 minutes)

### Step 1: Deploy Backend to Railway

```
RAILWAY BACKEND DEPLOYMENT
─────────────────────────────────────────────────────

Pre-Step:
[ ] Install Railway CLI: npm install -g @railway/cli
[ ] Login to Railway: railway login

Step 1.1: Initialize Railway Project
[ ] cd backend/
[ ] railway init
[ ] Choose "Create new project"
[ ] Name it "trust-center-backend"
[ ] Select region closest to you

Step 1.2: Configure Environment Variables
[ ] railway link (if not already linked)
[ ] In Railway dashboard → Variables tab, add:
    [ ] SUPABASE_URL=https://xxx.supabase.co
    [ ] SUPABASE_SERVICE_KEY=eyJ...
    [ ] EMAIL_PROVIDER=resend
    [ ] RESEND_API_KEY=re_...
    [ ] FRONTEND_URL=https://placeholder.vercel.app (update later)
    [ ] NODE_ENV=production

Step 1.3: Deploy Backend
[ ] railway up
[ ] Wait for deployment to complete
[ ] Check for errors in deployment logs

Step 1.4: Get Backend URL
[ ] Go to Railway dashboard → Deployments
[ ] Click on the latest deployment
[ ] Find the URL (e.g., https://backend-xxxx.railway.app)
[ ] Copy this URL - you'll need it next

Step 1.5: Verify Backend is Running
[ ] curl https://your-railway-backend.railway.app/health
[ ] Should return: {"status":"ok","timestamp":"..."}
[ ] ✅ Backend is running

─────────────────────────────────────────────────────
Checkpoint: ⭕ Backend deployed and verified
Store: Railway URL = ________________
```

### Step 2: Update Frontend Configuration

```
FRONTEND CONFIG UPDATE
─────────────────────────────────────────────────────

Step 2.1: Update API Client
[ ] Open: frontend/src/lib/api.ts
[ ] Find: const getApiUrl = () => { return ''; }
[ ] Change to:
    const getApiUrl = () => {
      return process.env.NEXT_PUBLIC_API_URL || '';
    };
[ ] Save file

Step 2.2: Commit Changes
[ ] git add frontend/src/lib/api.ts
[ ] git commit -m "Configure for Railway backend deployment"
[ ] git push origin main

─────────────────────────────────────────────────────
Checkpoint: ⭕ Frontend updated and pushed
```

### Step 3: Deploy Frontend to Vercel

```
VERCEL FRONTEND DEPLOYMENT
─────────────────────────────────────────────────────

Step 3.1: Connect to Vercel
[ ] Go to https://vercel.com
[ ] Click "Add New" → "Project"
[ ] Select your GitHub repository
[ ] Click "Import"

Step 3.2: Configure Build Settings
[ ] Root Directory: Set to "frontend"
[ ] Framework: Should be "Next.js" (auto-detected)
[ ] Build Command: npm run build
[ ] Install Command: npm install

Step 3.3: Add Environment Variables
[ ] NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
[ ] NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
[ ] SUPABASE_SERVICE_KEY=eyJ...
[ ] NEXT_PUBLIC_API_URL=https://your-railway-backend.railway.app
[ ] EMAIL_PROVIDER=resend
[ ] RESEND_API_KEY=re_...

Step 3.4: Deploy
[ ] Click "Deploy"
[ ] Wait for build to complete (~3-5 minutes)
[ ] Look for green checkmark indicating successful deployment
[ ] Note your Vercel URL (e.g., https://trust-center.vercel.app)

─────────────────────────────────────────────────────
Checkpoint: ⭕ Frontend deployed
Store: Vercel URL = ________________
```

### Step 4: Update Backend CORS Settings

```
RAILWAY BACKEND CORS UPDATE
─────────────────────────────────────────────────────

Step 4.1: Update Environment Variables
[ ] Go to Railway dashboard → your project
[ ] Click Variables tab
[ ] Update FRONTEND_URL to your Vercel URL:
    FRONTEND_URL=https://your-vercel-url.vercel.app
[ ] Save

Step 4.2: Redeploy Backend
[ ] Railway dashboard → Deployments
[ ] Click the three dots on latest deployment
[ ] Select "Redeploy"
[ ] Wait for redeploy to complete (~1-2 minutes)
[ ] Look for green checkmark

─────────────────────────────────────────────────────
Checkpoint: ⭕ CORS updated
```

### Step 5: Verification Testing

```
VERIFICATION TESTING
─────────────────────────────────────────────────────

Step 5.1: Frontend Loads
[ ] Open your Vercel URL in browser
[ ] Homepage should load without errors
[ ] Check DevTools Console (F12) - no red errors
[ ] Check DevTools Network tab - requests should complete

Step 5.2: API Responses
[ ] Open DevTools → Network tab
[ ] Refresh page
[ ] Look for GET requests to /api/...
[ ] Each should show:
    [ ] Status: 200 (green)
    [ ] Response: Valid JSON data

Step 5.3: Specific API Checks
[ ] GET /api/settings → Should return settings object
[ ] GET /api/documents → Should return array of documents
[ ] GET /api/certifications → Should return certifications
[ ] GET /api/security-updates → Should return updates

Step 5.4: Homepage Content
[ ] Trust Center title visible
[ ] Hero section loads
[ ] Trust stats display (number of docs, etc.)
[ ] Document categories show
[ ] Recent documents appear
[ ] Security controls visible

Step 5.5: Admin Section
[ ] Navigate to /admin/login
[ ] Login form renders without errors
[ ] Try entering test email
[ ] Check browser console for errors

Step 5.6: Check Vercel Logs
[ ] Vercel dashboard → your project → Logs
[ ] Should see:
    [ ] Build completed successfully
    [ ] No error messages (red text)
    [ ] Application running on port 3000

─────────────────────────────────────────────────────
Checkpoint: ⭕ Everything verified
```

### Step 6: Troubleshooting (if needed)

```
TROUBLESHOOTING
─────────────────────────────────────────────────────

Issue: Frontend shows blank page
[ ] Check DevTools Console for JavaScript errors
[ ] Check DevTools Network for failed requests
[ ] Check Vercel logs for build errors
[ ] Verify NEXT_PUBLIC_API_URL is set to Railway URL

Issue: "Cannot connect to database"
[ ] Check SUPABASE_SERVICE_KEY in Vercel env vars
[ ] Check SUPABASE_SERVICE_KEY in Railway env vars
[ ] Verify keys match between services
[ ] Redeploy if changed

Issue: "CORS error"
[ ] Check FRONTEND_URL in Railway is set to Vercel URL
[ ] Make sure Railway has been redeployed after update
[ ] Wait 2-3 minutes for changes to propagate
[ ] Test with: curl -i https://railway-backend/health

Issue: "API returns 500 error"
[ ] Check Railway logs for error details
[ ] Verify database connection
[ ] Check email provider configuration
[ ] Look for missing environment variables

Issue: Magic link not working
[ ] Check RESEND_API_KEY is set in Vercel
[ ] Check EMAIL_PROVIDER=resend in Vercel
[ ] Test email delivery manually
[ ] Check Vercel and Railway logs

─────────────────────────────────────────────────────
Status: ⭕ Issues identified and fixed
```

---

## OPTION B: Unified Next.js Deployment (5-7 hours)

### Phase 1: Scaffolding (30 minutes)

```
PHASE 1: SCAFFOLDING
─────────────────────────────────────────────────────

[ ] Create directory structure:
    [ ] mkdir -p frontend/src/app/api/admin
    [ ] mkdir -p frontend/src/app/api/auth
    [ ] mkdir -p frontend/src/app/api/documents
    [ ] mkdir -p frontend/src/app/api/certifications
    [ ] mkdir -p frontend/src/app/api/security-updates
    [ ] mkdir -p frontend/src/app/api/access
    [ ] mkdir -p frontend/src/app/api/contact

[ ] Create health check route:
    [ ] frontend/src/app/api/health/route.ts

[ ] Test locally:
    [ ] npm run dev --prefix frontend
    [ ] curl http://localhost:3000/api/health
    [ ] Verify response: {"status":"ok","timestamp":"..."}

─────────────────────────────────────────────────────
Checkpoint: ⭕ Scaffolding complete
```

### Phase 2: Public Routes (1-2 hours)

```
PHASE 2: PUBLIC ROUTES (NO AUTH REQUIRED)
─────────────────────────────────────────────────────

[ ] Create /api/settings/route.ts
    [ ] GET: Returns trust center settings
    [ ] Test: curl http://localhost:3000/api/settings

[ ] Create /api/documents/route.ts
    [ ] GET: Returns all documents
    [ ] POST: Creates document (admin only)
    [ ] Test both methods

[ ] Create /api/documents/[id]/route.ts
    [ ] GET: Returns single document
    [ ] PATCH: Updates document (admin only)
    [ ] DELETE: Deletes document (admin only)

[ ] Create /api/document-categories/route.ts
    [ ] GET: Returns categories

[ ] Create /api/certifications/route.ts
    [ ] GET: Returns certifications
    [ ] POST: Creates certification (admin only)

[ ] Create /api/security-updates/route.ts
    [ ] GET: Returns security updates
    [ ] POST: Creates update (admin only)

[ ] Create /api/contact/route.ts
    [ ] POST: Handles contact form submissions

[ ] Create /api/document-requests/route.ts
    [ ] GET: Returns document requests
    [ ] POST: Creates new request

[ ] Test all routes locally:
    [ ] All GET requests return 200 with data
    [ ] No JavaScript errors
    [ ] Database queries working

─────────────────────────────────────────────────────
Checkpoint: ⭕ Public routes complete and tested
```

### Phase 3: Authentication (45 minutes)

```
PHASE 3: AUTHENTICATION
─────────────────────────────────────────────────────

[ ] Create auth middleware: frontend/src/lib/auth.ts
    [ ] verifyAuth function implemented
    [ ] withAuth wrapper implemented
    [ ] JWT verification working

[ ] Create /api/auth/login/route.ts
    [ ] POST: Admin login with email/password
    [ ] Returns JWT token
    [ ] Validates admin user exists
    [ ] Test: Login flow works

[ ] Create /api/auth/signup/route.ts
    [ ] POST: Admin signup (initial setup only)
    [ ] Creates first admin user
    [ ] Returns JWT token

[ ] Test authentication:
    [ ] Login returns valid JWT token
    [ ] Token format is correct
    [ ] Expired tokens are rejected

─────────────────────────────────────────────────────
Checkpoint: ⭕ Authentication implemented and tested
```

### Phase 4: Admin Routes (1-2 hours)

```
PHASE 4: ADMIN ROUTES (AUTH REQUIRED)
─────────────────────────────────────────────────────

[ ] Create /api/admin/requests/route.ts
    [ ] GET: List all document requests
    [ ] Requires authentication

[ ] Create /api/admin/requests/[id]/approve/route.ts
    [ ] PATCH: Approve request
    [ ] Requires authentication

[ ] Create /api/admin/requests/[id]/deny/route.ts
    [ ] PATCH: Deny request
    [ ] Requires authentication

[ ] Create /api/admin/documents/route.ts
    [ ] POST: Upload new document
    [ ] Handles file uploads to Supabase Storage
    [ ] Requires authentication

[ ] Create /api/admin/documents/[id]/route.ts
    [ ] PATCH: Update document
    [ ] DELETE: Delete document
    [ ] Requires authentication

[ ] Create /api/admin/certifications/route.ts
    [ ] POST: Create certification
    [ ] Requires authentication

[ ] Create /api/admin/certifications/[id]/route.ts
    [ ] PATCH: Update certification
    [ ] DELETE: Delete certification
    [ ] Requires authentication

[ ] Create /api/admin/settings/route.ts
    [ ] PATCH: Update trust center settings
    [ ] Requires authentication

[ ] Create /api/admin/security-updates/route.ts
    [ ] POST: Create security update
    [ ] DELETE specific update

[ ] Test admin routes:
    [ ] Requests without token return 401
    [ ] Requests with token succeed
    [ ] File uploads work
    [ ] All CRUD operations work

─────────────────────────────────────────────────────
Checkpoint: ⭕ Admin routes complete and tested
```

### Phase 5: Special Routes (30 minutes)

```
PHASE 5: SPECIAL ROUTES (MAGIC LINKS, ACCESS)
─────────────────────────────────────────────────────

[ ] Create /api/access/[token]/route.ts
    [ ] GET: Validate magic link token
    [ ] Check token expiry
    [ ] Return approved documents

[ ] Create /api/access/[token]/download/[docId]/route.ts
    [ ] GET: Download document via magic link
    [ ] Verify token before allowing download
    [ ] Return signed URL for Supabase Storage

[ ] Create /api/access/[token]/accept-nda/route.ts
    [ ] POST: Accept NDA via magic link
    [ ] Mark in database as accepted

[ ] Test special routes:
    [ ] Valid tokens return data
    [ ] Invalid tokens return 401
    [ ] Expired tokens rejected
    [ ] Downloads work correctly

─────────────────────────────────────────────────────
Checkpoint: ⭕ Special routes complete and tested
```

### Phase 6: Comprehensive Testing (1 hour)

```
PHASE 6: COMPREHENSIVE TESTING
─────────────────────────────────────────────────────

Frontend Rendering Tests:
[ ] Homepage loads
[ ] No JavaScript errors in console
[ ] All data sections visible
[ ] Images load correctly
[ ] Responsive design works (mobile/tablet/desktop)

API Route Tests:
[ ] GET /api/settings returns 200
[ ] GET /api/documents returns 200
[ ] GET /api/certifications returns 200
[ ] GET /api/security-updates returns 200
[ ] POST /api/contact works
[ ] All routes have proper error handling

Authentication Flow:
[ ] Admin login page renders
[ ] Login with email/password works
[ ] JWT token received
[ ] Token stored in cookies/storage
[ ] Protected routes accessible with token
[ ] 401 error without token

Admin Operations:
[ ] Document upload works
[ ] Document appears in list
[ ] Document can be updated
[ ] Document can be deleted
[ ] Certifications can be CRUD'd
[ ] Settings can be updated

Magic Link Flow:
[ ] Document request form works
[ ] Email sent successfully
[ ] Magic link in email is valid
[ ] Accessing magic link shows documents
[ ] Document can be downloaded via link
[ ] Link expires after time limit

Error Handling:
[ ] 404 errors handled gracefully
[ ] 500 errors show useful messages
[ ] Database errors caught
[ ] Missing data handled
[ ] Invalid requests rejected

Performance:
[ ] Pages load in < 3 seconds
[ ] API calls return in < 1 second
[ ] No memory leaks
[ ] Smooth interactions

─────────────────────────────────────────────────────
Checkpoint: ⭕ All tests pass
```

### Phase 7: Deploy to Vercel (30 minutes)

```
PHASE 7: VERCEL DEPLOYMENT
─────────────────────────────────────────────────────

[ ] Verify git status clean:
    [ ] git status (should show clean working directory)
    [ ] All changes committed
    [ ] Ready to push

[ ] Vercel import and deployment:
    [ ] Go to https://vercel.com
    [ ] Click "Add New" → "Project"
    [ ] Select repository
    [ ] Set root to "frontend"
    [ ] Add environment variables:
        [ ] NEXT_PUBLIC_SUPABASE_URL
        [ ] NEXT_PUBLIC_SUPABASE_ANON_KEY
        [ ] SUPABASE_SERVICE_KEY
        [ ] EMAIL_PROVIDER
        [ ] RESEND_API_KEY (or other email provider)
    [ ] Click "Deploy"
    [ ] Wait for build (~3-5 minutes)

[ ] Verify deployment:
    [ ] Build completed successfully
    [ ] No build errors
    [ ] Vercel assigns URL
    [ ] Frontend accessible at URL

[ ] Post-deployment testing:
    [ ] Homepage loads
    [ ] API routes responsive
    [ ] Admin login works
    [ ] Email works
    [ ] All features functional

[ ] Check Vercel Logs:
    [ ] No error messages
    [ ] All requests logged
    [ ] No cold start issues

─────────────────────────────────────────────────────
Checkpoint: ⭕ Deployed to Vercel and verified
```

### Phase 8: Cleanup (Optional)

```
PHASE 8: CLEANUP
─────────────────────────────────────────────────────

[ ] Remove /backend/ directory (optional, can keep as reference)
    [ ] git rm -r backend/
    [ ] git commit -m "Remove legacy Express backend"
    [ ] git push

[ ] Update README.md:
    [ ] Remove Docker Compose instructions
    [ ] Remove /backend/ references
    [ ] Update deployment instructions for Vercel only

[ ] Remove unused dependencies from frontend/package.json:
    [ ] express (not needed - Next.js API routes)
    [ ] cors (not needed - handled in routes)
    [ ] Keep: multer, email providers, utilities

[ ] Update documentation:
    [ ] Remove backend references
    [ ] Add API route documentation
    [ ] Update troubleshooting section

─────────────────────────────────────────────────────
Status: ⭕ Project cleaned up (optional)
```

---

## Post-Deployment

### Both Options: Success Verification

```
FINAL VERIFICATION
─────────────────────────────────────────────────────

[ ] Application is live and accessible
[ ] All pages load without errors
[ ] API routes responding correctly
[ ] Authentication working
[ ] Email notifications sending
[ ] Database operations functioning
[ ] File uploads/downloads working
[ ] No console errors in browser
[ ] No server errors in logs
[ ] Mobile responsive design working
[ ] Performance acceptable (< 3s page load)

─────────────────────────────────────────────────────
Status: ✅ DEPLOYMENT COMPLETE
```

### Documentation & Knowledge Transfer

```
POST-DEPLOYMENT TASKS
─────────────────────────────────────────────────────

[ ] Create deployment runbook:
    [ ] How to access admin dashboard
    [ ] How to create admin users
    [ ] How to upload documents
    [ ] Emergency rollback procedures

[ ] Monitor application:
    [ ] Set up error notifications
    [ ] Monitor uptime
    [ ] Track performance metrics
    [ ] Review logs regularly

[ ] Plan maintenance:
    [ ] Backup database schedule
    [ ] Update dependencies
    [ ] Security patches
    [ ] Performance optimization

[ ] Optional: Optimize for Option A users
    [ ] If using Option A, plan Option B migration
    [ ] Set timeline for full serverless move
    [ ] Document learnings

─────────────────────────────────────────────────────
Status: ⭕ Post-deployment complete
```

---

## Troubleshooting Quick Links

| Issue | Option A | Option B |
|-------|----------|----------|
| Blank page | Check logs | Check logs |
| DB connection | SUPABASE_SERVICE_KEY | SUPABASE_SERVICE_KEY |
| CORS error | Update FRONTEND_URL | CORS headers in routes |
| Magic link fails | Check RESEND_API_KEY | Check RESEND_API_KEY |
| Files not uploading | Railway logs | Check file route |
| Admin login broken | Railway backend status | Auth middleware |

---

## Final Status

Use this to mark your final status:

```
╔═══════════════════════════════════════╗
║   DEPLOYMENT STATUS TRACKER           ║
╠═══════════════════════════════════════╣
║ Option Chosen:    [ ] A  [ ] B        ║
║ Phase/Step:       _________ of _____  ║
║ Overall Progress: ___________  %      ║
║ Status:           [ ] In Progress     ║
║                   [ ] Complete        ║
║                   [ ] Deployed!  🚀   ║
╚═══════════════════════════════════════╝
```

---

**Good luck! You've got this! 🚀**
