-- ============================================================================
-- TRUST CENTER - CONSOLIDATED DATABASE MIGRATION
-- ============================================================================
-- This file combines all 22 migration files into one for easy setup
-- Run this ONCE in your Supabase SQL Editor to set up the complete database
--
-- Order of operations:
-- 1. Extensions and auth schema
-- 2. Core tables and relationships
-- 3. Row Level Security policies
-- 4. Storage buckets and policies
-- 5. Seed data
-- 6. Feature additions (NDA, webhooks, controls, etc.)
-- ============================================================================

-- ============================================================================
-- MIGRATION 000: Auth Schema & Extensions
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create roles for Supabase
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN NOINHERIT;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN NOINHERIT;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
    END IF;
END $$;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

-- Ensure schemas exist
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS storage;

-- Create auth.users table if it doesn't exist
CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    instance_id UUID,
    email TEXT,
    encrypted_password TEXT,
    email_confirmed_at TIMESTAMP WITH TIME ZONE,
    invited_at TIMESTAMP WITH TIME ZONE,
    confirmation_token TEXT,
    confirmation_sent_at TIMESTAMP WITH TIME ZONE,
    recovery_token TEXT,
    recovery_sent_at TIMESTAMP WITH TIME ZONE,
    email_change_token_new TEXT,
    email_change TEXT,
    email_change_sent_at TIMESTAMP WITH TIME ZONE,
    last_sign_in_at TIMESTAMP WITH TIME ZONE,
    raw_app_meta_data JSONB,
    raw_user_meta_data JSONB,
    is_super_admin BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    phone TEXT,
    phone_confirmed_at TIMESTAMP WITH TIME ZONE,
    phone_change TEXT,
    phone_change_token TEXT,
    phone_change_sent_at TIMESTAMP WITH TIME ZONE,
    confirmed_at TIMESTAMP WITH TIME ZONE GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
    email_change_token_current TEXT,
    email_change_confirm_status SMALLINT,
    banned_until TIMESTAMP WITH TIME ZONE,
    reauthentication_token TEXT,
    reauthentication_sent_at TIMESTAMP WITH TIME ZONE,
    is_sso_user BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create auth.identities table if doesn't exist
CREATE TABLE IF NOT EXISTS auth.identities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    identity_data JSONB NOT NULL,
    provider TEXT NOT NULL,
    last_sign_in_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create storage tables
CREATE TABLE IF NOT EXISTS storage.buckets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    public BOOLEAN DEFAULT FALSE,
    avif_autodetection BOOLEAN DEFAULT FALSE,
    file_size_limit BIGINT,
    allowed_mime_types TEXT[]
);

CREATE TABLE IF NOT EXISTS storage.objects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bucket_id TEXT REFERENCES storage.buckets(id),
    name TEXT NOT NULL,
    owner UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB,
    path_tokens TEXT[] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED,
    version TEXT,
    owner_id TEXT
);

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Grant storage permissions
GRANT USAGE ON SCHEMA storage TO anon;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT USAGE ON SCHEMA storage TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA storage TO service_role;

