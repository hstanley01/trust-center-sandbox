# Quick Setup Guide: Deploy Trust Center to Vercel + Supabase (Option A)

This guide gets your app running on Vercel with a separate backend in ~15 minutes.

---

## Prerequisites

- [ ] Supabase project created (cloud or local)
- [ ] GitHub repo ready
- [ ] Vercel account
- [ ] Railway account (for backend) OR another server provider

---

## Step 1: Deploy Backend to Railway (5 minutes)

### 1.1 Create Railway Project

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# From repo root, link backend
cd backend
railway init
```

### 1.2 Configure Railway Environment

In the Railway dashboard:

1. Go to your project
2. Click "Variables"
3. Add these variables:

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...your-service-key...
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...your-resend-key...
FRONTEND_URL=https://your-vercel-domain.vercel.app  # Will update later
NODE_ENV=production
```

### 1.3 Deploy Backend

```bash
railway up
```

### 1.4 Get Backend URL

In Railway dashboard:
- Go to Deployments
- Click on the deployment
- Find the URL (e.g., `https://backend-production-xxxx.railway.app`)
- **Save this URL** - you'll need it next

### 1.5 Verify Backend is Running

```bash
curl https://your-railway-backend-url/health
# Should return: {"status":"ok","timestamp":"2026-02-11T..."}
```

---

## Step 2: Prepare Frontend for Vercel (3 minutes)

### 2.1 Update API Client

Edit: `/frontend/src/lib/api.ts`

Change this:
```typescript
const getApiUrl = () => {
  return ''; // Empty string means relative URLs
};
```

To this:
```typescript
const getApiUrl = () => {
  // In production, use Railway backend URL
  if (typeof window === 'undefined') {
    // Server-side
    return process.env.NEXT_PUBLIC_API_URL || '';
  }
  // Client-side - use Railway backend
  return process.env.NEXT_PUBLIC_API_URL || '';
};
```

### 2.2 Update vercel.json

Edit: `/vercel.json`

Change:
```json
{
  "installCommand": "npm install --prefix frontend",
  "buildCommand": "npm run build --prefix frontend",
  "devCommand": "npm run dev --prefix frontend",
  "outputDirectory": "frontend/.next"
}
```

To:
```json
{
  "installCommand": "npm install --prefix frontend",
  "buildCommand": "npm run build --prefix frontend",
  "devCommand": "npm run dev --prefix frontend",
  "outputDirectory": "frontend/.next",
  "env": {
    "NEXT_PUBLIC_API_URL": {
      "description": "Railway backend URL"
    },
    "NEXT_PUBLIC_SUPABASE_URL": {
      "description": "Supabase project URL"
    },
    "NEXT_PUBLIC_SUPABASE_ANON_KEY": {
      "description": "Supabase anonymous key"
    },
    "SUPABASE_SERVICE_KEY": {
      "description": "Supabase service role key"
    }
  }
}
```

### 2.3 Commit Changes

```bash
git add frontend/src/lib/api.ts vercel.json
git commit -m "Configure frontend for Railway backend deployment"
git push origin main
```

---

## Step 3: Deploy Frontend to Vercel (3 minutes)

### 3.1 Connect GitHub to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New" → "Project"
3. Select your GitHub repository
4. Click "Import"

### 3.2 Configure Build Settings

1. **Root Directory**: Set to `frontend`
2. **Framework**: Next.js (should auto-detect)
3. **Build Command**: `npm run build`
4. **Install Command**: `npm install`
5. **Environment Variables**: Click "Add" and enter these:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
NEXT_PUBLIC_API_URL=https://your-railway-url.railway.app
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...
OPENAI_API_KEY=sk-... (optional)
NODE_ENV=production
```

### 3.3 Deploy

Click "Deploy" and wait ~3-5 minutes for build to complete.

**Get your Vercel URL** from the deployment (e.g., `https://trust-center.vercel.app`)

---

## Step 4: Update Backend CORS (1 minute)

Now that you have your Vercel URL, update Railway backend:

In Railway dashboard:

1. Go to Variables
2. Update `FRONTEND_URL`:
   ```
   FRONTEND_URL=https://trust-center.vercel.app
   ```
3. Redeploy backend: Click "Trigger Deploy"

---

## Step 5: Verify Everything Works (2 minutes)

### 5.1 Test Frontend

1. Open your Vercel URL
2. Should see the homepage loading
3. Check browser DevTools → Network tab
4. You should see API calls to `/api/...` returning data

### 5.2 Test Specific Routes

#### Homepage Should Show:
- [ ] Trust Center title/hero section
- [ ] Trust stats (number of documents, certifications, etc.)
- [ ] Document categories
- [ ] Recent documents

#### Check Network Requests:
- [ ] `GET /api/settings` → 200 with settings data
- [ ] `GET /api/documents` → 200 with document array
- [ ] `GET /api/certifications` → 200
- [ ] `GET /api/security-updates` → 200

