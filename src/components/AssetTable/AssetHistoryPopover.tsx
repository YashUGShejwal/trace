import React from "react";
import { History, ArrowRight, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { useAssetHistory, formatStatus, isBackwardTransition } from "@/hooks/useAssetHistory";

interface AssetHistoryPopoverProps {
  assetId: string;
}

export const AssetHistoryPopover: React.FC<AssetHistoryPopoverProps> = ({ assetId }) => {
  const { data: history = [], isLoading } = useAssetHistory(assetId);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
        >
          <History className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="bg-card border-border w-80" align="end">
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center gap-2 pb-2 border-b border-border">
            <History className="w-4 h-4 text-primary" />
            <h4 className="font-display text-sm tracking-wider text-foreground">
              HISTORY
            </h4>
            {history.length > 0 && (
              <span className="text-xs text-muted-foreground ml-auto">
                ({history.length} {history.length === 1 ? "change" : "changes"})
              </span>
            )}
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="text-center py-4 text-sm text-muted-foreground">
              Loading history...
            </div>
          )}

          {/* No History */}
          {!isLoading && history.length === 0 && (
            <div className="text-center py-4 text-sm text-muted-foreground">
              No status changes recorded yet
            </div>
          )}

          {/* History Timeline */}
          {!isLoading && history.length > 0 && (
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {history.map((entry, index) => {
                const isRework = isBackwardTransition(entry.old_status, entry.new_status);
                const timestamp = new Date(entry.created_at);

                return (
                  <div
                    key={entry.id}
                    className={`text-sm border-l-2 pl-3 py-2 ${
                      isRework ? "border-orange-500" : "border-border"
                    }`}
                  >
                    {/* Timestamp */}
                    <div className="text-xs text-muted-foreground mb-1">
                      {format(timestamp, "MMM d, yyyy")} at {format(timestamp, "HH:mm")}
                    </div>

                    {/* Status Change */}
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-xs font-semibold ${
                          entry.old_status === "pending"
                            ? "text-destructive"
                            : entry.old_status === "received"
                            ? "text-warning"
                            : "text-success"
                        }`}
                      >
                        {formatStatus(entry.old_status).toUpperCase()}
                      </span>
                      <ArrowRight className="w-3 h-3 text-muted-foreground" />
                      <span
                        className={`text-xs font-semibold ${
                          entry.new_status === "pending"
                            ? isRework
                              ? "text-orange-500"
                              : "text-destructive"
                            : entry.new_status === "received"
                            ? "text-warning"
                            : "text-success"
                        }`}
                      >
                        {formatStatus(entry.new_status).toUpperCase()}
                        {isRework && " (Rework)"}
                      </span>
                    </div>

                    {/* Changed By */}
                    <div className="text-xs text-muted-foreground">
                      by {entry.user_nickname || entry.user_email || "Unknown User"}
                    </div>

                    {/* Comment */}
                    {entry.comment && (
                      <div className="mt-1 flex items-start gap-2 text-xs text-muted-foreground">
                        <MessageSquare className="w-3 h-3 text-primary mt-0.5" />
                        <span>{entry.comment}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