-- Create auth helper functions
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID AS $$
BEGIN
    RETURN COALESCE(
        NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID,
        NULLIF(current_setting('request.jwt.claim.user_id', true), '')::UUID
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION auth.role()
RETURNS TEXT AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.role', true), '');
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION auth.email()
RETURNS TEXT AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.email', true), '');
$$ LANGUAGE sql STABLE;

-- ============================================================================
-- MIGRATION 001: Initial Schema
-- ============================================================================

-- Organizations table
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    email_domain TEXT UNIQUE NOT NULL,
    approved_document_ids UUID[] DEFAULT '{}',
    notes TEXT,
    first_approved_at TIMESTAMP WITH TIME ZONE,
    last_approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Organization document approvals audit table
CREATE TABLE organization_document_approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    document_id UUID NOT NULL,
    approved_by UUID NOT NULL,
    approved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    request_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Admin users table
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL,
    full_name TEXT,
    role TEXT DEFAULT 'admin' CHECK (role = 'admin'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT admin_users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Document categories
CREATE TABLE document_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    icon TEXT,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Documents table
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    category_id UUID REFERENCES document_categories(id) ON DELETE SET NULL,
    access_level TEXT NOT NULL CHECK (access_level IN ('public', 'restricted')),
    file_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    file_type TEXT NOT NULL,
    version TEXT,
    version_number INTEGER DEFAULT 1,
    is_current_version BOOLEAN DEFAULT true,
    replaces_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
    published_at TIMESTAMP WITH TIME ZONE,
    archived_at TIMESTAMP WITH TIME ZONE,
    uploaded_by UUID NOT NULL REFERENCES admin_users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Document requests table
CREATE TABLE document_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requester_name TEXT NOT NULL,
    requester_email TEXT NOT NULL,
    requester_company TEXT NOT NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    document_ids UUID[] NOT NULL,
    request_reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'auto_approved')),
    magic_link_token TEXT UNIQUE,
    magic_link_expires_at TIMESTAMP WITH TIME ZONE,
    magic_link_used_at TIMESTAMP WITH TIME ZONE,
    admin_notes TEXT,
    reviewed_by UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP WITH TIME ZONE,
    auto_approved BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Certifications table
CREATE TABLE certifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    issuer TEXT NOT NULL,
    issue_date DATE,
    expiry_date DATE,
    certificate_image_url TEXT,
    description TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Security updates table
CREATE TABLE security_updates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Contact submissions table
CREATE TABLE contact_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    organization TEXT,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trust center settings table
CREATE TABLE trust_center_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_name TEXT,
    company_logo_url TEXT,
    primary_color TEXT DEFAULT '#007bff',
    secondary_color TEXT DEFAULT '#6c757d',
    hero_title TEXT,
    hero_subtitle TEXT,
    hero_image_url TEXT,
    about_section TEXT,
    contact_email TEXT,
    support_email TEXT,
    social_links JSONB DEFAULT '{}',
    footer_text TEXT,
    privacy_policy_url TEXT,
    terms_of_service_url TEXT,
    email_notification_enabled BOOLEAN DEFAULT true,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES admin_users(id) ON DELETE SET NULL
);

-- Audit logs table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_user_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL CHECK (action_type IN (
        'document_upload', 'document_delete', 'request_approved', 'request_denied',
        'organization_approved', 'organization_denied', 'settings_updated'
    )),
    resource_type TEXT NOT NULL,
    resource_id UUID,
    details JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_organizations_email_domain ON organizations(email_domain);
