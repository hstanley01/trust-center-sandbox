# Trust Center: Vercel + Supabase Deployment Analysis

## Executive Summary

This document explains the current architecture, what the repo assumes about its deployment environment, and what might break when deploying to Vercel + Supabase. The repo has been migrated from a dual-service Docker architecture to a unified Next.js application, but **the migration is incomplete** and the backend Express server is still required.

---

## 1. Current Architecture Overview

### What You Have Now

```
┌─────────────────────────────────────────────────────────────┐
│  The Repo Contains BOTH:                                    │
├─────────────────────────────────────────────────────────────┤
│ 1. FRONTEND (Next.js 15)                                    │
│    - Located: /frontend/                                    │
│    - Purpose: UI, public pages, admin dashboard             │
│    - Port: 3000                                             │
│                                                              │
│ 2. BACKEND (Express.js)                                     │
│    - Located: /backend/                                     │
│    - Purpose: API server (currently required)               │
│    - Port: 4000                                             │
│                                                              │
│ 3. DATABASE                                                  │
│    - Supabase PostgreSQL (cloud or local)                   │
│    - Manages: documents, users, requests, settings          │
│                                                              │
│ 4. STORAGE                                                   │
│    - Supabase Storage (for document files)                  │
│    - Bucket: "documents"                                    │
└─────────────────────────────────────────────────────────────┘
```

### Deployment Model Assumptions

The repo assumes:

1. **Multi-process architecture**: Both frontend AND backend must run together
2. **Local backend execution**: Backend runs on port 4000, frontend calls it on `http://localhost:4000`
3. **Persistent storage directory**: `/app/uploads` for file uploads (Docker)
4. **Docker as deployment method**: Docker Compose orchestrates all services
5. **Supabase local stack (optional)**: For development with Mailpit for email testing

---

## 2. Critical Blocker: Backend Express Server

### ⚠️ The Main Issue

**The backend Express server (`/backend/`) is STILL REQUIRED for Vercel deployment.**

The MIGRATION.md claims the app was migrated to "unified Next.js," but this is **incomplete**. Here's why:

```typescript
// frontend/src/lib/api.ts (line 7)
const getApiUrl = () => {
  return ''; // Empty string = relative URLs
};

// This means ALL API calls go to /api/...
// BUT the /api/ routes DON'T EXIST in the frontend yet
```

### Where Are the API Routes?

```
frontend/src/app/
├── page.tsx           ✅ Exists (homepage)
├── api/               ❌ NO API ROUTES HERE
│   ├── settings       ❌ Missing
│   ├── documents      ❌ Missing
│   ├── auth           ❌ Missing
│   └── admin          ❌ Missing
```

### What Actually Happens

1. Frontend tries to call `GET /api/settings`
2. Next.js looks for `app/api/settings/route.ts` → **NOT FOUND**
3. Next.js serves 404 error
4. Application breaks

### Current Workaround (Not Visible)

The repo still has the Express backend running:
```typescript
// backend/src/server.ts
app.get('/health', (req, res) => { ... });
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
// ... etc
```

If the backend is running on port 4000, and the frontend is configured to call it, everything works. But vercel.json suggests frontend-only deployment:

```json
{
  "installCommand": "npm install --prefix frontend",
  "buildCommand": "npm run build --prefix frontend",
  "devCommand": "npm run dev --prefix frontend",
  "outputDirectory": "frontend/.next"
}
```

This configuration **ignores the backend entirely**.

---

## 3. Architecture Decision Matrix

### Option A: Backend + Frontend (Current - Incomplete)

| Component | Location | Status | Deployment |
|-----------|----------|--------|------------|
| Express API | `/backend/` | ✅ Full implementation | **Needs separate deployment** |
| Next.js Frontend | `/frontend/` | ⚠️ Partial (no API routes) | Vercel |
| Supabase DB | Cloud | ✅ Ready | Managed |
| Storage | Supabase | ✅ Ready | Managed |

**Problem**: Backend must run somewhere. Vercel doesn't deploy `/backend/` with current config.

**Solutions**:
- Deploy backend to Railway, Render, or own server
- Manually copy backend routes into Next.js (invasive)
- Use Next.js serverless API routes to replace backend

---

### Option B: Unified Next.js (Intended - Not Done)

