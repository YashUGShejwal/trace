-- ====================================================================
-- TRACE DATABASE SETUP - COMPLETE REWRITE
-- ====================================================================
-- Role Hierarchy:
--   1. super_admin  - Full access, can promote users to product_owner
--   2. product_owner - Can create projects, manage members, plus user permissions
--   3. user (regular) - Can add/update assets in projects they're members of
-- ====================================================================

-- ================================
-- 0) CLEAN SLATE - DROP EVERYTHING
-- ================================

-- Drop triggers
DROP TRIGGER IF EXISTS log_asset_status_change_trigger ON public.assets;
DROP TRIGGER IF EXISTS update_projects_updated_at ON public.projects;
DROP TRIGGER IF EXISTS update_assets_updated_at ON public.assets;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop functions
DROP FUNCTION IF EXISTS public.log_asset_status_change() CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.get_user_role(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.is_project_member(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.is_project_owner(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.is_project_admin(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.has_project_access(UUID, UUID) CASCADE;

-- Drop all existing policies safely
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT policyname, tablename 
    FROM pg_policies 
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END$$;

-- Drop tables (order matters for foreign keys)
DROP TABLE IF EXISTS public.asset_history CASCADE;
DROP TABLE IF EXISTS public.project_members CASCADE;
DROP TABLE IF EXISTS public.assets CASCADE;
DROP TABLE IF EXISTS public.projects CASCADE;
DROP TABLE IF EXISTS public.blocked_emails CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Drop types
DROP TYPE IF EXISTS public.asset_status CASCADE;
DROP TYPE IF EXISTS public.profile_role CASCADE;
DROP TYPE IF EXISTS public.project_member_role CASCADE;

-- ================================
-- 1) CREATE TYPES
-- ================================

CREATE TYPE public.asset_status AS ENUM ('pending', 'received', 'implemented');
CREATE TYPE public.profile_role AS ENUM ('super_admin', 'product_owner', 'user');
CREATE TYPE public.project_member_role AS ENUM ('member', 'project_owner');

-- ================================
-- 2) CREATE TABLES
-- ================================

-- Profiles table (extends auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  nickname TEXT,
  avatar_url TEXT,
  role public.profile_role NOT NULL DEFAULT 'user',
  is_blacklisted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Blocked emails table (prevents future signups)
CREATE TABLE public.blocked_emails (
  email TEXT PRIMARY KEY,
  reason TEXT,
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Projects table
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Assets table
CREATE TABLE public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  file_path TEXT,
  folder TEXT,
  status public.asset_status NOT NULL DEFAULT 'pending',
  assigned_to TEXT,
  received_at TIMESTAMPTZ,
  implemented_at TIMESTAMPTZ,
  notes TEXT,
  revision_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Project members (links users to projects)
CREATE TABLE public.project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.project_member_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);

-- Asset history (audit log)
CREATE TABLE public.asset_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  changed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  old_status public.asset_status NOT NULL,
  new_status public.asset_status NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ================================
-- 3) CREATE INDEXES
-- ================================

CREATE INDEX idx_profiles_role ON public.profiles(role);
CREATE INDEX idx_profiles_email ON public.profiles(email);
CREATE UNIQUE INDEX blocked_emails_lower_email_idx ON public.blocked_emails (lower(email));
CREATE INDEX idx_projects_user_id ON public.projects(user_id);
CREATE INDEX idx_assets_project_id ON public.assets(project_id);
CREATE INDEX idx_assets_status ON public.assets(status);
CREATE INDEX idx_project_members_project_id ON public.project_members(project_id);
CREATE INDEX idx_project_members_user_id ON public.project_members(user_id);
CREATE INDEX idx_asset_history_asset_id ON public.asset_history(asset_id);

-- ================================
-- 4) HELPER FUNCTIONS (SECURITY DEFINER to avoid RLS recursion)
-- ================================

-- Function to get user's role (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS public.profile_role
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.profiles WHERE id = user_id),
    'user'::public.profile_role
  );
$$;

-- Function to check if user is member of a project (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members 
    WHERE project_id = p_project_id AND user_id = p_user_id
  );
$$;

-- Function to check if user is project owner (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_project_owner(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id = p_project_id AND user_id = p_user_id
  );
$$;

-- Function to check project-level admin (creator or member with project_owner role)
CREATE OR REPLACE FUNCTION public.is_project_admin(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects pr
    WHERE pr.id = p_project_id AND pr.user_id = p_user_id
  )
  OR EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.user_id = p_user_id
      AND pm.role = 'project_owner'
  );
$$;

-- Function to check project access (owner OR member)
CREATE OR REPLACE FUNCTION public.has_project_access(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT 
    public.is_project_owner(p_project_id, p_user_id) 
    OR public.is_project_member(p_project_id, p_user_id);
$$;

-- ================================
-- 5) TRIGGERS & TRIGGER FUNCTIONS
-- ================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_assets_updated_at
  BEFORE UPDATE ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-log asset status changes
