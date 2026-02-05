import React, { useState } from "react";
import { Settings, UserPlus, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { friendlyError } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ProjectSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  projectOwnerId: string;
  currentUserId: string;
  onProjectDeleted: () => void;
}

interface ProjectMemberWithProfile {
  id: string;
  user_id: string;
  email: string | null;
  nickname: string | null;
  role: "member" | "project_owner";
}

interface ProfileOption {
  id: string;
  email: string | null;
  nickname: string | null;
}

export const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName,
  projectOwnerId,
  currentUserId,
  onProjectDeleted,
}) => {
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch project members with profiles
  const { data: members = [], isLoading: loadingMembers, refetch: refetchMembers } = useQuery({
    queryKey: ["project-settings-members", projectId],
    queryFn: async () => {
      // Get project members
      const { data: memberData, error: memberError } = await supabase
        .from("project_members")
        .select("id, user_id, role")
        .eq("project_id", projectId);

      if (memberError) throw memberError;

      // Fetch profiles for each member
      const membersWithProfiles: ProjectMemberWithProfile[] = [];
      
      for (const member of memberData || []) {
        const { data: profile } = await (supabase as any)
          .from("profiles")
          .select("email, nickname")
          .eq("id", member.user_id)
          .single();

        membersWithProfiles.push({
          id: member.id,
          user_id: member.user_id,
          email: profile?.email || null,
          nickname: profile?.nickname || null,
          role: member.role as "member" | "project_owner",
        });
      }

      return membersWithProfiles;
    },
    enabled: isOpen,
  });

  // Fetch all users (sorted by email) for selection list
  const { data: allUsers = [], isLoading: loadingAllUsers } = useQuery<ProfileOption[]>({
    queryKey: ["all-users-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, nickname")
        .order("email", { ascending: true });

      if (error) throw error;
      return data as ProfileOption[];
    },
    enabled: isOpen,
  });

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleAddSelectedMembers = async () => {
    if (selectedUsers.length === 0) {
      toast({
        title: "No Users Selected",
        description: "Pick at least one user to add to the project.",
        variant: "destructive",
      });
      return;
    }

    const rows = selectedUsers.map((uid) => ({ project_id: projectId, user_id: uid, role: "member" }));

    const { error: insertError } = await supabase.from("project_members").insert(rows);

    if (insertError) {
      toast({
        title: "Error Adding Members",
        description: friendlyError(insertError.message),
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Members Added",
      description: `${selectedUsers.length} member${selectedUsers.length > 1 ? "s" : ""} added to the project`,
    });

    setSelectedUsers([]);
    setUserSearch("");
    refetchMembers();
    queryClient.invalidateQueries({ queryKey: ["project-members"] });
  };

  const existingMemberIds = new Set<string>([projectOwnerId, ...members.map((m) => m.user_id)]);
  const filteredUsers = (allUsers || [])
    .filter((u) => u.email)
    .filter((u) => !existingMemberIds.has(u.id))
    .filter((u) => {
      if (!userSearch.trim()) return true;
      const q = userSearch.toLowerCase();
      return (
        (u.email || "").toLowerCase().includes(q) ||
        (u.nickname || "").toLowerCase().includes(q)
      );
    });

  const handleRemoveMember = async (memberId: string, memberEmail: string | null) => {
    const { error } = await supabase
      .from("project_members")
      .delete()
      .eq("id", memberId);

    if (error) {
      toast({
        title: "Error Removing Member",
        description: friendlyError(error.message),
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Member Removed",
      description: `${memberEmail || "Member"} has been removed from the project`,
    });

    refetchMembers();
    queryClient.invalidateQueries({ queryKey: ["project-members"] });
  };

  const handleRoleChange = async (memberId: string, nextRole: "member" | "project_owner") => {
    const { error } = await supabase
      .from("project_members")
      .update({ role: nextRole })
      .eq("id", memberId);

    if (error) {
      toast({
        title: "Error updating role",
        description: friendlyError(error.message),
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Role updated",
      description: `Member is now ${nextRole === "project_owner" ? "Project Owner" : "Member"}`,
    });

    refetchMembers();
    queryClient.invalidateQueries({ queryKey: ["project-members"] });
  };

  const handleDeleteProject = async () => {
    if (deleteConfirmText !== "delete") {
      toast({
        title: "Confirmation Required",
        description: 'Please type "delete" to confirm',
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", projectId);

    if (error) {
      toast({
        title: "Error Deleting Project",
        description: friendlyError(error.message),
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Project Deleted",
      description: `${projectName} has been permanently deleted`,
    });

    onProjectDeleted();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wider text-foreground flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            PROJECT SETTINGS - {projectName}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="team" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-secondary">
            <TabsTrigger value="team" className="font-display text-xs tracking-wider">
              TEAM MANAGEMENT
            </TabsTrigger>
            <TabsTrigger value="danger" className="font-display text-xs tracking-wider text-destructive">
              DANGER ZONE
            </TabsTrigger>
          </TabsList>

          {/* Team Management Tab */}
          <TabsContent value="team" className="space-y-4">
            <div className="command-border bg-card/50 rounded-sm p-4">
              <h3 className="font-display text-sm tracking-wider mb-4">
                CURRENT MEMBERS ({members.length})
              </h3>

              {loadingMembers ? (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  Loading members...
                </div>
              ) : members.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  No members yet
                </div>
              ) : (
                <div className="space-y-2">
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-2 border border-border rounded-sm hover:bg-secondary/20 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-primary" />
                        <span className="text-sm">
                          {member.nickname || member.email || "Unknown User"}
                        </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-sm border ${member.role === "project_owner" ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
                            {member.role === "project_owner" ? "Project Owner" : "Member"}
                          </span>
                        {member.user_id === projectOwnerId && (
                          <span className="text-xs text-primary font-mono">(Owner)</span>
                        )}
                      </div>

                      {member.user_id !== projectOwnerId && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="w-3 h-3 mr-1" />
                              Remove
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-card border-border">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="font-display tracking-wider">
                                REMOVE MEMBER
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Remove {member.nickname || member.email} from this project? Their
                                history will be preserved.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleRemoveMember(member.id, member.email)}
                                className="bg-destructive hover:bg-destructive/90"
                              >
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}

                      {member.user_id !== projectOwnerId && (
                        <div className="flex gap-2 ml-2">
                          {member.role === "member" ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleRoleChange(member.id, "project_owner")}
                            >
                              Make Project Owner
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRoleChange(member.id, "member")}
                            >
                              Demote to Member
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add Members Section */}
            <div className="command-border bg-card/50 rounded-sm p-4">
              <h3 className="font-display text-sm tracking-wider mb-3">ADD MEMBERS</h3>

              <div className="space-y-2">
                <Input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search users by email or name"
                  className="bg-input border-border"
                />
                <p className="text-xs text-muted-foreground">
                  Showing all users (alphabetical). Owner and existing members are hidden.
                </p>
              </div>

              <div className="mt-3 border border-border rounded-sm">
                <ScrollArea className="h-56">
                  {loadingAllUsers ? (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      Loading users...
                    </div>
                  ) : filteredUsers.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      No users found
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {filteredUsers.map((user) => {
                        const isSelected = selectedUsers.includes(user.id);
                        return (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => toggleUserSelection(user.id)}
                            className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-secondary/40 transition-colors ${isSelected ? "bg-secondary/60" : ""}`}
                          >
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">{user.email}</span>
                              {user.nickname && (
                                <span className="text-xs text-muted-foreground">{user.nickname}</span>
                              )}
                            </div>
                            <div
                              className={`w-4 h-4 rounded-sm border ${isSelected ? "bg-primary border-primary" : "border-border"}`}
                              aria-hidden
                            />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </div>

              <div className="flex items-center justify-between mt-3">
                <span className="text-xs text-muted-foreground">
                  Selected: {selectedUsers.length}
                </span>
                <Button
                  onClick={handleAddSelectedMembers}
                  disabled={selectedUsers.length === 0}
                  className="bg-primary hover:bg-primary/90"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add Selected
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Danger Zone Tab */}
          <TabsContent value="danger" className="space-y-4">
            <div className="command-border border-destructive bg-destructive/5 rounded-sm p-4">
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-display text-sm tracking-wider text-destructive mb-2">
                    DELETE PROJECT
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    This will permanently delete the project, all assets, and history. This action
                    cannot be undone.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="confirm-delete" className="text-xs text-muted-foreground">
                    Type <span className="font-mono font-bold">delete</span> to confirm
                  </Label>
                  <Input
                    id="confirm-delete"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="delete"
                    className="bg-input border-destructive"
                  />
                </div>

                <Button
                  onClick={handleDeleteProject}
                  disabled={deleteConfirmText !== "delete"}
                  className="w-full bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  DELETE PROJECT PERMANENTLY
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