CREATE INDEX idx_document_requests_email ON document_requests(requester_email);
CREATE INDEX idx_document_requests_org ON document_requests(organization_id);
CREATE INDEX idx_document_requests_token ON document_requests(magic_link_token);
CREATE INDEX idx_document_requests_status ON document_requests(status);
CREATE INDEX idx_documents_category ON documents(category_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_access_level ON documents(access_level);
CREATE INDEX idx_organization_document_approvals_org ON organization_document_approvals(organization_id);
CREATE INDEX idx_organization_document_approvals_doc ON organization_document_approvals(document_id);
CREATE INDEX idx_audit_logs_admin ON audit_logs(admin_user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action_type);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON admin_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_document_categories_updated_at BEFORE UPDATE ON document_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_document_requests_updated_at BEFORE UPDATE ON document_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_certifications_updated_at BEFORE UPDATE ON certifications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_security_updates_updated_at BEFORE UPDATE ON security_updates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contact_submissions_updated_at BEFORE UPDATE ON contact_submissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trust_center_settings_updated_at BEFORE UPDATE ON trust_center_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- MIGRATION 002: RLS Policies
-- ============================================================================

-- Enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_document_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trust_center_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Organizations policies
CREATE POLICY "Only admins can manage organizations"
ON organizations FOR ALL
USING (auth.uid() IN (SELECT id FROM admin_users));

CREATE POLICY "Only admins can manage organization approvals"
ON organization_document_approvals FOR ALL
USING (auth.uid() IN (SELECT id FROM admin_users));

-- Admin users policies
CREATE POLICY "View own admin record"
ON admin_users FOR SELECT
USING (id = auth.uid());

GRANT ALL ON admin_users TO service_role;
GRANT SELECT ON admin_users TO authenticated;

-- Document categories policies
CREATE POLICY "Anyone can view document categories"
ON document_categories FOR SELECT
USING (true);

CREATE POLICY "Only admins can insert document categories"
ON document_categories FOR INSERT
WITH CHECK (auth.uid() IN (SELECT id FROM admin_users));

CREATE POLICY "Only admins can update document categories"
ON document_categories FOR UPDATE
USING (auth.uid() IN (SELECT id FROM admin_users));

CREATE POLICY "Only admins can delete document categories"
ON document_categories FOR DELETE
USING (auth.uid() IN (SELECT id FROM admin_users));

-- Documents policies
CREATE POLICY "Anyone can view published documents"
ON documents FOR SELECT
USING (status = 'published');

CREATE POLICY "Only admins can insert documents"
ON documents FOR INSERT
WITH CHECK (auth.uid() IN (SELECT id FROM admin_users));

CREATE POLICY "Only admins can update documents"
ON documents FOR UPDATE
USING (auth.uid() IN (SELECT id FROM admin_users));

CREATE POLICY "Only admins can delete documents"
ON documents FOR DELETE
USING (auth.uid() IN (SELECT id FROM admin_users));

-- Document requests policies
CREATE POLICY "Anyone can create document requests"
ON document_requests FOR INSERT
WITH CHECK (true);

CREATE POLICY "Only admins can view document requests"
ON document_requests FOR SELECT
USING (auth.uid() IN (SELECT id FROM admin_users));

CREATE POLICY "Only admins can update document requests"
ON document_requests FOR UPDATE
USING (auth.uid() IN (SELECT id FROM admin_users));

CREATE POLICY "Only admins can delete document requests"
ON document_requests FOR DELETE
USING (auth.uid() IN (SELECT id FROM admin_users));

-- Certifications policies
CREATE POLICY "Anyone can view active certifications"
ON certifications FOR SELECT
USING (status = 'active');

CREATE POLICY "Only admins can insert certifications"
ON certifications FOR INSERT
WITH CHECK (auth.uid() IN (SELECT id FROM admin_users));

CREATE POLICY "Only admins can update certifications"
ON certifications FOR UPDATE
USING (auth.uid() IN (SELECT id FROM admin_users));

CREATE POLICY "Only admins can delete certifications"
ON certifications FOR DELETE
USING (auth.uid() IN (SELECT id FROM admin_users));

-- Security updates policies
CREATE POLICY "Anyone can view published security updates"
ON security_updates FOR SELECT
USING (published_at IS NOT NULL AND published_at <= NOW());

CREATE POLICY "Only admins can insert security updates"
ON security_updates FOR INSERT
WITH CHECK (auth.uid() IN (SELECT id FROM admin_users));

CREATE POLICY "Only admins can update security updates"
ON security_updates FOR UPDATE
USING (auth.uid() IN (SELECT id FROM admin_users));

CREATE POLICY "Only admins can delete security updates"
ON security_updates FOR DELETE
USING (auth.uid() IN (SELECT id FROM admin_users));

-- Contact submissions policies
CREATE POLICY "Anyone can create contact submissions"
ON contact_submissions FOR INSERT
WITH CHECK (true);

CREATE POLICY "Only admins can view contact submissions"
ON contact_submissions FOR SELECT
USING (auth.uid() IN (SELECT id FROM admin_users));

CREATE POLICY "Only admins can update contact submissions"
ON contact_submissions FOR UPDATE
USING (auth.uid() IN (SELECT id FROM admin_users));

CREATE POLICY "Only admins can delete contact submissions"
ON contact_submissions FOR DELETE
USING (auth.uid() IN (SELECT id FROM admin_users));

-- Trust center settings policies
CREATE POLICY "Anyone can view trust center settings"
ON trust_center_settings FOR SELECT
USING (true);

CREATE POLICY "Only admins can insert trust center settings"
ON trust_center_settings FOR INSERT
WITH CHECK (auth.uid() IN (SELECT id FROM admin_users));

CREATE POLICY "Only admins can update trust center settings"
ON trust_center_settings FOR UPDATE
USING (auth.uid() IN (SELECT id FROM admin_users));

CREATE POLICY "Only admins can delete trust center settings"
ON trust_center_settings FOR DELETE
USING (auth.uid() IN (SELECT id FROM admin_users));

-- Audit logs policies
CREATE POLICY "Only admins can view audit logs"
ON audit_logs FOR SELECT
USING (auth.uid() IN (SELECT id FROM admin_users));

CREATE POLICY "System can insert audit logs"
ON audit_logs FOR INSERT
WITH CHECK (true);

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO service_role;

GRANT SELECT ON document_categories TO anon;
GRANT SELECT ON documents TO anon;
GRANT SELECT ON certifications TO anon;
GRANT SELECT ON security_updates TO anon;
GRANT SELECT ON trust_center_settings TO anon;

GRANT SELECT ON document_categories TO authenticated;
GRANT SELECT ON documents TO authenticated;
GRANT SELECT ON certifications TO authenticated;
GRANT SELECT ON security_updates TO authenticated;
GRANT SELECT ON trust_center_settings TO authenticated;
GRANT SELECT ON admin_users TO authenticated;
GRANT INSERT ON contact_submissions TO authenticated;
GRANT INSERT, SELECT ON document_requests TO authenticated;

-- ============================================================================
-- MIGRATION 003: Storage Buckets
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES
    ('compliance-documents', 'compliance-documents', false),
    ('certificate-images', 'certificate-images', true),
    ('trust-center-assets', 'trust-center-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Admins can manage compliance documents"
ON storage.objects FOR ALL
USING (
    bucket_id = 'compliance-documents' AND
    auth.uid() IN (SELECT id FROM admin_users)
)
WITH CHECK (
    bucket_id = 'compliance-documents' AND
    auth.uid() IN (SELECT id FROM admin_users)
);

CREATE POLICY "Certificates are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'certificate-images');

CREATE POLICY "Only admins can insert certificates"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'certificate-images' AND
    auth.uid() IN (SELECT id FROM admin_users)
);

CREATE POLICY "Only admins can update certificates"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'certificate-images' AND
    auth.uid() IN (SELECT id FROM admin_users)
);

