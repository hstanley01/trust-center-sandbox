# Option B: Complete Migration to Unified Next.js

This guide explains what needs to happen to convert the Express backend into Next.js API routes for true Vercel compatibility.

**Status**: ~60% complete in the repo. This guide finishes the job.

---

## Current State Analysis

### What's Already Done ✅

1. **Backend services migrated to frontend**:
   - Email service available in `frontend/src/lib/services/emailService.ts`
   - Utilities copied to `frontend/src/lib/utils/`
   - Supabase client available

2. **Frontend expects `/api/...` routes**:
   - `frontend/src/lib/api.ts` uses relative URLs
   - All API calls target `/api/endpoint`

3. **Environment variables ready**:
   - Supabase credentials available
   - Email provider credentials available

### What's Still Needed ❌

1. **Create API routes**:
   - `/app/api/settings/route.ts`
   - `/app/api/documents/route.ts`
   - `/app/api/certifications/route.ts`
   - ... and 15+ more

2. **Remove backend from vercel.json**:
   - Currently only builds frontend (correct)
   - Backend code not used

3. **Remove backend dependency from frontend package.json**:
   - Some packages duplicated
   - Clean up unnecessary packages

---

## Architecture: API Route Conversion

### Express Route → Next.js Route Mapping

**Express** (old):
```typescript
// backend/src/routes/documents.ts
router.get('/', async (req, res) => {
  const docs = await supabase.from('documents').select();
  res.json(docs);
});

router.post('/', async (req, res) => {
  // Create document
});
```

**Next.js** (new):
```typescript
// frontend/src/app/api/documents/route.ts
export async function GET(request: Request) {
  const docs = await supabase.from('documents').select();
  return Response.json(docs);
}

export async function POST(request: Request) {
  // Create document
}
```

### Conversion Pattern

```
backend/src/routes/            →  frontend/src/app/api/
├── documents.ts                →  ├── documents/
│   ├── GET /documents          │  │   └── route.ts → GET, POST
│   ├── POST /documents         │  │
│   ├── GET /documents/:id      │  └── documents/[id]/
│   ├── PATCH /documents/:id    │      └── route.ts → GET, PATCH, DELETE
│   └── DELETE /documents/:id   │
├── certifications.ts           →  ├── certifications/
│   ├── GET                     │  │   └── route.ts → GET, POST
│   └── POST                    │
├── admin.ts                    →  ├── admin/
│   ├── GET /admin/requests     │  │   ├── requests/route.ts
│   ├── PATCH /admin/requests   │  │   ├── settings/route.ts
│   └── PATCH /admin/settings   │  │   └── ...
└── ...
```

---

## Complete API Route Inventory

### Public Routes (No Auth Required)

```
GET  /api/settings                    → Trust center settings
GET  /api/documents                   → List all public documents
GET  /api/documents/[id]              → Get single document
GET  /api/document-categories         → Document categories
GET  /api/certifications              → Certifications
GET  /api/security-updates            → Security updates
GET  /api/controls                    → Security controls

POST /api/contact                     → Contact form
POST /api/document-requests           → Request document access
GET  /api/access/[token]              → Validate magic link
GET  /api/access/[token]/download/[id] → Download via magic link
```

### Admin Routes (Auth Required)

```
POST /api/auth/login                  → Admin login
POST /api/auth/signup                 → Admin signup

PATCH /api/admin/requests/[id]/approve     → Approve request
PATCH /api/admin/requests/[id]/deny        → Deny request

POST /api/admin/documents             → Upload document
PATCH /api/admin/documents/[id]       → Update document
DELETE /api/admin/documents/[id]      → Delete document

POST /api/admin/certifications        → Create certification
PATCH /api/admin/certifications/[id]  → Update certification
DELETE /api/admin/certifications/[id] → Delete certification

POST /api/admin/settings              → Update settings
POST /api/admin/security-updates      → Create update
DELETE /api/admin/security-updates/[id] → Delete update

GET /api/admin/activity-logs          → Admin activity logs
GET /api/organizations                → List organizations
```

---

## Step-by-Step Migration Plan

### Phase 1: Scaffolding (30 minutes)

#### 1.1 Create Directory Structure

```bash
mkdir -p frontend/src/app/api/{admin,access,documents/upload}
touch frontend/src/app/api/{health,settings}/route.ts
touch frontend/src/app/api/documents/route.ts
touch frontend/src/app/api/documents/\[id\]/route.ts
# ... create all directories
```

#### 1.2 Create Health Check Route

Create: `frontend/src/app/api/health/route.ts`

```typescript
export async function GET() {
  return Response.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString() 
  });
}
```

Test locally:
```bash
curl http://localhost:3000/api/health
```

### Phase 2: Public Routes (1-2 hours)

#### 2.1 Settings Route

Create: `frontend/src/app/api/settings/route.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('trust_center_settings')
      .select('*')
      .single();

    if (error) throw error;
    return Response.json(data || {});
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
```

