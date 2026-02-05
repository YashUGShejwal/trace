# Trace - Comprehensive Code Review & Bug Analysis

> **Last Updated:** January 16, 2026  
> **Project:** Trace - Asset Tracking & Project Management System  
> **Tech Stack:** Vite + React + TypeScript + Supabase + TailwindCSS

---

## 📋 Table of Contents

1. [Critical Security Issues](#-critical-security-issues)
2. [Frontend Issues](#-frontend-issues-reactui)
3. [Backend Issues](#-backend-issues-supabaseapi)
4. [Database Issues](#-database-issues)
5. [TypeScript & Code Quality](#-typescript--code-quality-issues)
6. [Performance Issues](#-performance-issues)
7. [Improvement Recommendations](#-improvement-recommendations)

---

## 🔴 Critical Security Issues

### 1. **Exposed API Credentials in `.env.example`**
| Severity | File | Line |
|----------|------|------|
| 🚨 CRITICAL | `.env.example` | 1-4 |

**Issue:** Real Supabase credentials (URL, anon key, project ID) are committed to version control. Even though it's an "example" file, these are actual working credentials.

**Current Code:**
```env
VITE_SUPABASE_PROJECT_ID="mctzclonjsmqebznayll"
VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
VITE_SUPABASE_URL="https://mctzclonjsmqebznayll.supabase.co"
```

**Fix:** Replace with placeholder values:
```env
VITE_SUPABASE_PROJECT_ID="your-project-id"
VITE_SUPABASE_PUBLISHABLE_KEY="your-anon-key"
VITE_SUPABASE_URL="https://your-project-id.supabase.co"
```

**Impact:** Anyone with access to repo can access your Supabase project.

---

### 2. **Missing Environment Variable Validation**
| Severity | File | Line |
|----------|------|------|
| 🔴 HIGH | `src/integrations/supabase/client.ts` | 5-7 |

**Issue:** No validation that Supabase environment variables are defined before use.

**Current Code:**
```typescript
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {...});
```

**Fix:**
```typescript
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    'Missing Supabase environment variables. Please check your .env file.'
  );
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {...});
```

---

### 3. **Client-Side RBAC Only**
| Severity | File | Line |
|----------|------|------|
| 🔴 HIGH | `src/components/AssetTable/AssetRow.tsx` | 91-118 |

**Issue:** Role-based access control is implemented client-side only. Malicious users can bypass restrictions by calling Supabase directly using the exposed anon key.

**Impact:** Any user could modify assets in projects they shouldn't have access to.

**Fix:** Implement server-side RLS policies (see Database Issues section).

---

## 🟡 Frontend Issues (React/UI)

### Bug #1: **Missing Error Handler in Promise Chain**
| Severity | File | Line |
|----------|------|------|
| 🟡 MEDIUM | `src/components/AssetTable.tsx` | 43-49 |

**Issue:** Dynamic import inside `useEffect` lacks error handling.

**Current Code:**
```typescript
useEffect(() => {
  import("@/integrations/supabase/client").then(({ supabase }) => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) {
        setUserEmail(data.user.email);
      }
    });
  });
}, []);
```

**Fix:**
```typescript
useEffect(() => {
  import("@/integrations/supabase/client")
    .then(({ supabase }) => {
      return supabase.auth.getUser();
    })
    .then(({ data }) => {
      if (data.user?.email) {
        setUserEmail(data.user.email);
      }
    })
    .catch((error) => {
      console.error("Failed to get user:", error);
    });
}, []);
```

---

### Bug #2: **Notes Save Without Await or Error Handling**
| Severity | File | Line |
|----------|------|------|
| 🟡 MEDIUM | `src/components/AssetTable/AssetRow.tsx` | 135-144 |

**Issue:** `handleNotesSave` doesn't await the Supabase update and has no error handling.

**Current Code:**
```typescript
const handleNotesSave = async () => {
  await supabase
    .from("assets")
    .update({ notes: notesValue || null })
    .eq("id", asset.id);
  
  setEditingNotes(false);
  setNotesValue("");
};
```

**Fix:**
```typescript
const handleNotesSave = async () => {
  const { error } = await supabase
    .from("assets")
    .update({ notes: notesValue || null })
    .eq("id", asset.id);

  if (error) {
    toast({
      title: "Failed to save notes",
      description: error.message,
      variant: "destructive",
    });
    return;
  }
  
  setEditingNotes(false);
  setNotesValue("");
};
```

---

### Bug #3: **Duplicate Toast Systems**
| Severity | File | Line |
|----------|------|------|
| 🟠 LOW | `src/App.tsx` | 1-3, 16-17 |

**Issue:** Both `Toaster` (from `@/components/ui/toaster`) and `Sonner` are rendered. This causes potential duplicate notifications.

**Current Code:**
```tsx
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
// ...
<Toaster />
<Sonner />
```

**Fix:** Choose one toast system and remove the other.

---

### Bug #4: **Duplicate `use-toast` Files**
| Severity | Files |
|----------|-------|
| 🟠 LOW | `src/hooks/use-toast.ts` & `src/components/ui/use-toast.ts` |

**Issue:** Two identical `use-toast` files exist. This can cause import confusion.

**Fix:** Remove `src/components/ui/use-toast.ts` and update imports to use `@/hooks/use-toast`.

---

### Bug #5: **Missing Loading State in ImportStructure**
| Severity | File |
|----------|------|
| 🟠 LOW | `src/components/ImportStructure.tsx` |

**Issue:** No loading indicator while importing potentially large asset lists.

**Fix:** Add a loading state and spinner during import operations.

---

### Bug #6: **No Auth Guard at Router Level**
| Severity | File | Line |
|----------|------|------|
| 🟡 MEDIUM | `src/App.tsx` | 21 |

**Issue:** `/dashboard` route has no authentication guard at router level. Relies on component-level redirect which shows flash of content.

**Fix:** Create a `ProtectedRoute` component:
```tsx
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthenticated(!!session);
      setLoading(false);
      if (!session) navigate("/auth");
    });
  }, []);

  if (loading) return <LoadingSpinner />;
  return authenticated ? children : null;
};
```

---

### Bug #7: **Missing React Error Boundary**
| Severity | File |
|----------|------|
| 🟡 MEDIUM | `src/App.tsx` |

**Issue:** No Error Boundary to catch and display errors gracefully. Unhandled errors crash the entire app.

**Fix:** Add an Error Boundary component wrapping routes.

---

### Bug #8: **Accessibility Issues in FolderNode**
| Severity | File |
|----------|------|
| 🟠 LOW | `src/components/AssetTable/FolderNode.tsx` |

**Issue:** Folder checkbox buttons lack proper `aria-label` and keyboard navigation.

**Fix:** Add proper ARIA attributes and keyboard event handlers.

---

### Bug #9: **Unused NavLink Component**
| Severity | File |
|----------|------|
| 🟢 INFO | `src/components/NavLink.tsx` |

**Issue:** Component is defined but never used in the application.

**Fix:** Either implement it or remove the dead code.

---

## 🔵 Backend Issues (Supabase/API)

### Bug #1: **N+1 Query Problem**
| Severity | Files |
|----------|-------|
| 🔴 HIGH | `src/components/ProjectSettingsModal.tsx`, `src/hooks/useAssetHistory.ts` |

**Issue:** Sequential queries for each profile inside loops.

**Current Code (ProjectSettingsModal.tsx:64-77):**
```typescript
for (const member of memberData || []) {
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("email, nickname")
    .eq("id", member.user_id)
    .single();
  // ...
}
```

**Fix:** Use a single `.in()` query:
```typescript
const userIds = memberData?.map(m => m.user_id) || [];
const { data: profiles } = await supabase
  .from("profiles")
  .select("id, email, nickname")
  .in("id", userIds);

const profileMap = new Map(profiles?.map(p => [p.id, p]));
```

---

### Bug #2: **Type Assertion Abuse (`as any`)**
| Severity | Files | Count |
|----------|-------|-------|
| 🟡 MEDIUM | Multiple | 6 instances |

**Issue:** Extensive use of `(supabase as any)` bypasses TypeScript type checking, potentially hiding runtime errors.

**Locations:**
- `src/pages/Dashboard.tsx` (line ~178, ~189)
- `src/components/ProjectSettingsModal.tsx` (line ~71)
- `src/hooks/useProjectMembers.ts`

**Fix:** Update `src/integrations/supabase/types.ts` to include the `profiles` table properly, or create proper type definitions.

---

### Bug #3: **Missing Transaction in createProject**
| Severity | File | Line |
|----------|------|------|
| 🟡 MEDIUM | `src/pages/Dashboard.tsx` | 136-199 |

**Issue:** `createProject` creates project then adds members in separate queries. If member add fails, orphan project remains.

**Fix:** Use Supabase stored procedure or handle rollback on error.

---

### Bug #4: **Only Current User's History Shows Email**
| Severity | File | Line |
|----------|------|------|
| 🟡 MEDIUM | `src/hooks/useAssetHistory.ts` | 42-67 |

**Issue:** Only resolves current user's profile. Other users show as "Unknown User" in history.

**Fix:** Batch fetch all unique `changed_by` user profiles:
```typescript
const uniqueUserIds = [...new Set(history.map(h => h.changed_by))];
const { data: profiles } = await supabase
  .from("profiles")
  .select("id, email, nickname")
  .in("id", uniqueUserIds);
```

---

## 💾 Database Issues

### Issue #1: **Incomplete RLS Policies for Team Members**
| Severity | File |
|----------|------|
| 🔴 HIGH | `supabase/migrations/20260114135931_*.sql` |

**Issue:** RLS policies only check project ownership (`projects.user_id = auth.uid()`), but there's no policy for project members. Team members added via `project_members` table cannot access projects.

**Current Policy:**
```sql
CREATE POLICY "Users can view assets of their projects"
ON public.assets
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = assets.project_id
    AND projects.user_id = auth.uid()
  )
);
```

**Fix:** Update policies to include project members:
```sql
CREATE OR REPLACE POLICY "Users can view assets of their projects"
ON public.assets
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = assets.project_id
    AND (
      projects.user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.project_members
        WHERE project_members.project_id = assets.project_id
        AND project_members.user_id = auth.uid()
      )
    )
  )
);
```

---

### Issue #2: **Missing Tables in Migration File**
| Severity | File |
|----------|------|
| 🟡 MEDIUM | Migration SQL |

**Issue:** The `profiles`, `project_members`, and `asset_history` tables are referenced in TypeScript types but not created in the migration file.

**Fix:** Add missing table creation SQL or ensure separate migration files exist.

---

### Issue #3: **Missing Database Indexes**
| Severity | File |
|----------|------|
| 🟡 MEDIUM | Migration SQL |

**Issue:** No indexes on frequently queried columns.

**Fix:** Add indexes:
```sql
CREATE INDEX idx_assets_project_id ON public.assets(project_id);
CREATE INDEX idx_project_members_project_id ON public.project_members(project_id);
CREATE INDEX idx_project_members_user_id ON public.project_members(user_id);
CREATE INDEX idx_asset_history_asset_id ON public.asset_history(asset_id);
CREATE INDEX idx_profiles_email ON public.profiles(email);
```

---

### Issue #4: **Inconsistent `assigned_to` Data Type**
| Severity | File |
|----------|------|
| 🟠 LOW | Migration SQL, types.ts |

**Issue:** `assigned_to` is `TEXT` storing emails. Should either:
- Be a UUID referencing `profiles`, or
- Stay as email but add proper validation

**Current:** Stores email strings, making joins complex.

---

## 📝 TypeScript & Code Quality Issues

### Issue #1: **TypeScript Strict Mode Disabled**
| Severity | File | Settings |
|----------|------|----------|
| 🟡 MEDIUM | `tsconfig.json` | Multiple |

**Disabled Settings:**
```json
{
  "noImplicitAny": false,
  "noUnusedParameters": false,
  "noUnusedLocals": false,
  "strictNullChecks": false
}
```

**Impact:** Many potential bugs can slip through without proper type checking.

**Fix:** Gradually enable strict mode settings.

---

### Issue #2: **Console Statements in Production**
| Severity | Files | Count |
|----------|-------|-------|
| 🟠 LOW | Multiple | 11+ instances |

**Issue:** `console.log` and `console.error` statements left in production code.

**Fix:** Use a proper logging service or remove/conditionally disable in production.

---

### Issue #3: **Duplicate Asset Interface Definitions**
| Severity | Files |
|----------|-------|
| 🟠 LOW | `Dashboard.tsx`, `AssetTable/types.ts`, `types.ts` |

**Issue:** `Asset` interface is defined in 3+ different places with slightly different fields.

**Fix:** Create a single source of truth in `src/types/asset.ts` and export from there.

---

### Issue #4: **Magic Numbers**
| Severity | File | Line |
|----------|------|------|
| 🟢 INFO | `src/components/ProjectHealthBar.tsx` | Various |

**Issue:** `0.5` for risk threshold and other magic numbers without constants.

**Fix:**
```typescript
const RISK_THRESHOLD = 0.5;
const HIGH_CHURN_THRESHOLD = 2;
```

---

### Issue #5: **Hardcoded Status Strings**
| Severity | Files |
|----------|-------|
| 🟠 LOW | Multiple |

**Issue:** Status values like `"pending"`, `"received"`, `"implemented"` are repeated throughout.

**Fix:** Create a constants file:
```typescript
export const ASSET_STATUS = {
  PENDING: 'pending',
  RECEIVED: 'received',
  IMPLEMENTED: 'implemented',
} as const;
```

---

## ⚡ Performance Issues

### Issue #1: **Large Bundle Size**
| Severity | File |
|----------|------|
| 🟡 MEDIUM | `package.json` |

**Issue:** 40+ Radix UI components imported. Many appear unused:
- `@radix-ui/react-carousel`
- `@radix-ui/react-menubar`
- `@radix-ui/react-navigation-menu`
- `@radix-ui/react-aspect-ratio`
- etc.

**Fix:** Remove unused packages or ensure tree-shaking is working:
```bash
npm uninstall @radix-ui/react-menubar @radix-ui/react-navigation-menu ...
```

---

### Issue #2: **No Pagination in Activity Log**
| Severity | File |
|----------|------|
| 🟠 LOW | `src/components/ProjectActivityLog.tsx` |

**Issue:** Limit is 100 but no pagination UI. Large projects will have truncated history.

**Fix:** Implement infinite scroll or pagination.

---

### Issue #3: **Unnecessary Re-renders**
| Severity | File |
|----------|------|
| 🟠 LOW | `src/pages/Dashboard.tsx` |

**Issue:** `fetchAssets` dependency in useEffect not memoized properly.

**Fix:** Use `useCallback` for data fetching functions.

---

## 🚀 Improvement Recommendations

### Immediate (Critical)
| Priority | Task |
|----------|------|
| 1 | Remove real credentials from `.env.example` |
| 2 | Add environment variable validation |
| 3 | Update RLS policies for project members |
| 4 | Add `.catch()` handlers to all promises |

### Short-term (1-2 weeks)
| Priority | Task |
|----------|------|
| 5 | Enable TypeScript strict mode gradually |
| 6 | Consolidate Asset type definitions |
| 7 | Fix N+1 query problems with batch queries |
| 8 | Add React Error Boundary |
| 9 | Implement route-level authentication guard |
| 10 | Remove unused Radix packages |
| 11 | Remove duplicate toast system |

### Medium-term (1 month)
| Priority | Task |
|----------|------|
| 12 | Implement proper logging service (replace console.log) |
| 13 | Add comprehensive test coverage (currently minimal) |
| 14 | Add pagination for activity logs |
| 15 | Implement loading states for all async operations |
| 16 | Add proper form validation with debounce |

### Long-term (Architecture)
| Priority | Task |
|----------|------|
| 17 | Implement server-side RBAC with proper RLS policies |
| 18 | Add database indexes for performance |
| 19 | Consider implementing Supabase Edge Functions for complex operations |
| 20 | Add CI/CD pipeline with automated testing |
| 21 | Implement proper state management (Zustand/Jotai) |
| 22 | Add monitoring and error tracking (Sentry) |

---

## 📊 Summary Statistics

| Category | Critical | High | Medium | Low | Info |
|----------|----------|------|--------|-----|------|
| Security | 1 | 2 | 0 | 0 | 0 |
| Frontend | 0 | 0 | 4 | 5 | 1 |
| Backend | 0 | 1 | 3 | 0 | 0 |
| Database | 0 | 1 | 2 | 1 | 0 |
| TypeScript | 0 | 0 | 2 | 3 | 1 |
| Performance | 0 | 0 | 1 | 2 | 0 |
| **Total** | **1** | **4** | **12** | **11** | **2** |

---

## 📁 Files Analyzed

| Category | Count |
|----------|-------|
| Pages | 4 |
| Components | 15+ |
| Hooks | 5 |
| Database/Supabase | 3 |
| Configuration | 5+ |
| **Total** | **32+** |

---

*Generated by Code Review Tool - January 16, 2026*