CREATE POLICY "Only admins can delete certificates"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'certificate-images' AND
    auth.uid() IN (SELECT id FROM admin_users)
);

CREATE POLICY "Trust center assets are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'trust-center-assets');

CREATE POLICY "Only admins can insert trust center assets"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'trust-center-assets' AND
    auth.uid() IN (SELECT id FROM admin_users)
);

CREATE POLICY "Only admins can update trust center assets"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'trust-center-assets' AND
    auth.uid() IN (SELECT id FROM admin_users)
);

CREATE POLICY "Only admins can delete trust center assets"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'trust-center-assets' AND
    auth.uid() IN (SELECT id FROM admin_users)
);

-- ============================================================================
-- MIGRATION 004: Seed Data
-- ============================================================================

INSERT INTO document_categories (name, slug, description, display_order) VALUES
    ('SOC 2 Reports', 'soc2-reports', 'SOC 2 Type I and Type II compliance reports', 1),
    ('Privacy Policies', 'privacy-policies', 'Privacy policy and data protection documents', 2),
    ('Penetration Tests', 'penetration-tests', 'Security penetration testing reports', 3),
    ('ISO Certifications', 'iso-certifications', 'ISO 27001 and related certifications', 4),
    ('Compliance Reports', 'compliance-reports', 'General compliance and audit reports', 5)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO trust_center_settings (
    company_name,
    hero_title,
    hero_subtitle,
    about_section,
    contact_email,
    footer_text
)
SELECT 
    'Trust Center',
    'Security & Compliance',
    'Your trusted partner for security and compliance documentation',
    'Welcome to our Trust Center. We are committed to maintaining the highest standards of security and compliance.',
    'security@example.com',
    '© 2024 Trust Center. All rights reserved.'