#### 2.2 Documents Route

Create: `frontend/src/app/api/documents/route.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('category_id');

    let query = supabase
      .from('documents')
      .select('*')
      .eq('public', true);

    if (categoryId) {
      query = query.eq('category_id', categoryId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return Response.json(data || []);
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  // Admin only - requires auth token
  try {
    const token = request.headers.get('authorization')?.split('Bearer ')[1];
    if (!token) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify JWT token
    // ... token verification code

    const data = await request.json();
    const { data: document, error } = await supabase
      .from('documents')
      .insert([data])
      .select();

    if (error) throw error;
    return Response.json(document, { status: 201 });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
```

#### 2.3 Continue with Other Public Routes

Create similar route files for:
- `/api/documents/[id]/route.ts`
- `/api/document-categories/route.ts`
- `/api/certifications/route.ts`
- `/api/security-updates/route.ts`
- `/api/controls/route.ts`
- `/api/contact/route.ts`
- `/api/document-requests/route.ts`

### Phase 3: Authentication (45 minutes)

#### 3.1 Create Auth Middleware

Create: `frontend/src/lib/auth.ts`

```typescript
import { jwtVerify } from 'jose';

const secret = new TextEncoder().encode(
  process.env.JWT_SECRET || 'dev-secret-key'
);

export async function verifyAuth(request: Request) {
  const token = request.headers
    .get('authorization')
    ?.split('Bearer ')[1];

  if (!token) {
    throw new Error('No token provided');
  }

  try {
    const verified = await jwtVerify(token, secret);
    return verified.payload;
  } catch (error) {
    throw new Error('Invalid token');
  }
}

export function withAuth(handler: Function) {
  return async (request: Request) => {
    try {
      const user = await verifyAuth(request);
      return handler(request, user);
    } catch (error) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  };
}
```

#### 3.2 Auth Routes

Create: `frontend/src/app/api/auth/login/route.ts`

```typescript
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    // Verify with Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    // Check if admin
    const { data: admin } = await supabase
      .from('admin_users')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (!admin) {
      throw new Error('Not an admin user');
    }

    // Create JWT token
    const token = jwt.sign(
      { 
        user_id: data.user.id, 
        email: data.user.email 
      },
      process.env.JWT_SECRET || 'dev-secret-key'
    );

    return Response.json({ token, user: admin });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}
```

### Phase 4: Admin Routes (1-2 hours)

#### 4.1 Admin Document Routes

Create: `frontend/src/app/api/admin/documents/route.ts`

```typescript
import { withAuth } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export const POST = withAuth(async (request: Request, user: any) => {
  try {
    const formData = await request.formData();
    
    // Handle file upload to Supabase Storage
    const file = formData.get('file') as File;
    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }

    // Upload file
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('documents')
      .upload(`${Date.now()}-${file.name}`, file);

    if (uploadError) throw uploadError;

    // Create document record
    const { data: docData, error: docError } = await supabase
      .from('documents')
      .insert([{
        title: formData.get('title'),
        description: formData.get('description'),
        category_id: formData.get('category_id'),
        file_path: uploadData.path,
        public: formData.get('public') === 'true',
        created_by: user.user_id,
      }])
      .select();

    if (docError) throw docError;
    return Response.json(docData, { status: 201 });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
```

#### 4.2 Continue Admin Routes

Create similar routes for:
- `admin/documents/[id]/route.ts`
- `admin/requests/[id]/approve/route.ts`
- `admin/requests/[id]/deny/route.ts`
- `admin/settings/route.ts`
- `admin/certifications/route.ts`
- `admin/security-updates/route.ts`

### Phase 5: Special Routes (30 minutes)

#### 5.1 Magic Link Access Route

Create: `frontend/src/app/api/access/[token]/route.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(
  request: Request,
  { params }: { params: { token: string } }
) {
  try {
    const { data, error } = await supabase
      .from('access_tokens')
      .select('*')
      .eq('token', params.token)
      .single();

    if (error || !data) {
      return Response.json({ error: 'Invalid or expired token' }, { status: 400 });
    }

    // Check if expired
    if (new Date(data.expires_at) < new Date()) {
      return Response.json({ error: 'Token expired' }, { status: 400 });
    }

    return Response.json(data);
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
```

#### 5.2 Document Download via Magic Link

Create: `frontend/src/app/api/access/[token]/download/[docId]/route.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function GET(
  request: Request,
  { params }: { params: { token: string; docId: string } }
) {
  try {
    // Verify token
    const { data: token } = await supabase
      .from('access_tokens')
      .select('*')
      .eq('token', params.token)
      .single();

    if (!token || new Date(token.expires_at) < new Date()) {
      return Response.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Get document
    const { data: doc } = await supabase
      .from('documents')
      .select('*')
      .eq('id', params.docId)
      .single();

    if (!doc) {
      return Response.json({ error: 'Document not found' }, { status: 404 });
    }

    // Get signed URL
    const { data: signedUrl } = await supabase
      .storage
      .from('documents')
      .createSignedUrl(doc.file_path, 3600);

    if (!signedUrl) {
      return Response.json({ error: 'Cannot create download link' }, { status: 500 });
    }

    return Response.json({ url: signedUrl.signedUrl });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
```