| Component | Location | Status | Deployment |
|-----------|----------|--------|------------|
| Next.js API Routes | `/frontend/src/app/api/` | ❌ Missing | Vercel |
| Next.js Frontend | `/frontend/` | ✅ Ready | Vercel |
| Supabase DB | Cloud | ✅ Ready | Managed |
| Storage | Supabase | ✅ Ready | Managed |

**Requirement**: All backend routes must be converted to Next.js API routes.

**Benefit**: Single Vercel deployment, serverless scaling.

---

## 4. Key Dependencies & Assumptions

### Backend Dependencies (Currently Required)

```json
{
  "@supabase/supabase-js": "^2.39.0",      // DB/Storage access
  "express": "^4.18.2",                    // HTTP server
  "cors": "^2.8.5",                        // CORS handling
  "@sendgrid/mail": "^8.1.6",              // Email provider
  "resend": "^3.5.0",                      // Email provider
  "nodemailer": "^6.9.7",                  // Email provider
  "jsonwebtoken": "^9.0.2",                // Auth tokens
  "csv-parse": "^6.1.0",                   // CSV processing
  "multer": "^1.4.5-lts.1",                // File uploads
  "openai": "^6.15.0"                      // AI features
}
```

### What Each Assumes

| Dependency | Assumes | Vercel Compatible? |
|------------|---------|-------------------|
| express | Long-running server on fixed port | ❌ No (serverless only) |
| multer | File system access at `/app/uploads` | ⚠️ Limited (ephemeral FS) |
| nodemailer | SMTP server connectivity | ✅ Yes |
| @supabase/supabase-js | Network access to Supabase | ✅ Yes |
| openai | Network access to OpenAI | ✅ Yes |
| jsonwebtoken | JWT signing/verification | ✅ Yes |

---

## 5. What Breaks on Vercel

### Issue 1: Express Server Can't Run

```
❌ Vercel executes ONLY:
   - npm install --prefix frontend
   - npm run build --prefix frontend
   - Starting Next.js server

✅ Vercel does NOT execute:
   - npm install --prefix backend
   - npm run build --prefix backend
   - Starting Express on port 4000
```

**Result**: Backend not deployed, all API calls fail.

### Issue 2: Frontend API Routes Don't Exist

```
Frontend code:
  const response = await fetch('/api/documents');

Vercel receives request:
  GET /api/documents

Next.js looks for:
  app/api/documents/route.ts ← ❌ DOESN'T EXIST

Vercel returns:
  404 Not Found
```

### Issue 3: File Uploads Assume Persistent Storage

```typescript
// backend/src/server.ts
const uploadsDir = process.env.UPLOADS_DIR || '/app/uploads';
app.use('/uploads', express.static(uploadsDir));
```

**Assumption**: Files persist at `/app/uploads`

**Vercel reality**: Serverless functions have ephemeral filesystems. Files deleted after function execution.

**Solution**: Supabase Storage (already implemented) - but backend still has fallback to local storage.

### Issue 4: CORS Assumes Localhost

```typescript
// backend/src/server.ts
cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
})
```

**Assumption**: Frontend runs on `http://localhost:3000`

**Vercel reality**: Frontend at `https://your-domain.vercel.app`

**Fix needed**: Set `FRONTEND_URL` env var in Vercel.

---

## 6. Supabase Integration Points

### What's Already Set Up ✅

```typescript
// Frontend can access Supabase
import { createClient } from '@supabase/ssr';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Backend can access Supabase (service role)
const supabase = createClient(supabaseUrl, supabaseServiceKey);
```

### Environment Variables Required

```bash
# REQUIRED - Frontend & Backend
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...

# REQUIRED - Backend only (service role)
SUPABASE_SERVICE_KEY=eyJ...

# OPTIONAL - Email configuration
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...

# OPTIONAL - AI features
OPENAI_API_KEY=sk-...
```

### What Works ✅

1. Database access (read/write)
2. Authentication (magic links)
3. Storage bucket access
4. RLS policies enforcement
5. Real-time subscriptions

### What Needs Configuration

1. Storage bucket named `documents`
2. RLS policies for public/admin access
3. Email provider credentials
4. CORS settings for Vercel domain

---

## 7. Email Service Architecture

### Current Setup

```typescript
// backend/src/services/emailService.ts
export function getEmailProvider() {
  const provider = process.env.EMAIL_PROVIDER || 'none';
  // Supports: 'resend', 'sendgrid', 'smtp', 'none'
  return provider;
}

export async function sendEmail(options: EmailOptions) {
  // Routes to appropriate provider
}
```