WHERE NOT EXISTS (SELECT 1 FROM trust_center_settings LIMIT 1);

-- ============================================================================
-- MIGRATION 005: User Management Functions
-- ============================================================================

CREATE OR REPLACE FUNCTION create_user_with_password(
    p_email TEXT,
    p_password TEXT,
    p_full_name TEXT DEFAULT NULL,
    p_is_admin BOOLEAN DEFAULT FALSE,
    p_admin_role TEXT DEFAULT 'admin'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_identity_id UUID;
BEGIN
    v_user_id := gen_random_uuid();
    v_identity_id := gen_random_uuid();

    SELECT id INTO v_user_id FROM auth.users WHERE email = p_email;
    
    IF v_user_id IS NULL THEN
        v_user_id := gen_random_uuid();
        INSERT INTO auth.users (
            id,
            email,
            encrypted_password,
            email_confirmed_at,
            created_at,
            updated_at,
            raw_user_meta_data,
            is_super_admin,
            is_sso_user
        )
        VALUES (
            v_user_id,
            p_email,
            crypt(p_password, gen_salt('bf')),
            NOW(),
            NOW(),
            NOW(),
            COALESCE(jsonb_build_object('full_name', p_full_name), '{}'::jsonb),
            false,
            false
        );
    ELSE
        UPDATE auth.users
        SET encrypted_password = crypt(p_password, gen_salt('bf')),
            updated_at = NOW()
        WHERE id = v_user_id;
    END IF;

    INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        created_at,
        updated_at,
        last_sign_in_at
    )
    VALUES (
        v_identity_id,
        v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', p_email),
        'email',
        NOW(),
        NOW(),
        NOW()
    )
    ON CONFLICT DO NOTHING;

    IF p_is_admin THEN
        INSERT INTO admin_users (id, email, full_name, role)
        VALUES (v_user_id, p_email, COALESCE(p_full_name, 'Admin User'), p_admin_role)
        ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email,
            full_name = EXCLUDED.full_name,
            role = EXCLUDED.role,
            updated_at = NOW();
    END IF;

    RETURN v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION update_user_password(
    p_user_id UUID,
    p_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE auth.users
    SET encrypted_password = crypt(p_password, gen_salt('bf')),
        updated_at = NOW()
    WHERE id = p_user_id;

    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION get_all_users()
RETURNS TABLE (
    id UUID,
    email TEXT,
    created_at TIMESTAMPTZ,
    email_confirmed_at TIMESTAMPTZ,
    raw_user_meta_data JSONB,
    is_admin BOOLEAN,
    admin_role TEXT,
    full_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        u.id,
        u.email,
        u.created_at,
        u.email_confirmed_at,
        u.raw_user_meta_data,
        COALESCE(au.id IS NOT NULL, false) as is_admin,
        au.role as admin_role,
        COALESCE(au.full_name, u.raw_user_meta_data->>'full_name') as full_name
    FROM auth.users u
    LEFT JOIN admin_users au ON u.id = au.id
    ORDER BY u.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION create_user_with_password TO service_role;
GRANT EXECUTE ON FUNCTION update_user_password TO service_role;
GRANT EXECUTE ON FUNCTION get_all_users TO service_role;

-- ============================================================================
-- MIGRATION 006: Organization Status System
-- ============================================================================

ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'conditional' 
CHECK (status IN ('whitelisted', 'conditional', 'no_access'));

ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP WITH TIME ZONE;

UPDATE organizations 
SET status = CASE 
  WHEN array_length(approved_document_ids, 1) > 0 THEN 'conditional'
  ELSE 'no_access'
END
WHERE status IS NULL;

UPDATE organizations 
SET is_active = true 
WHERE is_active IS NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);
CREATE INDEX IF NOT EXISTS idx_organizations_is_active ON organizations(is_active);
CREATE INDEX IF NOT EXISTS idx_organizations_status_active ON organizations(status, is_active);

-- ============================================================================
-- MIGRATION 007: Ticket Messages
-- ============================================================================

CREATE TABLE ticket_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ticket_id UUID NOT NULL REFERENCES contact_submissions(id) ON DELETE CASCADE,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('admin', 'user')),
    sender_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    sender_name TEXT,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ticket_messages_ticket ON ticket_messages(ticket_id);
