-- ============================================================================
-- TRUST CENTER - SUPABASE CLOUD SETUP
-- ============================================================================
-- Run this file in your Supabase SQL Editor to set up the complete database
-- Note: Auth schema is managed automatically by Supabase Cloud
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- CORE SCHEMA (Migration 001)
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

-- Trust center settings table (single row)
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

-- Create indexes for performance
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
-- ROW LEVEL SECURITY POLICIES (Migration 002)
-- ============================================================================

-- Enable Row Level Security on all tables
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

-- Organizations: Only admins can view/modify
CREATE POLICY "Only admins can manage organizations"
ON organizations
FOR ALL
USING (
    auth.uid() IN (SELECT id FROM admin_users)
);

-- Organization document approvals: Only admins can view/modify
CREATE POLICY "Only admins can manage organization approvals"
ON organization_document_approvals
FOR ALL
USING (
    auth.uid() IN (SELECT id FROM admin_users)
);

-- Admin users: Simple non-recursive policy - users can view their own record
CREATE POLICY "View own admin record"
ON admin_users
FOR SELECT
USING (id = auth.uid());

-- Grant permissions for admin_users table
GRANT ALL ON admin_users TO service_role;
GRANT SELECT ON admin_users TO authenticated;

-- Document categories: Public can view, admins can modify
CREATE POLICY "Anyone can view document categories"
ON document_categories
FOR SELECT
USING (true);

CREATE POLICY "Only admins can insert document categories"
ON document_categories
FOR INSERT
WITH CHECK (
    auth.uid() IN (SELECT id FROM admin_users)
);

CREATE POLICY "Only admins can update document categories"
ON document_categories
FOR UPDATE
USING (
    auth.uid() IN (SELECT id FROM admin_users)
);

CREATE POLICY "Only admins can delete document categories"
ON document_categories
FOR DELETE
USING (
    auth.uid() IN (SELECT id FROM admin_users)
);

-- Documents: Public can view published, admins can modify
CREATE POLICY "Anyone can view published documents"
ON documents
FOR SELECT
USING (status = 'published');

CREATE POLICY "Only admins can insert documents"
ON documents
FOR INSERT
WITH CHECK (
    auth.uid() IN (SELECT id FROM admin_users)
);

CREATE POLICY "Only admins can update documents"
ON documents
FOR UPDATE
USING (
    auth.uid() IN (SELECT id FROM admin_users)
);

CREATE POLICY "Only admins can delete documents"
ON documents
FOR DELETE
USING (
    auth.uid() IN (SELECT id FROM admin_users)
);

-- Document requests: Anyone can insert, admins can view/modify
CREATE POLICY "Anyone can create document requests"
ON document_requests
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Only admins can view document requests"
ON document_requests
FOR SELECT
USING (
    auth.uid() IN (SELECT id FROM admin_users)
);

CREATE POLICY "Only admins can update document requests"
ON document_requests
FOR UPDATE
USING (
    auth.uid() IN (SELECT id FROM admin_users)
);

CREATE POLICY "Only admins can delete document requests"
ON document_requests
FOR DELETE
USING (
    auth.uid() IN (SELECT id FROM admin_users)
);

-- Certifications: Public can view active, admins can modify
CREATE POLICY "Anyone can view active certifications"
ON certifications
FOR SELECT
USING (status = 'active');

CREATE POLICY "Only admins can insert certifications"
ON certifications
FOR INSERT
WITH CHECK (
    auth.uid() IN (SELECT id FROM admin_users)
);

CREATE POLICY "Only admins can update certifications"
ON certifications
FOR UPDATE
USING (
    auth.uid() IN (SELECT id FROM admin_users)
);

CREATE POLICY "Only admins can delete certifications"
ON certifications
FOR DELETE
USING (
    auth.uid() IN (SELECT id FROM admin_users)
);

-- Security updates: Public can view published, admins can modify
CREATE POLICY "Anyone can view published security updates"
ON security_updates
FOR SELECT
USING (published_at IS NOT NULL AND published_at <= NOW());

CREATE POLICY "Only admins can insert security updates"
ON security_updates
FOR INSERT
WITH CHECK (
    auth.uid() IN (SELECT id FROM admin_users)
);

