# Backend to Next.js Migration Guide

## Overview

This Trust Center application has been migrated from a Docker-based dual-service architecture (Express backend + Next.js frontend) to a unified Next.js application deployable to Vercel.

## What Changed

### Architecture
- **Before**: Separate Express backend (port 4000) + Next.js frontend (port 3000)
- **After**: Single Next.js application with API routes

### File Storage
- **Before**: Local filesystem storage (`/app/uploads`)
- **After**: Supabase Storage bucket

### Deployment
- **Before**: Docker Compose with 3 services (frontend, backend, Supabase)
- **After**: Single Vercel deployment + Supabase cloud

## Migration Summary

### Phase 1: Dependencies
- Added backend dependencies to `frontend/package.json`:
  - `@sendgrid/mail`, `resend`, `nodemailer` (email)
  - `jsonwebtoken` (auth)
  - `csv-parse` (CSV processing)
  - `multer` (file uploads - for future admin features)
  - `openai` (AI features)

### Phase 2: Backend Code Migration
Moved all backend utilities and services to frontend:
- `backend/src/services/` → `frontend/src/lib/services/`
  - `emailService.ts` - Email abstraction layer
  - `webhookDispatcher.ts` - Webhook dispatch logic
- `backend/src/utils/` → `frontend/src/lib/utils/`
  - `activityLogger.ts` - Admin activity logging
  - `email.ts` - Email templates
  - `emailValidation.ts` - Email validation
  - `magicLink.ts` - Magic link generation
  - `organization.ts` - Organization utilities

### Phase 3: Public API Routes
Converted Express routes to Next.js API routes:
- `/api/settings` - Public trust center settings
- `/api/contact` - Contact form submissions
- `/api/certifications` - Certification listings
- `/api/security-updates` - Security update listings
- `/api/document-categories` - Document categories
- `/api/documents` - Document listings
- `/api/documents/[id]` - Single document
- `/api/documents/[id]/download` - Document download
- `/api/access/[token]` - Magic link validation
- `/api/access/[token]/accept-nda` - NDA acceptance

### Phase 4: Admin & Auth Routes
Created authentication and admin routes:
- `/api/auth/login` - Admin login
- `/api/auth/signup` - Admin signup
- `/api/document-requests` - Document request handling
- Created `frontend/src/lib/auth.ts` - Auth helper utilities

### Phase 5: Supabase Storage
Implemented file storage using Supabase:
- Created `frontend/src/lib/storage.ts` - Storage utilities
- Updated download routes to use Supabase Storage
- File operations: upload, download, delete, signed URLs

### Phase 6: Frontend Integration
Updated frontend to use local API routes:
- Modified `frontend/src/lib/api.ts` - Changed from external URL to relative paths
- All API calls now use `/api/...` instead of `http://localhost:4000/api/...`

## Environment Variables

### Required for Deployment

Create `frontend/.env.local` with these variables:

```bash
# Supabase (Required)
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_KEY=your-supabase-service-key

# Email Provider (Choose one)
EMAIL_PROVIDER=resend
RESEND_API_KEY=your-resend-api-key

# OR use SendGrid
# EMAIL_PROVIDER=sendgrid
# SENDGRID_API_KEY=your-sendgrid-api-key

# OR use SMTP
# EMAIL_PROVIDER=smtp
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_USER=your-smtp-user
# SMTP_PASSWORD=your-smtp-password
# SMTP_FROM=noreply@trustcenter.com

# Optional
OPENAI_API_KEY=your-openai-key
NODE_ENV=production
```

### Removed Variables
- `NEXT_PUBLIC_API_URL` - No longer needed (API is local)
- `API_URL` - No longer needed (API is local)
- `FRONTEND_URL` - No longer needed (single app)
- `UPLOADS_DIR` - Replaced by Supabase Storage
- `PORT` - Not needed for Vercel

## Supabase Storage Setup

1. Create a storage bucket named `documents` in your Supabase project
2. Set appropriate storage policies for access control
3. Bucket is used for all document uploads/downloads

## Deployment Instructions

### Deploy to Vercel

1. **Connect GitHub Repository**
   ```bash
   # Push your code to GitHub
   git add .
   git commit -m "Migrate to Next.js unified architecture"
   git push origin main
   ```

2. **Import to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "Import Project"
   - Select your GitHub repository
   - Set Root Directory to `frontend`

3. **Configure Environment Variables**
   - In Vercel dashboard, go to Settings → Environment Variables
   - Add all variables from `.env.local` (see above)

4. **Deploy**
   - Click "Deploy"
   - Vercel will build and deploy automatically

### Local Development (Without Docker)

1. **Install Dependencies**
   ```bash
   cd frontend
   npm install
   ```

2. **Setup Environment**
   ```bash
   cp ../.env.example .env.local
   # Edit .env.local with your values
   ```

3. **Run Development Server**
   ```bash
   npm run dev
   ```

4. **Access Application**
   - Frontend: http://localhost:3000
   - API Routes: http://localhost:3000/api/*

## What Still Needs Migration

### Admin CRUD Operations with File Uploads
The following admin operations need to be completed:
- `POST /api/documents` - Upload new document (with multer/file handling)
- `PATCH /api/documents/[id]` - Update document
- `DELETE /api/documents/[id]` - Delete document
- `PUT /api/documents/[id]/replace` - Replace document file
- Admin routes for certifications, security updates, categories (POST/PATCH/DELETE)

These require handling file uploads in Next.js API routes using multipart form data.

### Admin Panel Routes
Additional admin routes from `backend/src/routes/admin.ts`:
- Organization management
- Request approval/denial
- Activity logs
- Settings management
- Controls management

## Testing Checklist

### Public Routes
- [ ] Homepage loads
- [ ] Document listings display
- [ ] Certifications page works
- [ ] Security updates page works
- [ ] Contact form submits
- [ ] Public document downloads work

### Magic Link Flow
- [ ] Submit document request
- [ ] Receive email with magic link
- [ ] Access documents via magic link
- [ ] Download documents via magic link
- [ ] NDA acceptance works

### Admin Routes
- [ ] Admin login works
- [ ] Admin signup works (initial setup)
- [ ] Protected routes require authentication
- [ ] Activity logging works

### File Storage
- [ ] Documents upload to Supabase Storage
- [ ] Documents download from Supabase Storage
- [ ] File deletion works

## Rollback Plan

If issues arise, you can rollback to Docker:
1. Revert git changes: `git revert HEAD`
2. Use docker-compose: `docker-compose up`
3. Access old architecture at http://localhost:3000

## Benefits of Migration

1. **Simplified Deployment** - Single deployment instead of managing multiple services
2. **Cost Reduction** - No need for separate backend hosting
3. **Better Performance** - Serverless functions scale automatically
4. **Easier Development** - No Docker required for local development
5. **Built-in Features** - Vercel analytics, edge functions, instant rollbacks

## Known Issues

1. **File Uploads in Admin Panel** - Need to implement multipart form handling in Next.js API routes
2. **Email Attachments** - May have size limits on serverless functions (use download links instead)
3. **Cold Starts** - First request to API route may be slower (serverless)

## Support

For issues or questions about the migration:
- Check Vercel deployment logs
- Review Supabase logs for storage/database issues
- Check browser console for frontend errors
