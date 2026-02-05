import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AssetHistoryEntry {
  id: string;
  asset_id: string;
  old_status: "pending" | "received" | "implemented";
  new_status: "pending" | "received" | "implemented";
  created_at: string;
  user_email?: string;
  user_nickname?: string | null;
  changed_by: string;
  comment?: string | null;
}

/**
 * Hook to fetch asset history with user email resolution
 * Since direct access to auth.users may be blocked by RLS,
 * this fetches history and attempts to resolve the changed_by UUID
 */
export function useAssetHistory(assetId: string | null) {
  return useQuery({
    queryKey: ["asset-history", assetId],
    queryFn: async () => {
      if (!assetId) return [];

      // Fetch asset history
      const { data: history, error } = await supabase
        .from("asset_history")
        .select("*")
        .eq("asset_id", assetId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching asset history:", error);
        return [];
      }

      if (!history || history.length === 0) {
        return [];
      }

      // Try to get current user to see if we can resolve at least their email and nickname
      const { data: { user } } = await supabase.auth.getUser();
      
      // Try to fetch profile for current user
      let currentUserProfile = null;
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("nickname")
          .eq("id", user.id)
          .single();
        currentUserProfile = profile;
      }

      // Enhance history with user emails and nicknames where possible
      const enhancedHistory = history.map((entry) => {
        const enhanced: AssetHistoryEntry = {
          ...entry,
          user_email: undefined,
          user_nickname: undefined,
          comment: (entry as any).comment ?? null,
        };

        // If the changed_by matches current user, add their email and nickname
        if (user && entry.changed_by === user.id) {
          enhanced.user_email = user.email || undefined;
          enhanced.user_nickname = currentUserProfile?.nickname || null;
        }

        return enhanced;
      });

      return enhancedHistory;
    },
    enabled: !!assetId,
  });
}

/**
 * Format status for display
 */
export function formatStatus(status: "pending" | "received" | "implemented"): string {
  const statusMap = {
    pending: "Pending",
    received: "Received",
    implemented: "Implemented",
  };
  return statusMap[status];
}

/**
 * Determine if a status change is a backward transition (rework)
 */
export function isBackwardTransition(
  oldStatus: "pending" | "received" | "implemented",
  newStatus: "pending" | "received" | "implemented"
): boolean {
  const statusOrder = { pending: 0, received: 1, implemented: 2 };
  return statusOrder[newStatus] < statusOrder[oldStatus];
}
