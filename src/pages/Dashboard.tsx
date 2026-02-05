import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/utils";
import { ProjectHealthBar } from "@/components/ProjectHealthBar";
import { ImportStructure } from "@/components/ImportStructure";
import { AssetTable } from "@/components/AssetTable";
import { ProjectSelector } from "@/components/ProjectSelector";
import { ProjectStats } from "@/components/ProjectStats";
import { BulkStatusUpdate } from "@/components/BulkStatusUpdate";
import { UserProfileModal } from "@/components/UserProfileModal";
import { ProjectSettingsModal } from "@/components/ProjectSettingsModal";
import { ProjectActivityLog } from "@/components/ProjectActivityLog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Terminal, LogOut, Plus, Folder, UserCircle, Settings, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useUserProfile } from "@/hooks/useUserProfile";

interface Project {
  id: string;
  name: string;
  description: string | null;
  user_id: string;
  created_at: string;
}

interface Asset {
  id: string;
  project_id: string;
  name: string;
  file_path: string;
  folder: string | null;
  status: "pending" | "received" | "implemented";
  assigned_to: string | null;
  received_at: string | null;
  implemented_at: string | null;
  revision_count: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ProfileOption {
  id: string;
  email: string | null;
  nickname: string | null;
}

type ProjectMemberRole = "member" | "project_owner" | "none";

const Dashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [newProjectName, setNewProjectName] = useState("");
  const [inviteEmails, setInviteEmails] = useState("");
  const [allUsers, setAllUsers] = useState<ProfileOption[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [projectRole, setProjectRole] = useState<ProjectMemberRole>("none");
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: profile } = useUserProfile(user?.id || null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/auth");
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/auth");
      } else {
        fetchProjects();
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (createDialogOpen) {
      fetchAllUsers();
    } else {
      setSelectedUsers([]);
      setUserSearch("");
    }
  }, [createDialogOpen]);

  const fetchProjects = async () => {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Error fetching projects",
        description: friendlyError(error.message),
        variant: "destructive",
      });
    } else {
      setProjects(data || []);
      if (data && data.length > 0 && !selectedProject) {
        setSelectedProject(data[0]);
      }
    }
    setLoading(false);
  };

  const fetchAssets = async (projectId: string) => {
    const { data, error } = await supabase
      .from("assets")
      .select("*")
      .eq("project_id", projectId)
      .order("file_path", { ascending: true });

    if (error) {
      toast({
        title: "Error fetching assets",
        description: friendlyError(error.message),
        variant: "destructive",
      });
    } else {
      setAssets(data as Asset[] || []);
    }
  };

  const fetchAllUsers = async () => {
    setLoadingUsers(true);

    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, nickname")
      .order("email", { ascending: true });

    if (error) {
      toast({
        title: "Error loading users",
        description: friendlyError(error.message),
        variant: "destructive",
      });
    } else {
      setAllUsers((data as ProfileOption[]) || []);
    }

    setLoadingUsers(false);
  };

  useEffect(() => {
    if (selectedProject) {
      fetchAssets(selectedProject.id);
      fetchProjectRole(selectedProject.id);
    }
  }, [selectedProject]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const fetchProjectRole = async (projectId: string) => {
    if (!user) return;

    if (selectedProject && selectedProject.user_id === user.id) {
      setProjectRole("project_owner");
      return;
    }

    const { data, error } = await supabase
      .from("project_members")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .single();

    if (error || !data) {
      setProjectRole("none");
      return;
    }

    setProjectRole((data.role as ProjectMemberRole) || "member");
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const createProject = async () => {
    if (!newProjectName.trim() || !user) return;

    // Create the project first
    const { data, error } = await supabase
      .from("projects")
      .insert({ name: newProjectName.trim(), user_id: user.id })
      .select()
      .single();

    if (error) {
      toast({
        title: "Error creating project",
        description: friendlyError(error.message),
        variant: "destructive",
      });
      return;
    }

    const memberIdsToAdd = new Set<string>(selectedUsers);
    const invalidEmails: string[] = [];

    if (inviteEmails.trim()) {
      // Parse emails (split by comma, trim whitespace)
      const emailList = inviteEmails
        .split(",")
        .map(email => email.trim().toLowerCase())
        .filter(email => email.length > 0);

      // Deduplicate
      const uniqueEmails = Array.from(new Set(emailList));

      // Remove owner's email if present
      const membersToInvite = uniqueEmails.filter(email => email !== user.email?.toLowerCase());

      // Process each email
      for (const email of membersToInvite) {
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          invalidEmails.push(email);
          continue;
        }

        // Look up user in profiles table
        const { data: profile } = await (supabase as any)
          .from("profiles")
          .select("id")
          .eq("email", email)
          .single();

        if (profile) {
          memberIdsToAdd.add(profile.id);
        } else {
          invalidEmails.push(email);
        }
      }
    }

    let addedMembers = 0;

    // Always add creator as project_owner role row
    memberIdsToAdd.add(user.id);

    if (memberIdsToAdd.size > 0) {
      const memberRows = Array.from(memberIdsToAdd).map((uid) => ({
        project_id: data.id,
        user_id: uid,
        role: uid === user.id ? "project_owner" : "member",
      }));

      const { error: memberInsertError } = await supabase
        .from("project_members")
        .insert(memberRows);

      if (memberInsertError) {
        toast({
          title: "Error adding members",
          description: friendlyError(memberInsertError.message),
          variant: "destructive",
        });
      } else {
        addedMembers = memberRows.length;
      }
    }

    // Show success toast with invite results
    let description = `${newProjectName} has been created.`;
    if (addedMembers > 0) {
      description += ` ${addedMembers} member${addedMembers > 1 ? "s" : ""} added.`;
    }
    if (invalidEmails.length > 0) {
      toast({
        title: "Some emails not found",
        description: `These emails were not found: ${invalidEmails.join(", ")}`,
        variant: "destructive",
      });
    }

    toast({
      title: "Project Created",
      description,
    });

    setProjects([data, ...projects]);
    setSelectedProject(data);
    setProjectRole("project_owner");
    setNewProjectName("");
    setInviteEmails("");
    setSelectedUsers([]);
    setUserSearch("");
    setCreateDialogOpen(false);
  };

  const handleImportAssets = async (filePaths: string[]) => {
    if (!selectedProject || !user) return;

    const newAssets = filePaths.map((path) => {
      // Extract folder from path (everything before the last /)
      const lastSlashIndex = path.lastIndexOf("/");
      const folder = lastSlashIndex > 0 ? path.substring(0, lastSlashIndex) : null;

      return {
        project_id: selectedProject.id,
        name: path.split("/").pop() || path,
        file_path: path,
        folder: folder,
        status: "pending" as const,
      };
    });

    const { error } = await supabase.from("assets").insert(newAssets);

    if (error) {
      toast({
        title: "Import Failed",
        description: friendlyError(error.message),
        variant: "destructive",
      });
    } else {
      toast({
        title: "Import Complete",
        description: `${filePaths.length} assets have been imported.`,
      });
      fetchAssets(selectedProject.id);
    }
  };

  const handleStatusUpdate = async (
    assetId: string,
    newStatus: "pending" | "received" | "implemented"
  ) => {
    // Use functional state to get current asset
    const currentAsset = assets.find((a) => a.id === assetId);
    if (!currentAsset) return;

    const updates: Partial<Asset> = { status: newStatus };

    if (newStatus === "received") {
      updates.received_at = new Date().toISOString();
    } else if (newStatus === "implemented") {
      updates.implemented_at = new Date().toISOString();
    }

    // Check for backward transitions and increment revision_count
    // Note: The database trigger will also handle this, but we update local state
    const isBackwardTransition =
      (currentAsset.status === "implemented" && (newStatus === "received" || newStatus === "pending")) ||
      (currentAsset.status === "received" && newStatus === "pending");

    if (isBackwardTransition) {
      updates.revision_count = currentAsset.revision_count + 1;
    }

    const { error } = await supabase
      .from("assets")
      .update(updates)
      .eq("id", assetId);

    if (error) {
      toast({
        title: "Update Failed",
        description: friendlyError(error.message),
        variant: "destructive",
      });
    } else {
      // Refetch to get the latest data including any trigger updates
      if (selectedProject) {
        await fetchAssets(selectedProject.id);
      }
    }
  };

  const handleAssigneeUpdate = async (assetId: string, assignedTo: string) => {
    const { error } = await supabase
      .from("assets")
      .update({ assigned_to: assignedTo || null })
      .eq("id", assetId);

    if (error) {
      toast({
        title: "Update Failed",
        description: friendlyError(error.message),
        variant: "destructive",
      });
    } else {
      // Use functional setState to ensure we're working with latest state
      setAssets((prevAssets) =>
        prevAssets.map((asset) =>
          asset.id === assetId
            ? { ...asset, assigned_to: assignedTo || null, updated_at: new Date().toISOString() }
            : asset
        )
      );

      toast({
        title: "Assignment Updated",
        description: assignedTo
          ? `Task assigned to ${assignedTo}`
          : "Task unassigned",
      });
    }
  };

  const handleDeleteAsset = async (assetId: string) => {
    const { error } = await supabase
      .from("assets")
      .delete()
      .eq("id", assetId);

    if (error) {
      toast({
        title: "Delete Failed",
        description: friendlyError(error.message),
        variant: "destructive",
      });
    } else {
      // Use functional setState to ensure we're working with latest state
      setAssets((prevAssets) => prevAssets.filter((asset) => asset.id !== assetId));

      toast({
        title: "Asset Deleted",
        description: "The asset has been removed from tracking.",
      });
    }
  };

  const handleBulkStatusUpdate = async (
    assetIds: string[],
    newStatus: "pending" | "received" | "implemented"
  ) => {
    const updates: Partial<Asset> = { status: newStatus };

    if (newStatus === "received") {
      updates.received_at = new Date().toISOString();
    } else if (newStatus === "implemented") {
      updates.implemented_at = new Date().toISOString();
    }

    // Note: The database trigger will handle revision counting automatically
    // for backward transitions during bulk updates
    const { error } = await supabase
      .from("assets")
      .update(updates)
      .in("id", assetIds);

    if (error) {
      toast({
        title: "Bulk Update Failed",
        description: friendlyError(error.message),
        variant: "destructive",
      });
    } else {
      toast({
        title: "Bulk Update Complete",
        description: `${assetIds.length} assets updated to ${newStatus.toUpperCase()}.`,
      });
      // Refetch to get the latest data including any trigger updates
      fetchAssets(selectedProject!.id);
    }
  };

  const implementedCount = assets.filter((a) => a.status === "implemented").length;
  const healthPercentage = assets.length > 0 ? (implementedCount / assets.length) * 100 : 0;
  const isHighRisk = healthPercentage < 50 && assets.length > 0;

  const filteredUsers = allUsers
    .filter((u) => u.email)
    .filter((u) => u.id !== user?.id)
    .filter((u) => {
      if (!userSearch.trim()) return true;
      const q = userSearch.toLowerCase();
      return (
        (u.email || "").toLowerCase().includes(q) ||
        (u.nickname || "").toLowerCase().includes(q)
      );
    });

  const canManageProject = Boolean(
    selectedProject &&
    user &&
    (
      selectedProject.user_id === user.id ||
      projectRole === "project_owner" ||
      profile?.role === "super_admin"
    )
  );

  const canCreateProject = profile?.role === "product_owner" || profile?.role === "super_admin";

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-primary animate-pulse font-display tracking-widest">
          LOADING SYSTEMS...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background grid-pattern relative">
      <div className="absolute inset-0 scanlines pointer-events-none" />

      {/* Top Bar */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <Terminal className="w-8 h-8 text-primary" />
              <h1 className="text-2xl font-display font-bold text-primary text-glow-primary tracking-widest">
                TRACE
              </h1>
            </div>

            {/* User info and logout */}
            <div className="flex items-center gap-4">
              <span className="text-muted-foreground text-sm font-mono hidden sm:block">
                {user?.email}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setProfileModalOpen(true)}
                className="text-muted-foreground hover:text-primary transition-colors"
                title="User Settings"
              >
                <UserCircle className="w-5 h-5" />
              </Button>
              {profile?.role === "super_admin" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/admin-dashboard")}
                  className="text-primary hover:text-primary/80"
                  title="Admin Dashboard"
                >
                  <Shield className="w-4 h-4" />
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleSignOut}
                className="border-border hover:border-destructive hover:text-destructive transition-colors"
              >
                <LogOut className="w-4 h-4 mr-2" />
                LOGOUT
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        {/* Project Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <ProjectSelector
              projects={projects}
              selectedProject={selectedProject}
              onSelect={setSelectedProject}
            />

            {/* Settings always for project-level admin; new project only for global creator roles */}
            {canManageProject && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSettingsModalOpen(true)}
                className="text-muted-foreground hover:text-primary transition-colors"
                title="Project Settings"
              >
                <Settings className="w-4 h-4" />
              </Button>
            )}

            {canCreateProject && (
              <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    NEW PROJECT
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-card border-border">
                  <DialogHeader>
                    <DialogTitle className="font-display tracking-wider text-foreground">
                      Initialize New Project
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <Input
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder="Project codename..."
                        className="bg-input border-border"
                        onKeyDown={(e) => e.key === "Enter" && createProject()}
                      />
                    </div>
                    <div className="space-y-2">
                      <Input
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="Search existing users by email or name"
                        className="bg-input border-border"
                      />
                      <p className="text-xs text-muted-foreground">
                        Add existing members now. You're automatically set as the owner.
                      </p>
                    </div>
                    <div className="mt-2 border border-border rounded-sm">
                      <ScrollArea className="h-48">
                        {loadingUsers ? (
                          <div className="text-center py-4 text-muted-foreground text-sm">
                            Loading users...
                          </div>
                        ) : filteredUsers.length === 0 ? (
                          <div className="text-center py-4 text-muted-foreground text-sm">
                            No users found
                          </div>
                        ) : (
                          <div className="divide-y divide-border">
                            {filteredUsers.map((profile) => {
                              const isSelected = selectedUsers.includes(profile.id);
                              return (
                                <button
                                  key={profile.id}
                                  type="button"
                                  onClick={() => toggleUserSelection(profile.id)}
                                  className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-secondary/40 transition-colors ${isSelected ? "bg-secondary/60" : ""}`}
                                >
                                  <div className="flex flex-col">
                                    <span className="text-sm font-medium">{profile.email}</span>
                                    {profile.nickname && (
                                      <span className="text-xs text-muted-foreground">{profile.nickname}</span>
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
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Selected: {selectedUsers.length}</span>
                      <span>Selected members are added on create</span>
                    </div>
                    <Button
                      onClick={createProject}
                      className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      CREATE PROJECT
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}

          </div>

          {selectedProject && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">Global: {profile?.role || "user"}</span>
              <span className="hidden sm:block">•</span>
              <span className="font-mono">Project: {projectRole}</span>
            </div>
          )}

          <div className="flex items-center gap-3">
            {selectedProject && assets.length > 0 && (
              <BulkStatusUpdate assets={assets} onBulkUpdate={handleBulkStatusUpdate} />
            )}
            {selectedProject && (
              <ImportStructure onImport={handleImportAssets} />
            )}
          </div>
        </div>

        {/* Project Stats */}
        {selectedProject && assets.length > 0 && (
          <div className="mb-6">
            <ProjectStats assets={assets} />
          </div>
        )}

        {/* Project Health */}
        {selectedProject && (
          <ProjectHealthBar
            percentage={healthPercentage}
            isHighRisk={isHighRisk}
            totalAssets={assets.length}
            implementedAssets={implementedCount}
          />
        )}

        {/* Main Content Tabs */}
        {selectedProject && user ? (
          <div className="mt-6">
            <Tabs defaultValue="assets" className="w-full">
              <TabsList className="grid w-full max-w-md grid-cols-3 bg-secondary">
                <TabsTrigger
                  value="assets"
                  className="font-display text-xs tracking-wider data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  ASSETS
                </TabsTrigger>
                <TabsTrigger
                  value="overview"
                  className="font-display text-xs tracking-wider data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  OVERVIEW
                </TabsTrigger>
                <TabsTrigger
                  value="logs"
                  className="font-display text-xs tracking-wider data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  LOGS
                </TabsTrigger>
              </TabsList>

              {/* Assets Tab */}
              <TabsContent value="assets" className="mt-6">
                <AssetTable
                  assets={assets}
                  projectId={selectedProject.id}
                  projectOwnerId={selectedProject.user_id}
                  currentUserId={user.id}
                  onStatusUpdate={handleStatusUpdate}
                  onAssigneeUpdate={handleAssigneeUpdate}
                  onDeleteAsset={handleDeleteAsset}
                />
              </TabsContent>

              {/* Overview Tab */}
              <TabsContent value="overview" className="mt-6">
                <div className="space-y-6">
                  <div className="command-border bg-card/50 rounded-sm p-6">
                    <h3 className="font-display text-lg tracking-wider text-foreground mb-4">
                      PROJECT OVERVIEW
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground font-display tracking-wider">
                          TOTAL ASSETS
                        </div>
                        <div className="text-3xl font-display text-primary">
                          {assets.length}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground font-display tracking-wider">
                          COMPLETION RATE
                        </div>
                        <div className="text-3xl font-display text-success">
                          {healthPercentage.toFixed(0)}%
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground font-display tracking-wider">
                          STATUS
                        </div>
                        <div className={`text-3xl font-display ${isHighRisk ? 'text-destructive' : 'text-success'}`}>
                          {isHighRisk ? 'AT RISK' : 'ON TRACK'}
                        </div>
                      </div>
                    </div>
                  </div>
                  {assets.length > 0 && <ProjectStats assets={assets} />}
                </div>
              </TabsContent>

              {/* Logs Tab */}
              <TabsContent value="logs" className="mt-6">
                <ProjectActivityLog projectId={selectedProject.id} />
              </TabsContent>
            </Tabs>
          </div>
        ) : selectedProject ? (
          <div className="flex items-center justify-center py-10">
            <div className="text-muted-foreground">Loading user data...</div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Folder className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h2 className="text-xl font-display text-muted-foreground mb-2">
              NO PROJECT SELECTED
            </h2>
            <p className="text-muted-foreground/60 text-sm">
              Create a new project or select an existing one to begin tracking assets.
            </p>
          </div>
        )}
      </main>

      {/* User Profile Modal */}
      {user && (
        <UserProfileModal
          isOpen={profileModalOpen}
          onClose={() => setProfileModalOpen(false)}
          userId={user.id}
          userEmail={user.email || null}
        />
      )}

      {/* Project Settings Modal */}
      {selectedProject && user && (
        <ProjectSettingsModal
          isOpen={settingsModalOpen}
          onClose={() => setSettingsModalOpen(false)}
          projectId={selectedProject.id}
          projectName={selectedProject.name}
          projectOwnerId={selectedProject.user_id}
          currentUserId={user.id}
          onProjectDeleted={() => {
            setSelectedProject(null);
            fetchProjects();
          }}
        />
      )}
    </div>
  );
};

export default Dashboard;
