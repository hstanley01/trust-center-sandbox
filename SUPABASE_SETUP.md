# Supabase Setup Guide

## Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create an account
2. Click **"New Project"**
3. Fill in:
   - **Name**: `trust-center` (or your preferred name)
   - **Database Password**: Generate and save a strong password
   - **Region**: Choose the closest region to you
   - **Plan**: Free tier works fine
4. Click **"Create new project"** and wait ~2 minutes

## Step 2: Run Database Migrations

### Option A: Run in Supabase SQL Editor (Recommended)

1. In your Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click **"New Query"**
3. Copy and paste the contents of each migration file **in order**:

```
supabase/migrations/000_auth_schema.sql
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_rls_policies.sql
supabase/migrations/003_storage_buckets.sql
supabase/migrations/004_seed_data.sql
supabase/migrations/005_user_management.sql
supabase/migrations/006_organization_status.sql
supabase/migrations/007_ticket_messages.sql
supabase/migrations/008_activity_logs.sql
supabase/migrations/009_branding_settings.sql
supabase/migrations/010_subprocessors.sql
supabase/migrations/011_ticket_priority.sql
supabase/migrations/012_request_expiration.sql
supabase/migrations/013_nda_url.sql
supabase/migrations/014_knowledge_base.sql
supabase/migrations/015_nda_clickwrap.sql
supabase/migrations/016_outbound_webhooks.sql
supabase/migrations/017_controls_schema.sql
supabase/migrations/018_seed_plaid_categories.sql
supabase/migrations/019_add_category_banner.sql
supabase/migrations/019_update_documents_nda.sql
supabase/migrations/020_category_visibility.sql
supabase/migrations/021_admin_nav_order.sql
```

4. Run each file by clicking **"Run"** (or press Cmd/Ctrl + Enter)
5. Continue until all migrations are complete

### Option B: Use Supabase CLI (Advanced)

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Push migrations
supabase db push
```

## Step 3: Create Storage Bucket

1. Go to **Storage** in the left sidebar
2. Click **"Create a new bucket"**
3. Settings:
   - **Name**: `documents`
   - **Public**: **Unchecked** (private bucket)
   - **File size limit**: 50 MB (or your preference)
4. Click **"Create bucket"**

### Set Storage Policies

After creating the bucket, you need to add storage policies:

1. Click on the `documents` bucket
2. Go to **Policies** tab
3. Click **"New Policy"**

**Policy 1: Allow authenticated uploads**
```sql
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents');
```

**Policy 2: Allow authenticated reads**
```sql
CREATE POLICY "Allow authenticated reads"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'documents');
```

**Policy 3: Allow public reads for approved documents**
```sql
CREATE POLICY "Allow public reads with valid token"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'documents');
```

## Step 4: Get Your API Credentials

1. Go to **Settings** → **API** in your Supabase dashboard
2. You'll need these values:

```
Project URL: https://xxxxx.supabase.co
anon public key: eyJhbGci...
service_role key: eyJhbGci... (keep this secret!)
```

## Step 5: Add Environment Variables to v0

In the v0 UI:

1. Click **"Vars"** in the left sidebar
2. Add these environment variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
EMAIL_PROVIDER=resend
RESEND_API_KEY=your-resend-key (optional - for email)
```

## Step 6: Create Your First Admin User

1. Go to **Authentication** → **Users** in Supabase
2. Click **"Add user"** → **"Create new user"**
3. Fill in:
   - **Email**: your-email@example.com
   - **Password**: Create a strong password
   - **Auto Confirm User**: Check this box
4. Click **"Create user"**

This user will be able to log in to the `/admin/login` page.

## Step 7: Test Your Setup

1. The preview should now work in v0
2. Visit `/admin/login` to log in with your admin credentials
3. You should be able to access the admin dashboard

## Optional: Email Setup (For Magic Links)

To enable email functionality (document request notifications, magic links):

### Option 1: Resend (Recommended)

1. Sign up at [resend.com](https://resend.com) (free tier: 3,000 emails/month)
2. Verify your email domain
3. Get your API key
4. Add to v0 environment variables:
   ```
   EMAIL_PROVIDER=resend
   RESEND_API_KEY=re_xxxxx
   ```

### Option 2: SendGrid

1. Sign up at [sendgrid.com](https://sendgrid.com)
2. Get your API key
3. Add to v0:
   ```
   EMAIL_PROVIDER=sendgrid
   SENDGRID_API_KEY=SG.xxxxx
   ```

### Option 3: Custom SMTP

```
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-username
SMTP_PASSWORD=your-password
SMTP_FROM=noreply@yourdomain.com
```

## Troubleshooting

### "Invalid API key" errors
- Double-check your environment variables
- Make sure you're using the `anon` key for `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Make sure you're using the `service_role` key for `SUPABASE_SERVICE_KEY`

### "Table does not exist" errors
- Make sure all migrations ran successfully
- Check the SQL Editor for any error messages
- Verify tables exist in the Table Editor

### Storage upload failures
- Make sure the `documents` bucket exists
- Verify storage policies are in place
- Check that bucket is private (not public)

### Can't log in as admin
- Make sure you created a user in Supabase Auth
- Verify the user's email is confirmed
- Check that the password is correct

## Next Steps

Once everything is set up:

1. Log in to `/admin/login`
2. Configure your trust center settings in Admin → Settings
3. Add document categories
4. Upload your first security document
5. Test the document request flow

For more details, see the main [README.md](README.md) and [MIGRATION.md](MIGRATION.md).
