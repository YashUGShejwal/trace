# Supabase Database Setup Guide for Trace

This guide will walk you through setting up the Supabase database for the Trace project from scratch.

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Create Supabase Project](#create-supabase-project)
3. [Run Database Migrations](#run-database-migrations)
4. [Configure Environment Variables](#configure-environment-variables)
5. [Verify Setup](#verify-setup)
6. [Understanding the Database Schema](#understanding-the-database-schema)
7. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have:

- [ ] A Supabase account (sign up at [supabase.com](https://supabase.com))
- [ ] Node.js installed (v18 or higher)
- [ ] Supabase CLI installed (optional but recommended)

### Install Supabase CLI (Optional)

```bash
npm install -g supabase
```

---

## Create Supabase Project

### Step 1: Create a New Project

1. Go to [app.supabase.com](https://app.supabase.com)
2. Click **"New Project"**
3. Fill in the details:
   - **Name:** `trace` (or your preferred name)
   - **Database Password:** Choose a strong password (save this!)
   - **Region:** Select the closest region to your users
   - **Pricing Plan:** Free tier is sufficient to start
4. Click **"Create new project"**
5. Wait 2-3 minutes for Supabase to provision your database

### Step 2: Get Your API Credentials

1. Once your project is ready, go to **Settings** → **API**
2. Copy the following values (you'll need these later):
   - **Project URL:** `https://your-project-id.supabase.co`
   - **Project API keys** → **anon/public:** `eyJhbGci...`
   - **Project Reference ID:** `your-project-id`

---

## Run Database Migrations

You have two options to run migrations:

### Option A: Using Supabase Dashboard (Recommended for Beginners)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor** in the left sidebar
3. Click **"New Query"**
4. Open the migration file: `supabase/migrations/00000000000000_complete_setup.sql`
5. Copy the entire content and paste it into the SQL Editor
6. Click **"Run"** (or press Ctrl/Cmd + Enter)
7. Wait for the migration to complete (you should see "Success. No rows returned")

### Option B: Using Supabase CLI (Advanced)

1. Link your local project to Supabase:
   ```bash
   supabase link --project-ref your-project-id
   ```
   - Enter your database password when prompted

2. Push migrations to Supabase:
   ```bash
   supabase db push
   ```

3. Verify migrations were applied:
   ```bash
   supabase migration list
   ```

---

## Configure Environment Variables

### Step 1: Create `.env` File

In your project root directory, create a `.env` file:

```bash
# Navigate to project root
cd C:\Codes\trace

# Create .env file (Windows)
type nul > .env
```

### Step 2: Add Supabase Credentials

Open `.env` and add your Supabase credentials:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_SUPABASE_PROJECT_ID=your-project-id
```

**⚠️ Important:**
- Replace `your-project-id` with your actual Supabase project ID
- Replace the `PUBLISHABLE_KEY` with your actual anon/public key
- **NEVER** commit `.env` to version control
- The `.env` file should already be in `.gitignore`

---

## Verify Setup

### Step 1: Verify Tables Were Created

1. Go to **Table Editor** in Supabase dashboard
2. You should see the following tables:
   - ✅ `projects`
   - ✅ `assets`
   - ✅ `profiles`
   - ✅ `project_members`
   - ✅ `asset_history`

### Step 2: Verify RLS Policies

1. Click on any table (e.g., `projects`)
2. Go to the **Policies** tab
3. You should see policies like:
   - "Authenticated users can create projects"
   - "Users can view their own projects or projects they are members of"
   - etc.

### Step 3: Test Authentication

1. Go to **Authentication** → **Users** in Supabase dashboard
2. Click **"Add user"** → **"Create new user"**
3. Enter a test email and password
4. Click **"Create user"**
5. Verify the user appears in the users list
6. Check the `profiles` table - a profile should be auto-created for this user

### Step 4: Test the Application

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Navigate to `http://localhost:5173/auth`

3. Try to sign in with the test user you created

4. Once logged in, try creating a project:
   - You should be able to create a project without any errors
   - The project should appear in the `projects` table in Supabase

---

## Understanding the Database Schema

### Tables Overview

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `projects` | Stores project information | `id`, `user_id`, `name`, `description` |
| `assets` | Stores asset/file tracking data | `id`, `project_id`, `name`, `file_path`, `status`, `assigned_to` |
| `profiles` | Extended user information | `id`, `email`, `nickname`, `avatar_url` |
| `project_members` | Team collaboration - links users to projects | `id`, `project_id`, `user_id` |
| `asset_history` | Audit log for asset status changes | `id`, `asset_id`, `changed_by`, `old_status`, `new_status` |

### Key Features Implemented

1. **Row Level Security (RLS)**
   - All tables are protected by RLS policies
   - Users can only access data they own or are members of
   - Prevents unauthorized data access

2. **Automatic Profile Creation**
   - When a user signs up, a profile is automatically created
   - Handled by database trigger on `auth.users`

3. **Asset History Tracking**
   - Status changes are automatically logged
   - Handled by database trigger on `assets` table
   - Provides full audit trail

4. **Team Collaboration**
   - Project owners can invite team members
   - Members can view and edit assets in shared projects
   - Controlled through `project_members` table

### Database Diagram

```
┌──────────────┐
│  auth.users  │ (Supabase managed)
└──────┬───────┘
       │
       ├─────────────────────────────────────┐
       │                                     │
       ▼                                     ▼
┌──────────────┐                      ┌──────────────┐
│   profiles   │                      │   projects   │
│──────────────│                      │──────────────│
│ id (PK)      │                      │ id (PK)      │
│ email        │                      │ user_id (FK) │
│ nickname     │                      │ name         │
│ avatar_url   │                      │ description  │
└──────────────┘                      └──────┬───────┘
                                             │
                    ┌────────────────────────┼────────────────────┐
                    │                        │                    │
                    ▼                        ▼                    ▼
           ┌──────────────────┐      ┌──────────────┐    ┌──────────────────┐
           │ project_members  │      │    assets    │    │  asset_history   │
           │──────────────────│      │──────────────│    │──────────────────│
           │ id (PK)          │      │ id (PK)      │    │ id (PK)          │
           │ project_id (FK)  │      │ project_id(FK)    │ asset_id (FK)    │
           │ user_id (FK)     │      │ name         │    │ changed_by (FK)  │
           └──────────────────┘      │ file_path    │    │ old_status       │
                                     │ status       │    │ new_status       │
                                     │ assigned_to  │    └──────────────────┘
                                     │ folder       │
                                     │ notes        │
                                     │ revision_count│
                                     └──────────────┘
```

---

## Troubleshooting

### Issue: "new row violates row-level security policy"

**Cause:** The RLS policy is blocking your insert/update operation.

**Solution:**
1. Make sure you've run the latest migration (`00000000000000_complete_setup.sql`)
2. Verify you're logged in (check `supabase.auth.getUser()`)
3. Check that `user_id` matches the authenticated user's ID
4. For creating projects, verify your profile has role = 'product_owner' or 'super_admin'

### Issue: "relation 'profiles' does not exist"

**Cause:** The migration hasn't been run or failed.

**Solution:**
1. Go to **SQL Editor** in Supabase dashboard
2. Run this query to check if tables exist:
   ```sql
   SELECT table_name 
   FROM information_schema.tables 
   WHERE table_schema = 'public';
   ```
3. If `profiles` is missing, re-run the migration

### Issue: "Failed to fetch" or CORS errors

**Cause:** Incorrect Supabase URL or the project isn't accessible.

**Solution:**
1. Verify your `.env` file has the correct `VITE_SUPABASE_URL`
2. Make sure your Supabase project is active (not paused)
3. Check Supabase dashboard for any service issues

### Issue: Can't see other users' profiles

**Cause:** The RLS policy allows viewing but profiles might not exist.

**Solution:**
1. Verify the auto-profile-creation trigger is active:
   ```sql
   SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
   ```
2. Manually backfill profiles:
   ```sql
   INSERT INTO public.profiles (id, email)
   SELECT id, email FROM auth.users
   WHERE id NOT IN (SELECT id FROM public.profiles)
   ON CONFLICT (id) DO NOTHING;
   ```

### Issue: "permission denied for table users"

**Cause:** Trying to query `auth.users` table directly (which is protected).

**Solution:**
- Use the `profiles` table instead, which mirrors user data
- Or use Supabase's `supabase.auth.admin.listUsers()` (server-side only)

### Issue: Project members can't see projects

**Cause:** Old RLS policies that only check ownership.

**Solution:**
- Ensure you've run the new migration that includes member-based policies
- The policies should check both `user_id = auth.uid()` AND membership in `project_members`

---

## Next Steps

After completing the database setup:

1. ✅ Create a test user account
2. ✅ Create a test project
3. ✅ Import some test assets
4. ✅ Invite a team member (create another test user)
5. ✅ Test asset status changes
6. ✅ Verify asset history is being logged

---

## Need Help?

- **Supabase Docs:** [supabase.com/docs](https://supabase.com/docs)
- **Supabase Discord:** [discord.supabase.com](https://discord.supabase.com)
- **Project Issues:** Check `CODE_REVIEW.md` for known issues

---

## Security Checklist

Before deploying to production:

- [ ] Remove real credentials from `.env.example`
- [ ] Verify `.env` is in `.gitignore`
- [ ] Enable email confirmations in Supabase Auth settings
- [ ] Set up email templates for password reset
- [ ] Configure allowed redirect URLs in Supabase Auth
- [ ] Enable captcha for sign-up (optional)
- [ ] Set up database backups
- [ ] Review and test all RLS policies
- [ ] Enable Supabase database logs
- [ ] Set up monitoring and alerts

---

*Last Updated: January 18, 2026*