CREATE INDEX idx_ticket_messages_created ON ticket_messages(created_at);

ALTER TABLE contact_submissions
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES admin_users(id) ON DELETE SET NULL;

CREATE TRIGGER update_ticket_messages_updated_at BEFORE UPDATE ON ticket_messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- MIGRATION 008: Enhanced Activity Logs
-- ============================================================================

DROP TABLE IF EXISTS audit_logs;

CREATE TABLE activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_user_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    admin_email TEXT,
    action_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    entity_name TEXT,
    old_value JSONB,
    new_value JSONB,
    description TEXT,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX idx_activity_logs_admin ON activity_logs(admin_user_id);
CREATE INDEX idx_activity_logs_action ON activity_logs(action_type);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY activity_logs_admin_read ON activity_logs 
    FOR SELECT TO authenticated USING (true);

CREATE POLICY activity_logs_admin_insert ON activity_logs 
    FOR INSERT TO authenticated WITH CHECK (true);

GRANT ALL ON activity_logs TO authenticated, anon, service_role;

-- ============================================================================
-- MIGRATION 009: Branding Settings
-- ============================================================================

ALTER TABLE trust_center_settings 
ADD COLUMN IF NOT EXISTS favicon_url TEXT;

ALTER TABLE trust_center_settings 
ADD COLUMN IF NOT EXISTS font_family TEXT DEFAULT 'Inter';

ALTER TABLE trust_center_settings 
ADD COLUMN IF NOT EXISTS footer_links JSONB DEFAULT '[]';

ALTER TABLE trust_center_settings 
ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT '#2563eb';

-- ============================================================================
-- MIGRATION 010: Subprocessors
-- ============================================================================

CREATE TABLE IF NOT EXISTS subprocessors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    purpose TEXT NOT NULL,
    data_location TEXT,
    website_url TEXT,
    category TEXT DEFAULT 'Infrastructure',
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subprocessor_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL UNIQUE,
    is_verified BOOLEAN DEFAULT false,
    verification_token TEXT,
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE subprocessors ENABLE ROW LEVEL SECURITY;
ALTER TABLE subprocessor_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active subprocessors"
ON subprocessors FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can insert subprocessors"
ON subprocessors FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

CREATE POLICY "Admins can update subprocessors"
ON subprocessors FOR UPDATE
USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

CREATE POLICY "Admins can delete subprocessors"
ON subprocessors FOR DELETE
USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

CREATE POLICY "Anyone can subscribe"
ON subprocessor_subscriptions FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can view subscriptions"
ON subprocessor_subscriptions FOR SELECT
USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

GRANT SELECT ON subprocessors TO anon;
GRANT SELECT ON subprocessors TO authenticated;
GRANT INSERT ON subprocessor_subscriptions TO anon;
GRANT INSERT ON subprocessor_subscriptions TO authenticated;
GRANT ALL ON subprocessors TO service_role;
GRANT ALL ON subprocessor_subscriptions TO service_role;

CREATE TRIGGER update_subprocessors_updated_at BEFORE UPDATE ON subprocessors
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- MIGRATION 011: Ticket Priority
-- ============================================================================

ALTER TABLE contact_submissions 
ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal' 
CHECK (priority IN ('low', 'normal', 'high', 'critical'));

CREATE INDEX IF NOT EXISTS idx_contact_submissions_priority ON contact_submissions(priority);

-- ============================================================================
-- MIGRATION 012: Request Expiration
-- ============================================================================

ALTER TABLE document_requests 
ADD COLUMN IF NOT EXISTS access_expires_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE document_requests 
ADD COLUMN IF NOT EXISTS expiration_days INTEGER;

