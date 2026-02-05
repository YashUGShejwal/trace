import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface UserProfile {
  id: string;
  email: string | null;
  nickname: string | null;
  avatar_url: string | null;
  role?: "super_admin" | "product_owner" | "user";
  is_blacklisted?: boolean;
  created_at: string;
}

/**
 * Hook to fetch user profile from public.profiles
 */
export function useUserProfile(userId: string | null) {
  return useQuery({
    queryKey: ["user-profile", userId],
    queryFn: async () => {
      if (!userId) return null;

      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, nickname, avatar_url, role, is_blacklisted, created_at")
        .eq("id", userId)
        .single();

      if (error) {
        // Profile might not exist yet - this is okay
        console.log("Profile not found:", error);
        return null;
      }

      return data as UserProfile;
    },
    enabled: !!userId,
  });
}

/**
 * Hook to update user profile
 */
export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, nickname }: { userId: string; nickname: string }) => {
      // First check if profile exists
      const { data: existing } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .single();

      if (existing) {
        // Update existing profile
        const { data, error } = await supabase
          .from("profiles")
          .update({ nickname })
          .eq("id", userId)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Create new profile (get email from auth.users)
        const { data: { user } } = await supabase.auth.getUser();
        
        const { data, error } = await supabase
          .from("profiles")
          .insert({
            id: userId,
            email: user?.email || null,
            nickname,
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: (data) => {
      // Invalidate user profile query
      queryClient.invalidateQueries({ queryKey: ["user-profile", data.id] });
      // Invalidate project members query to refresh nicknames
      queryClient.invalidateQueries({ queryKey: ["project-members"] });
      queryClient.invalidateQueries({ queryKey: ["project-members-simple"] });
    },
  });
}

/**
 * Get display name (nickname or email)
 */
export function getDisplayName(profile: UserProfile | null, fallbackEmail?: string): string {
  if (profile?.nickname) {
    return profile.nickname;
  }
  if (profile?.email) {
    return profile.email;
  }
  if (fallbackEmail) {
    return fallbackEmail;
  }
  return "Unknown User";
}