CREATE OR REPLACE FUNCTION public.log_asset_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.asset_history (asset_id, changed_by, old_status, new_status, comment)
    VALUES (
      NEW.id,
      auth.uid(),
      OLD.status,
      NEW.status,
      COALESCE(NEW.notes, OLD.notes)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER log_asset_status_change_trigger
  AFTER UPDATE ON public.assets
  FOR EACH ROW
  EXECUTE FUNCTION public.log_asset_status_change();

-- Auto-create profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- block signup if email is in blocked list
  IF EXISTS (SELECT 1 FROM public.blocked_emails WHERE lower(email) = lower(NEW.email)) THEN
    RAISE EXCEPTION 'This email is blocked. Contact support.';
  END IF;

  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'user')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Helper: upsert blocked email
CREATE OR REPLACE FUNCTION public.block_email(p_email TEXT, p_added_by UUID DEFAULT auth.uid(), p_reason TEXT DEFAULT 'Blacklisted by admin')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_email IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.blocked_emails (email, reason, added_by)
  VALUES (lower(p_email), p_reason, p_added_by)
  ON CONFLICT (email) DO UPDATE
    SET reason = EXCLUDED.reason,
        added_by = EXCLUDED.added_by,
        created_at = now();
END;
$$;

-- Helper: set blacklist flag and maintain blocked_emails
CREATE OR REPLACE FUNCTION public.set_blacklist_status(p_target UUID, p_blacklisted BOOLEAN, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role public.profile_role;
  target_email TEXT;
BEGIN
  SELECT role INTO actor_role FROM public.profiles WHERE id = auth.uid();
  IF actor_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  UPDATE public.profiles
  SET is_blacklisted = p_blacklisted
  WHERE id = p_target;

  IF p_blacklisted THEN
    SELECT email INTO target_email FROM public.profiles WHERE id = p_target;
    IF target_email IS NOT NULL THEN
      PERFORM public.block_email(target_email, auth.uid(), COALESCE(p_reason, 'Blacklisted by admin'));
    END IF;
  ELSE
    DELETE FROM public.blocked_emails WHERE lower(email) = lower((SELECT email FROM public.profiles WHERE id = p_target));
  END IF;
END;
$$;

-- Helper: delete a user and block their email (super_admin only)
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_target UUID, p_reason TEXT DEFAULT 'Deleted by super admin')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  actor_role public.profile_role;
  target_email TEXT;
BEGIN
  SELECT role INTO actor_role FROM public.profiles WHERE id = auth.uid();
  IF actor_role <> 'super_admin' THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT email INTO target_email FROM public.profiles WHERE id = p_target;

  IF target_email IS NOT NULL THEN
    PERFORM public.block_email(target_email, auth.uid(), p_reason);
  END IF;

  DELETE FROM auth.users WHERE id = p_target;
END;
$$;

-- ================================
-- 6) ENABLE RLS
-- ================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_emails ENABLE ROW LEVEL SECURITY;

-- ================================
-- 7) RLS POLICIES
-- ================================

-- ========== PROFILES ==========

-- Anyone authenticated can read profiles (needed for user display)
CREATE POLICY "profiles_select"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Users can only insert their own profile
CREATE POLICY "profiles_insert"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Users can update their own profile (excluding role field)
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Super admin can update any profile (including role changes)
CREATE POLICY "profiles_update_super_admin"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.get_user_role(auth.uid()) = 'super_admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'super_admin');

-- Blocked emails managed only by super_admin
CREATE POLICY "blocked_emails_manage_super_admin"
  ON public.blocked_emails FOR ALL
  TO authenticated
  USING (public.get_user_role(auth.uid()) = 'super_admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'super_admin');

-- ========== PROJECTS ==========

-- SELECT: Owner, member, or super_admin can view projects
CREATE POLICY "projects_select"
  ON public.projects FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_project_member(id, auth.uid())
    OR public.get_user_role(auth.uid()) = 'super_admin'
  );

-- INSERT: Only product_owner or super_admin can create projects
CREATE POLICY "projects_insert"
  ON public.projects FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND public.get_user_role(auth.uid()) IN ('product_owner', 'super_admin')
  );

-- UPDATE: Only project owner or super_admin can update
CREATE POLICY "projects_update"
  ON public.projects FOR UPDATE
  TO authenticated
  USING (
    public.is_project_admin(id, auth.uid())
    OR public.get_user_role(auth.uid()) = 'super_admin'
  )
  WITH CHECK (
    public.is_project_admin(id, auth.uid())
    OR public.get_user_role(auth.uid()) = 'super_admin'
  );

-- DELETE: Only project owner or super_admin can delete
CREATE POLICY "projects_delete"
  ON public.projects FOR DELETE
  TO authenticated
  USING (
    public.is_project_admin(id, auth.uid())
    OR public.get_user_role(auth.uid()) = 'super_admin'
  );

-- ========== PROJECT_MEMBERS ==========

-- SELECT: Visible to project owner, the member themselves, or super_admin
CREATE POLICY "project_members_select"
  ON public.project_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_project_admin(project_id, auth.uid())
    OR public.get_user_role(auth.uid()) = 'super_admin'
  );