### 5.3 Test Admin Login

1. Navigate to `/admin/login`
2. Try logging in with magic link
3. Check email for magic link
4. Should receive email via Resend

### 5.4 Test Document Request

1. On homepage, click "Request Access" on a document
2. Fill out form
3. Should show "Request submitted"
4. Admin should receive email notification

### 5.5 Check Vercel Logs

If something breaks, check Vercel logs:

1. Go to Vercel dashboard → your project
2. Click "Logs" tab
3. Look for errors (red text)
4. Common errors:
   - `Cannot connect to database` → Check SUPABASE_SERVICE_KEY
   - `CORS error` → Update FRONTEND_URL in Railway
   - `Email provider not configured` → Check RESEND_API_KEY
   - `Backend not responding` → Check Railway deployment status

---

## Step 6: Optional - Set Up Custom Domain

In Vercel dashboard:

1. Go to Settings → Domains
2. Add your custom domain
3. Follow DNS setup instructions
4. Update `FRONTEND_URL` in Railway backend to use your domain

---

## Troubleshooting

### Frontend Shows Blank Page

**Likely cause**: API call failing silently

**Debug**:
1. Open DevTools → Console
2. Look for JavaScript errors
3. Check Network tab for failed requests
4. Check Vercel logs

**Fix**:
```javascript
// Add to frontend/src/lib/api.ts for debugging
console.log("[v0] API URL:", getApiUrl());
```

### "Cannot connect to database"

**Cause**: `SUPABASE_SERVICE_KEY` missing or wrong

**Fix**:
1. Go to Vercel dashboard
2. Settings → Environment Variables
3. Verify `SUPABASE_SERVICE_KEY` is set
4. Redeploy: click "Redeploy" button

### "CORS error: Access-Control-Allow-Origin"

**Cause**: Railway backend doesn't know the Vercel URL

**Fix**:
1. Go to Railway dashboard
2. Variables tab
3. Update `FRONTEND_URL` to your Vercel URL
4. Redeploy backend
5. Wait 2-3 minutes for changes to take effect

### Magic Link Not Working

**Cause**: Email provider not configured

**Fix**:
1. Check Vercel variables for `RESEND_API_KEY`
2. Get API key from [resend.com](https://resend.com)
3. Update in Vercel dashboard
4. Redeploy

### Document Downloads Fail

**Cause**: Supabase Storage not configured

**Fix**:
1. Go to Supabase dashboard
2. Storage tab
3. Create bucket named `documents`
4. Set public access policy (if needed)

---

## File Structure After Deployment

```
Your Vercel Deployment:
├─ Frontend (Next.js)
│  └─ Runs at: https://your-app.vercel.app
│  └─ API Routes: /api/*
│  └─ Static Pages: /, /admin/login, /documents, etc.

Your Railway Deployment:
├─ Backend (Express)
│  └─ Runs at: https://backend-xxxx.railway.app
│  └─ API Routes: /api/* (mirrors frontend)
│  └─ Health: GET /health

Supabase (Cloud):
├─ Database: PostgreSQL
├─ Storage: Document files
├─ Auth: Magic links, admin auth
└─ Auth: API keys (anon + service)
```

---

## Next Steps

### Optional Improvements

1. **Add Custom Domain**
   - Update DNS to point to Vercel
   - Vercel auto-generates SSL certificate

2. **Enable Vercel Analytics**
   - Dashboard → Settings → Analytics
   - Track pageviews, performance

3. **Setup Email Templates**
   - In `/backend/src/utils/email.ts`
   - Customize magic link email design

4. **Configure Document Storage**
   - Upload initial documents via admin panel
   - Test document download flow

5. **Backup Plan**
   - Keep `/backend/` in case you need to rollback
   - Can always deploy without Vercel

### Cost Summary

| Service | Tier | Cost/Month |
|---------|------|-----------|
| Vercel | Hobby | Free |
| Railway | Pay-as-you-go | ~$5-10 (backend) |
| Supabase | Free | Free (+ $25/mo pro) |
| Resend | Free | Free (3,000 emails) |
| **Total** | | **~$5-10/month** |

---

## Success Checklist

- [ ] Backend deployed to Railway
- [ ] Frontend deployed to Vercel
- [ ] Both have correct environment variables
- [ ] Frontend homepage loads
- [ ] API calls return data (Network tab shows 200 responses)
- [ ] Magic link flow works (test email sends)
- [ ] Admin panel accessible
- [ ] Document downloads work
- [ ] No errors in Vercel logs or browser console

---

## Getting Help

1. **Check Vercel Logs**: Deployment → Logs
2. **Check Railway Logs**: Project → Deployments → click deployment
3. **Browser DevTools**: F12 → Console for errors
4. **Supabase Dashboard**: Check database and storage status

If stuck, enable verbose logging by adding to `frontend/src/lib/api.ts`:

```typescript
console.log("[v0] API Request:", endpoint, options);
```

Then redeploy and check Vercel logs.