CREATE POLICY "Only admins can update security updates"
ON security_updates
FOR UPDATE
USING (
    auth.uid() IN (SELECT id FROM admin_users)
);

CREATE POLICY "Only admins can delete security updates"
ON security_updates
FOR DELETE
USING (
    auth.uid() IN (SELECT id FROM admin_users)
);

-- Contact submissions: Anyone can insert, admins can view/modify
CREATE POLICY "Anyone can create contact submissions"
ON contact_submissions
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Only admins can view contact submissions"
ON contact_submissions
FOR SELECT
USING (
    auth.uid() IN (SELECT id FROM admin_users)
);

CREATE POLICY "Only admins can update contact submissions"
ON contact_submissions
FOR UPDATE
USING (
    auth.uid() IN (SELECT id FROM admin_users)
);

CREATE POLICY "Only admins can delete contact submissions"
ON contact_submissions
FOR DELETE
USING (
    auth.uid() IN (SELECT id FROM admin_users)
);

-- Trust center settings: Public can view, admins can modify
CREATE POLICY "Anyone can view trust center settings"
ON trust_center_settings
FOR SELECT
USING (true);

CREATE POLICY "Only admins can insert trust center settings"
ON trust_center_settings
FOR INSERT
WITH CHECK (
    auth.uid() IN (SELECT id FROM admin_users)
);

CREATE POLICY "Only admins can update trust center settings"
ON trust_center_settings
FOR UPDATE
USING (
    auth.uid() IN (SELECT id FROM admin_users)
);

CREATE POLICY "Only admins can delete trust center settings"
ON trust_center_settings
FOR DELETE
USING (
    auth.uid() IN (SELECT id FROM admin_users)
);

-- Audit logs: Only admins can view
CREATE POLICY "Only admins can view audit logs"
ON audit_logs
FOR SELECT
USING (
    auth.uid() IN (SELECT id FROM admin_users)
);

CREATE POLICY "System can insert audit logs"
ON audit_logs
FOR INSERT
WITH CHECK (true);

-- Grant permissions on all tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- anon (unauthenticated) can read public tables
GRANT SELECT ON document_categories TO anon;
GRANT SELECT ON documents TO anon;
GRANT SELECT ON certifications TO anon;
GRANT SELECT ON security_updates TO anon;
GRANT SELECT ON trust_center_settings TO anon;

-- authenticated users can read more and submit requests
GRANT SELECT ON document_categories TO authenticated;
GRANT SELECT ON documents TO authenticated;
GRANT SELECT ON certifications TO authenticated;
GRANT SELECT ON security_updates TO authenticated;
GRANT SELECT ON trust_center_settings TO authenticated;
GRANT SELECT ON admin_users TO authenticated;
GRANT INSERT ON contact_submissions TO authenticated;
GRANT INSERT, SELECT ON document_requests TO authenticated;

-- ============================================================================
-- STORAGE BUCKETS (Migration 003)
-- ============================================================================

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES
    ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- SEED DATA (Migration 004)
-- ============================================================================

-- Seed default document categories
INSERT INTO document_categories (name, slug, description, display_order) VALUES
    ('SOC 2 Reports', 'soc2-reports', 'SOC 2 Type I and Type II compliance reports', 1),
    ('Privacy Policies', 'privacy-policies', 'Privacy policy and data protection documents', 2),
    ('Penetration Tests', 'penetration-tests', 'Security penetration testing reports', 3),
    ('ISO Certifications', 'iso-certifications', 'ISO 27001 and related certifications', 4),
    ('Compliance Reports', 'compliance-reports', 'General compliance and audit reports', 5)
ON CONFLICT (slug) DO NOTHING;

-- Seed default trust center settings (only if no settings exist)
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
-- SETUP COMPLETE
-- ============================================================================
-- Next steps:
-- 1. Create a storage bucket named 'documents' in Storage settings (if not auto-created)
-- 2. Create your first admin user in Authentication → Users
-- 3. Insert that user into admin_users table (see SUPABASE_SETUP.md)
-- ============================================================================