---

## Code Migration Patterns

### Pattern 1: Express Middleware → Next.js Middleware

**Before** (Express):
```typescript
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());
```

**After** (Next.js - middleware.ts):
```typescript
export function middleware(request: Request) {
  const response = NextResponse.next();
  response.headers.set('Access-Control-Allow-Origin', '*');
  return response;
}
```

Or better - handle per route:
```typescript
export async function GET(request: Request) {
  return Response.json(data, {
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  });
}
```

### Pattern 2: Error Handling

**Before** (Express):
```typescript
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message });
});
```

**After** (Next.js - try/catch):
```typescript
export async function GET(request: Request) {
  try {
    const data = await fetchData();
    return Response.json(data);
  } catch (error: any) {
    console.error(error);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
```

### Pattern 3: Request Body Parsing

**Before** (Express):
```typescript
const { email, password } = req.body;
```

**After** (Next.js):
```typescript
const { email, password } = await request.json();
// OR for FormData:
const formData = await request.formData();
const file = formData.get('file');
```

### Pattern 4: URL Parameters

**Before** (Express):
```typescript
app.get('/documents/:id', (req, res) => {
  const id = req.params.id;
});
```

**After** (Next.js in `documents/[id]/route.ts`):
```typescript
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id;
}
```

### Pattern 5: Query Parameters

**Before** (Express):
```typescript
const category = req.query.category;
```

**After** (Next.js):
```typescript
const { searchParams } = new URL(request.url);
const category = searchParams.get('category');
```

---

## Testing Strategy

### 1. Test Each Route Locally

```bash
cd frontend
npm run dev
```

### 2. Use curl for Testing

```bash
# Test public route
curl http://localhost:3000/api/documents

# Test auth route
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"password"}'

# Test protected route
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:3000/api/admin/settings
```

### 3. Frontend Integration Testing

1. Homepage should load without errors
2. All data sections should populate
3. Admin login should work
4. Document upload should work
5. Magic links should work

### 4. Vercel Deployment Testing

After deploying to Vercel:
1. Check Vercel logs for errors
2. Test each endpoint with curl
3. Verify frontend loads
4. Test admin flow end-to-end

---

## Cleanup Tasks

### 1. Remove Backend from vercel.json

Already correct - only builds frontend

### 2. Remove Backend Package.json Dependencies from Frontend

Frontend `package.json` has some duplicate dependencies from backend:
- `express` - Remove (not needed)
- `cors` - Remove (handle in routes)
- `multer` - Keep (for file uploads)
- `@sendgrid/mail` - Keep
- `resend` - Keep
- `nodemailer` - Keep
- `jsonwebtoken` - Keep
- `csv-parse` - Keep
- `openai` - Keep

### 3. Remove Unused Backend Code

Once all routes migrated, delete:
```bash
rm -rf /backend/
```

But keep `/backend/` temporarily for reference during migration.

### 4. Update README

Update README.md to remove Docker Compose instructions.

---

## Deployment Timeline

| Phase | Task | Duration | Status |
|-------|------|----------|--------|
| 1 | Scaffolding | 30 min | ⭕ |
| 2 | Public routes | 1-2 hr | ⭕ |
| 3 | Authentication | 45 min | ⭕ |
| 4 | Admin routes | 1-2 hr | ⭕ |
| 5 | Special routes | 30 min | ⭕ |
| 6 | Testing | 1 hr | ⭕ |
| 7 | Cleanup | 30 min | ⭕ |
| **Total** | | **5-7 hours** | |

---

## Common Pitfalls to Avoid

1. **Forgetting to await `request.json()`**: Will cause parse errors
2. **Not handling CORS**: Frontend calls will fail
3. **Mixing service key with anon key**: Use service key for admin operations
4. **File paths in Supabase Storage**: Must be consistent
5. **Token expiration**: Validate magic link expiry
6. **Missing error handling**: Users see cryptic errors
7. **Not updating env vars**: Vercel has different values than local

---

## Rollback Plan

If migration goes wrong:

1. Keep `/backend/` directory for reference
2. Keep git history (can revert commits)
3. Keep Railway backend running temporarily
4. Can always switch back to Option A

---

## Next Steps

1. **Start Phase 1**: Create directory structure
2. **Test Phase 1**: Verify health endpoint works
3. **Continue Phase 2**: Implement each public route
4. **Test incrementally**: Don't wait until the end
5. **Deploy early**: Use Vercel preview deployments to test
6. **Get feedback**: Test with actual users
7. **Cleanup**: Remove backend when confident

This is a methodical but straightforward process. The key is testing each phase before moving to the next.