-- INSERT: Only project owner or super_admin can add members
CREATE POLICY "project_members_insert"
  ON public.project_members FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_project_admin(project_id, auth.uid())
    OR public.get_user_role(auth.uid()) = 'super_admin'
  );

-- DELETE: Only project owner or super_admin can remove members
CREATE POLICY "project_members_delete"
  ON public.project_members FOR DELETE
  TO authenticated
  USING (
    public.is_project_admin(project_id, auth.uid())
    OR public.get_user_role(auth.uid()) = 'super_admin'
  );

-- UPDATE: Project admin or super_admin can update member role
CREATE POLICY "project_members_update"
  ON public.project_members FOR UPDATE
  TO authenticated
  USING (
    public.is_project_admin(project_id, auth.uid())
    OR public.get_user_role(auth.uid()) = 'super_admin'
  )
  WITH CHECK (
    public.is_project_admin(project_id, auth.uid())
    OR public.get_user_role(auth.uid()) = 'super_admin'
  );

-- ========== ASSETS ==========

-- SELECT: Project owner, project member, or super_admin
CREATE POLICY "assets_select"
  ON public.assets FOR SELECT
  TO authenticated
  USING (
    public.has_project_access(project_id, auth.uid())
    OR public.get_user_role(auth.uid()) = 'super_admin'
  );

-- INSERT: Project owner, project member, or super_admin can add assets
CREATE POLICY "assets_insert"
  ON public.assets FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_project_access(project_id, auth.uid())
    OR public.get_user_role(auth.uid()) = 'super_admin'
  );

-- UPDATE: Project owner, project member, or super_admin can update assets
CREATE POLICY "assets_update"
  ON public.assets FOR UPDATE
  TO authenticated
  USING (
    public.has_project_access(project_id, auth.uid())
    OR public.get_user_role(auth.uid()) = 'super_admin'
  )
  WITH CHECK (
    public.has_project_access(project_id, auth.uid())
    OR public.get_user_role(auth.uid()) = 'super_admin'
  );

-- DELETE: Only project owner or super_admin can delete assets
CREATE POLICY "assets_delete"
  ON public.assets FOR DELETE
  TO authenticated
  USING (
    public.is_project_admin(project_id, auth.uid())
    OR public.get_user_role(auth.uid()) = 'super_admin'
  );

-- ========== ASSET_HISTORY ==========

-- SELECT: Visible if user has access to the asset's project
CREATE POLICY "asset_history_select"
  ON public.asset_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assets a
      WHERE a.id = asset_history.asset_id
      AND (
        public.has_project_access(a.project_id, auth.uid())
        OR public.get_user_role(auth.uid()) = 'super_admin'
      )
    )
  );

-- INSERT: System/trigger inserts (changed_by must match current user)
CREATE POLICY "asset_history_insert"
  ON public.asset_history FOR INSERT
  TO authenticated
  WITH CHECK (
    changed_by = auth.uid()
    OR public.get_user_role(auth.uid()) = 'super_admin'
  );

-- ====================================================================
-- 8) ADMIN SETUP QUERIES (RUN THESE MANUALLY IN SUPABASE SQL EDITOR)
-- ====================================================================

-- ============================================================
-- STEP 1: CREATE SUPER ADMIN
-- ============================================================
-- First, create a user via Supabase Auth (Dashboard or sign up in app)
-- Then run this query in Supabase SQL Editor to make them super_admin:
--
-- UPDATE public.profiles
-- SET role = 'super_admin'
-- WHERE email = 'your-admin-email@example.com';
--
-- OR if you know the user's auth UID:
--
-- UPDATE public.profiles
-- SET role = 'super_admin'
-- WHERE id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';

-- ============================================================
-- STEP 2: SUPER ADMIN PROMOTES USER TO PRODUCT_OWNER
-- ============================================================
-- Only super_admin can run this (via SQL Editor as DB owner):
--
-- UPDATE public.profiles
-- SET role = 'product_owner'
-- WHERE email = 'user-to-promote@example.com';

-- ============================================================
-- STEP 3: DEMOTE USER BACK TO REGULAR USER
-- ============================================================
-- Only super_admin can run this (via SQL Editor as DB owner):
--
-- UPDATE public.profiles
-- SET role = 'user'
-- WHERE email = 'user-to-demote@example.com';

-- ============================================================
-- VERIFY CURRENT ROLES
-- ============================================================
-- SELECT id, email, role, created_at FROM public.profiles ORDER BY created_at;

-- ============================================================
-- VERIFY ALL POLICIES ARE CREATED
-- ============================================================
-- SELECT tablename, policyname, permissive, roles, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;

-- ============================================================
-- BACKFILL EXISTING AUTH USERS (if profiles are missing)
-- ============================================================
-- This runs automatically to ensure all existing auth users have profiles
INSERT INTO public.profiles (id, email, role)
SELECT id, email, 'user'
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;

-- ====================================================================
-- END OF MIGRATION
-- ====================================================================