### Providers Supported

| Provider | Setup | Cost | Status |
|----------|-------|------|--------|
| Resend | `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` | Free (3k/mo) | ✅ Recommended |
| SendGrid | `EMAIL_PROVIDER=sendgrid` + `SENDGRID_API_KEY` | Free (100/day) | ✅ Works |
| SMTP | `EMAIL_PROVIDER=smtp` + host/user/pass | Self-hosted | ✅ Works |
| Nodemailer | Default if nothing set | N/A | ✅ Development |

### What Could Break

```javascript
// BREAKS on Vercel if using self-hosted SMTP
// because SMTP requires persistent TCP connections

// WORKS on Vercel
// Resend/SendGrid use HTTP APIs (request/response)
```

---

## 8. Complete Dependency Resolution Chart

```
┌─ MUST HAVE (Application won't start) ──────┐
│                                             │
│  ├─ @supabase/supabase-js                  │
│  ├─ @supabase/ssr (frontend)               │
│  ├─ next (Next.js framework)               │
│  └─ react (React)                          │
│                                             │
└─────────────────────────────────────────────┘

┌─ CONDITIONAL (Only if backend runs) ──────┐
│                                             │
│  ├─ express (backend API server)           │
│  ├─ cors (cross-origin requests)           │
│  ├─ multer (file uploads)                  │
│  └─ nodemailer (email)                     │
│                                             │
└─────────────────────────────────────────────┘

┌─ OPTIONAL (Features enhance) ─────────────┐
│                                             │
│  ├─ openai (AI document analysis)          │
│  ├─ resend (email API)                     │
│  ├─ @sendgrid/mail (email API)             │
│  └─ csv-parse (CSV import)                 │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 9. Step-by-Step Deployment Options

### Option A: Quick Fix (Keep Backend Separate)

```
Step 1: Deploy Backend
├─ Deploy /backend/ to Railway/Render/Heroku
├─ Note the backend URL (e.g., https://backend.railway.app)
└─ Should respond to: GET https://backend.railway.app/health

Step 2: Configure Frontend
├─ Set NEXT_PUBLIC_API_URL=https://backend.railway.app
├─ Update frontend/src/lib/api.ts to use this URL
└─ Build frontend

Step 3: Deploy Frontend
├─ Deploy /frontend/ to Vercel
├─ Set env vars in Vercel dashboard:
│  ├─ NEXT_PUBLIC_SUPABASE_URL
│  ├─ NEXT_PUBLIC_SUPABASE_ANON_KEY
│  ├─ SUPABASE_SERVICE_KEY
│  ├─ NEXT_PUBLIC_API_URL=https://backend.railway.app
│  └─ EMAIL_PROVIDER + email credentials
└─ Vercel deploys frontend

Result: Frontend → Vercel, Backend → Railway/Render
```

### Option B: True Unified (Recommended for Vercel)

```
Step 1: Create Next.js API Routes
├─ Convert backend Express routes to app/api/
├─ Each route becomes a file:
│  ├─ /backend/routes/documents.ts
│  └─ → /frontend/src/app/api/documents/route.ts
└─ Remove Express server code

Step 2: Update API Client
├─ frontend/src/lib/api.ts already expects /api/...
└─ No changes needed

Step 3: Deploy
├─ Deploy /frontend/ to Vercel (single deployment)
├─ Vercel automatically handles API routes
└─ No backend infrastructure needed

Result: Everything runs on Vercel
```

---

## 10. What Vercel Will & Won't Support

### ✅ WILL SUPPORT

| Feature | How | Status |
|---------|-----|--------|
| Next.js App Router | Native | ✅ |
| API Routes | `app/api/` | ✅ |
| Supabase Database | HTTP requests | ✅ |
| Supabase Storage | HTTP requests | ✅ |
| Environment Variables | Dashboard/CLI | ✅ |
| Middleware | `middleware.ts` | ✅ |
| Scheduled Functions | Cron Jobs | ✅ (Pro) |
| Email (HTTP APIs) | Resend/SendGrid | ✅ |
| JWT Auth | Node.js crypto | ✅ |
| Static File Serving | `public/` | ✅ |

### ❌ WON'T SUPPORT

| Feature | Why | Workaround |
|---------|-----|-----------|
| Express Server | Vercel is serverless only | Use Next.js API routes |
| Persistent FS | Functions are ephemeral | Use Supabase Storage |
| Long-running tasks | Max 60s execution | Use background jobs service |
| SMTP relay | TCP connections | Use HTTP email APIs |
| Multiple processes | Serverless model | Split into services |
| Port binding | No fixed ports | Use serverless routes |

---

## 11. Quick Decision Guide

### Which Option Should You Choose?

**Choose Option A (Backend Separate) if:**
- ✅ You want minimal code changes
- ✅ Backend has stateful operations
- ✅ You're comfortable managing multiple deployments
- ✅ Backend doesn't need to scale frequently

**Choose Option B (Unified Next.js) if:**
- ✅ You want single Vercel deployment
- ✅ You're willing to convert Express routes to Next.js
- ✅ You prefer serverless architecture
- ✅ Cost optimization is important
- ✅ You want automatic scaling

---

## 12. Migration Checklist for Option B

### Phase 1: Analysis (Done)
- [x] Identify all Express routes in `/backend/src/routes/`
- [x] Map to Next.js API route structure
- [x] Identify middleware and error handling

### Phase 2: Create API Routes
- [ ] Create `frontend/src/app/api/` directory structure
- [ ] Convert `/backend/routes/*.ts` → `/frontend/src/app/api/*/route.ts`
- [ ] Test each endpoint locally
- [ ] Remove backend dependencies from frontend/package.json

### Phase 3: Update Configuration
- [ ] Remove `/backend/` from vercel.json (only frontend)
- [ ] Update frontend/src/lib/api.ts (already using relative paths)
- [ ] Configure environment variables

### Phase 4: Test & Deploy
- [ ] Test locally: `npm run dev --prefix frontend`
- [ ] All API routes respond
- [ ] Database operations work
- [ ] Email sending works
- [ ] File uploads work
- [ ] Deploy to Vercel
- [ ] Test in production

---

## 13. Environment Variables Checklist

### For Vercel Dashboard

```bash
# Database (Required)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...

# Email Provider (Choose one - Required)
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...

# Deployment (Only if using Option A - Backend Separate)
NEXT_PUBLIC_API_URL=https://backend.railway.app

# Optional Features
OPENAI_API_KEY=sk-...
JWT_SECRET=your-secret-key

# Node Environment
NODE_ENV=production
```

---

## 14. Known Issues & Gotchas

### Issue 1: CORS on Same Origin
```javascript
// If frontend and backend on same Vercel deployment,
// CORS becomes unnecessary but sometimes causes issues
// Solution: Set origin to exact URL in production
```

### Issue 2: Cold Starts
```javascript
// First API call after deployment might be slow (5-15s)
// Subsequent calls are fast (< 500ms)
// This is normal serverless behavior
```

### Issue 3: File Upload Size Limits
```javascript
// Vercel: 4.5MB max request body
// Solution: Use Supabase Storage for large files
// Already implemented in the codebase
```

### Issue 4: Email Attachments
```javascript
// Email attachments on serverless are problematic
// Solution: Send download links instead of attachments
// Backend code attempts this but needs verification
```

### Issue 5: Database Connection Pooling
```javascript
// Vercel serverless can create many DB connections
// Solution: Supabase handles connection pooling automatically
// Already configured in the connection settings
```

---

## 15. Recommended Path Forward

### For Fastest Deployment (Option A):

1. Deploy `/backend/` to Railway (~5 min)
   ```bash
   railway link
   railway up
   ```

2. Get backend URL from Railway dashboard

3. Set env vars in Vercel dashboard:
   ```
   NEXT_PUBLIC_API_URL=https://your-railway-backend.com
   NEXT_PUBLIC_SUPABASE_URL=...
   SUPABASE_SERVICE_KEY=...
   RESEND_API_KEY=...
   ```

4. Deploy `/frontend/` to Vercel (~2 min)

5. Update `frontend/src/lib/api.ts`:
   ```typescript
   const getApiUrl = () => {
     return process.env.NEXT_PUBLIC_API_URL || '';
   };
   ```

6. Test all routes

### For Best Practice (Option B):

This requires code conversion but is the proper Vercel way.

---

## Conclusion

**The repo's migration to Vercel-ready architecture is incomplete.** The Express backend is still required but not deployed by the current Vercel configuration.

You must choose:
- **Option A**: Deploy backend separately (quick, hybrid)
- **Option B**: Convert to unified Next.js (proper, cleaner)

Both are viable. Option A gets you deployed in 10 minutes. Option B requires 2-4 hours of conversion work but results in cleaner architecture.
