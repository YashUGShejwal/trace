import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { History, User, FileCode, ArrowRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ActivityLogEntry {
  id: string;
  asset_id: string;
  asset_name: string;
  asset_path: string;
  old_status: "pending" | "received" | "implemented";
  new_status: "pending" | "received" | "implemented";
  changed_by: string;
  changed_by_email: string | null;
  changed_by_nickname: string | null;
  created_at: string;
  change_sequence: number;
  comment?: string | null;
}

interface ProjectActivityLogProps {
  projectId: string;
}

export const ProjectActivityLog = ({ projectId }: ProjectActivityLogProps) => {
  const { data: logs = [], isLoading, error } = useQuery({
    queryKey: ["project-activity-log", projectId],
    queryFn: async () => {
      // Fetch asset_history for all assets in this project
      const { data: assets, error: assetsError } = await supabase
        .from("assets")
        .select("id, name, file_path")
        .eq("project_id", projectId);

      if (assetsError) {
        console.error("Error fetching assets for activity log:", assetsError);
        throw assetsError;
      }

      if (!assets || assets.length === 0) {
        return [];
      }

      const assetIds = assets.map(a => a.id);
      const assetNameMap = new Map(assets.map(a => [a.id, a.name]));
      const assetPathMap = new Map(assets.map(a => [a.id, a.file_path]));

      // Fetch history for all assets in this project
      const { data: history, error: historyError } = await supabase
        .from("asset_history")
        .select("*")
        .in("asset_id", assetIds)
        .order("created_at", { ascending: false })
        .limit(500); // keep generous history for export

      if (historyError) {
        console.error("Error fetching history:", historyError);
        throw historyError;
      }

      const historyEntries = history || [];
      const userIds = Array.from(new Set(historyEntries.map((h: any) => h.changed_by)));

      let profiles: Record<string, { email: string | null; nickname: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profileRows, error: profileError } = await supabase
          .from("profiles")
          .select("id, email, nickname")
          .in("id", userIds);

        if (profileError) {
          console.error("Error fetching profiles for activity log:", profileError);
        } else {
          profiles = (profileRows || []).reduce((acc: any, row: any) => {
            acc[row.id] = { email: row.email, nickname: row.nickname };
            return acc;
          }, {});
        }
      }

      // Assign sequence per asset (ascending time = earlier cycle number)
      const byAsset = new Map<string, any[]>();
      for (const entry of historyEntries) {
        if (!byAsset.has(entry.asset_id)) byAsset.set(entry.asset_id, []);
        byAsset.get(entry.asset_id)!.push(entry);
      }
      byAsset.forEach((list) => list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));

      const enrichedLogs: ActivityLogEntry[] = historyEntries.map((entry) => {
        const prof = profiles[entry.changed_by] || {};
        const sequence = (byAsset.get(entry.asset_id)?.findIndex((e) => e.id === entry.id) ?? 0) + 1;

        return {
          id: entry.id,
          asset_id: entry.asset_id,
          asset_name: assetNameMap.get(entry.asset_id) || "Unknown Asset",
          asset_path: assetPathMap.get(entry.asset_id) || "",
          old_status: entry.old_status,
          new_status: entry.new_status,
          changed_by: entry.changed_by,
          changed_by_email: prof.email || null,
          changed_by_nickname: prof.nickname || null,
          created_at: entry.created_at,
          change_sequence: sequence,
          comment: (entry as any).comment ?? null,
        };
      });

      return enrichedLogs;
    },
    enabled: !!projectId,
    staleTime: 60000, // Cache for 1 minute
  });

  const handleExportCsv = () => {
    if (!logs || logs.length === 0) return;

    const headers = [
      "timestamp",
      "asset",
      "file_path",
      "old_status",
      "new_status",
      "change_sequence",
      "changed_by",
      "comment",
    ];

    const escape = (val: string | null | undefined) => {
      const v = val ?? "";
      return '"' + String(v).replace(/"/g, '""') + '"';
    };

    const rows = logs
      .slice() // copy
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((row) => [
        format(new Date(row.created_at), "yyyy-MM-dd HH:mm:ss"),
        row.asset_name,
        row.asset_path,
        row.old_status,
        row.new_status,
        row.change_sequence,
        row.changed_by_email || row.changed_by_nickname || row.changed_by,
        row.comment || "",
      ].map(escape).join(","));

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `project-${projectId}-timeline.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getStatusColorClass = (status: string) => {
    switch (status) {
      case "pending":
        return "text-destructive font-mono uppercase";
      case "received":
        return "text-warning font-mono uppercase";
      case "implemented":
        return "text-success font-mono uppercase";
      default:
        return "text-muted-foreground font-mono uppercase";
    }
  };

  const getStatusChangeIndicator = (oldStatus: string, newStatus: string) => {
    const statusOrder = { pending: 0, received: 1, implemented: 2 };
    const isBackward = statusOrder[newStatus as keyof typeof statusOrder] < statusOrder[oldStatus as keyof typeof statusOrder];
    
    if (isBackward) {
      return <span className="text-orange-500 text-xs ml-2">(REWORK)</span>;
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-primary animate-pulse font-display tracking-widest">
          LOADING ACTIVITY LOG...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-destructive font-display tracking-wider">
          ERROR LOADING LOGS: {(error as Error).message}
        </div>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <History className="w-16 h-16 text-muted-foreground/30 mb-4" />
        <h2 className="text-xl font-display text-muted-foreground mb-2">
          NO ACTIVITY YET
        </h2>
        <p className="text-muted-foreground/60 text-sm">
          Status changes will appear here once team members start working on assets.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <History className="w-6 h-6 text-primary" />
        <h2 className="text-xl font-display tracking-wider text-foreground">
          PROJECT ACTIVITY LOG
        </h2>
        <span className="text-sm text-muted-foreground">
          ({logs.length} {logs.length === 1 ? "event" : "events"})
        </span>
        <div className="ml-auto">
          <Button
            size="sm"
            variant="outline"
            className="border-border"
            onClick={handleExportCsv}
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Activity Table */}
      <div className="command-border rounded-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent bg-secondary/50">
              <TableHead className="text-muted-foreground font-display text-xs tracking-wider">
                TIMESTAMP
              </TableHead>
              <TableHead className="text-muted-foreground font-display text-xs tracking-wider">
                USER
              </TableHead>
              <TableHead className="text-muted-foreground font-display text-xs tracking-wider">
                ASSET
              </TableHead>
              <TableHead className="text-muted-foreground font-display text-xs tracking-wider">
                FILE PATH
              </TableHead>
              <TableHead className="text-muted-foreground font-display text-xs tracking-wider">
                STATUS CHANGE
              </TableHead>
              <TableHead className="text-muted-foreground font-display text-xs tracking-wider">
                COMMENT
              </TableHead>
              <TableHead className="text-muted-foreground font-display text-xs tracking-wider">
                CHANGE #
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow 
                key={log.id} 
                className="border-border hover:bg-secondary/20 transition-colors"
              >
                {/* Timestamp */}
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {format(new Date(log.created_at), "MMM dd, yyyy HH:mm:ss")}
                </TableCell>

                {/* User */}
                <TableCell className="text-sm">
                  <div className="flex items-center gap-2">
                    <User className="w-3 h-3 text-muted-foreground" />
                    <span className="text-foreground">
                      {log.changed_by_nickname || log.changed_by_email || "Unknown User"}
                    </span>
                  </div>
                </TableCell>

                {/* Asset */}
                <TableCell className="text-sm">
                  <div className="flex items-center gap-2">
                    <FileCode className="w-3 h-3 text-primary" />
                    <span className="font-mono text-foreground">{log.asset_name}</span>
                  </div>
                </TableCell>

                {/* File Path */}
                <TableCell className="text-xs font-mono text-muted-foreground">
                  {log.asset_path || "-"}
                </TableCell>

                {/* Status Change */}
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className={getStatusColorClass(log.old_status)}>
                      {log.old_status}
                    </span>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    <span className={getStatusColorClass(log.new_status)}>
                      {log.new_status}
                    </span>
                    {getStatusChangeIndicator(log.old_status, log.new_status)}
                  </div>
                </TableCell>

                {/* Comment */}
                <TableCell className="text-xs text-muted-foreground">
                  {log.comment || "-"}
                </TableCell>

                {/* Change number per asset */}
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {log.change_sequence}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Footer Note */}
      <div className="text-xs text-muted-foreground text-center pt-4">
        Showing last {logs.length} {logs.length === 1 ? "activity" : "activities"} • 
        Updates refresh automatically
      </div>
    </div>
  );
};