CREATE INDEX IF NOT EXISTS idx_document_requests_expires ON document_requests(access_expires_at);

-- ============================================================================
-- MIGRATION 013: NDA URL
-- ============================================================================

ALTER TABLE trust_center_settings 
ADD COLUMN IF NOT EXISTS nda_url TEXT;

-- ============================================================================
-- MIGRATION 014: Knowledge Base
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_base_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE knowledge_base_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access for public kb items" ON knowledge_base_items;
DROP POLICY IF EXISTS "Admin full access for kb items" ON knowledge_base_items;

CREATE POLICY "Public read access for public kb items"
ON knowledge_base_items FOR SELECT
TO anon, authenticated
USING (is_public = true);

CREATE POLICY "Admin full access for kb items"
ON knowledge_base_items FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

DROP TRIGGER IF EXISTS update_knowledge_base_modtime ON knowledge_base_items;

CREATE TRIGGER update_knowledge_base_modtime
    BEFORE UPDATE ON knowledge_base_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- MIGRATION 015: NDA Clickwrap
-- ============================================================================

ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS requires_nda BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS nda_acceptances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    ip_address INET,
    user_agent TEXT,
    accepted_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT nda_acceptances_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX IF NOT EXISTS idx_nda_acceptances_email ON nda_acceptances(email);
CREATE INDEX IF NOT EXISTS idx_nda_acceptances_org ON nda_acceptances(organization_id);

ALTER TABLE nda_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin view nda acceptances"
ON nda_acceptances FOR SELECT
TO authenticated
USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

-- ============================================================================
-- MIGRATION 016: Outbound Webhooks
-- ============================================================================

CREATE TABLE IF NOT EXISTS outbound_webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    url TEXT NOT NULL,
    description TEXT,
    event_types TEXT[] DEFAULT '{}',
    secret TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE outbound_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access for webhooks"
ON outbound_webhooks FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

CREATE TRIGGER update_outbound_webhooks_modtime
    BEFORE UPDATE ON outbound_webhooks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- MIGRATION 017: Controls Schema
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.control_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.controls (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    category_id UUID REFERENCES public.control_categories(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.control_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.controls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on control_categories"
    ON public.control_categories FOR SELECT TO public USING (true);

CREATE POLICY "Allow authenticated insert on control_categories"
    ON public.control_categories FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated update on control_categories"
    ON public.control_categories FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated delete on control_categories"
    ON public.control_categories FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow public read access on controls"
    ON public.controls FOR SELECT TO public USING (true);

CREATE POLICY "Allow authenticated insert on controls"
    ON public.controls FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated update on controls"
    ON public.controls FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow authenticated delete on controls"
    ON public.controls FOR DELETE TO authenticated USING (true);

CREATE TRIGGER handle_updated_at_control_categories
    BEFORE UPDATE ON public.control_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER handle_updated_at_controls
    BEFORE UPDATE ON public.controls
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- MIGRATION 019: Category Banner & Document NDA
-- ============================================================================

ALTER TABLE public.control_categories 
ADD COLUMN IF NOT EXISTS banner_image TEXT;

ALTER TABLE document_categories 
ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================================
-- MIGRATION 020: Admin Nav Order
-- ============================================================================

ALTER TABLE trust_center_settings 
ADD COLUMN IF NOT EXISTS admin_nav_order TEXT[] DEFAULT ARRAY[
    'dashboard',
    'controls',
    'documents',
    'certifications',
    'security-updates',
    'requests',
    'organizations',
    'users',
    'activity',
    'settings'
];

-- ============================================================================
-- SETUP COMPLETE
-- ============================================================================

-- Create a storage bucket for documents if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Add storage policies for documents bucket
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'objects' 
        AND policyname = 'Service role can manage documents bucket'
    ) THEN
        CREATE POLICY "Service role can manage documents bucket"
        ON storage.objects FOR ALL
        USING (bucket_id = 'documents')
        WITH CHECK (bucket_id = 'documents');
    END IF;
END $$;

