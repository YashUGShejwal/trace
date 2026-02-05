import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/utils";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Shield, Trash2 } from "lucide-react";

interface AdminProject {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  user_id: string;
  owner?: {
    email?: string | null;
    nickname?: string | null;
    role?: "super_admin" | "product_owner" | "user";
  } | null;
}

interface AdminUser {
  id: string;
  email: string | null;
  nickname: string | null;
  role: "super_admin" | "product_owner" | "user";
  is_blacklisted?: boolean;
  created_at: string;
}

interface AdminProjectRole {
  membership_id: string;
  project_id: string;
  project_name: string;
  user_id: string;
  user_email: string | null;
  user_nickname: string | null;
  role: "member" | "project_owner";
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const { data: profile } = useUserProfile(authUserId);
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [filterUserText, setFilterUserText] = useState("");
  const [projectRoles, setProjectRoles] = useState<AdminProjectRole[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        navigate("/auth");
        return;
      }
      setAuthUserId(session.user.id);
    });
  }, [navigate]);

  useEffect(() => {
    if (profile?.role === "super_admin") {
      loadProjects();
      loadUsers();
      loadProjectRoles();
    }
  }, [profile?.role]);

  const loadProjects = async () => {
    setLoadingProjects(true);
    const { data, error } = await supabase
      .from("projects")
      .select("id, name, description, created_at, user_id")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Error loading projects",
        description: friendlyError(error.message),
        variant: "destructive",
      });
      setLoadingProjects(false);
      return;
    }

    const projectsData = (data as AdminProject[]) || [];
    const ownerIds = Array.from(new Set(projectsData.map((p) => p.user_id).filter(Boolean)));

    if (ownerIds.length === 0) {
      setProjects(projectsData);
      setLoadingProjects(false);
      return;
    }

    const { data: owners, error: ownerError } = await supabase
      .from("profiles")
      .select("id, email, nickname, role")
      .in("id", ownerIds);

    if (ownerError) {
      toast({
        title: "Error loading owners",
        description: friendlyError(ownerError.message),
        variant: "destructive",
      });
      setProjects(projectsData);
      setLoadingProjects(false);
      return;
    }

    const ownerMap = new Map<string, { email?: string | null; nickname?: string | null; role?: AdminUser["role"]; }>();
    (owners || []).forEach((o: any) => {
      ownerMap.set(o.id, { email: o.email, nickname: o.nickname, role: o.role });
    });

    const projectsWithOwners = projectsData.map((p) => ({
      ...p,
      owner: ownerMap.get(p.user_id) || null,
    }));

    setProjects(projectsWithOwners);
    setLoadingProjects(false);
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, nickname, role, is_blacklisted, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Error loading users",
        description: friendlyError(error.message),
        variant: "destructive",
      });
    } else {
      setUsers((data as AdminUser[]) || []);
    }
    setLoadingUsers(false);
  };

  const handleRoleChange = async (userId: string, nextRole: AdminUser["role"]) => {
    const { error } = await supabase
      .from("profiles")
      .update({ role: nextRole })
      .eq("id", userId);

    if (error) {
      toast({
        title: "Role change failed",
        description: friendlyError(error.message),
        variant: "destructive",
      });
      return;
    }

    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role: nextRole } : u)));
    toast({ title: "Role updated", description: `User is now ${nextRole}` });
  };

  const handleBlacklist = async (userId: string, email: string | null, target: boolean) => {
    const reason = target ? "Blacklisted by admin" : "Unblacklisted by admin";
    const { error } = await supabase.rpc("set_blacklist_status", {
      p_target: userId,
      p_blacklisted: target,
      p_reason: reason,
    });

    if (error) {
      toast({
        title: target ? "Blacklist failed" : "Unblacklist failed",
        description: friendlyError(error.message),
        variant: "destructive",
      });
      return;
    }

    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, is_blacklisted: target } : u)));
    toast({
      title: target ? "User blacklisted" : "User unblacklisted",
      description: email || undefined,
    });
  };

  const handleDeleteProject = async (projectId: string, name: string) => {
    if (!window.confirm(`Delete project "${name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("projects").delete().eq("id", projectId);

    if (error) {
      toast({
        title: "Delete failed",
        description: friendlyError(error.message),
        variant: "destructive",
      });
      return;
    }

    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    toast({ title: "Project deleted", description: name });
  };

  const handleDeleteUser = async (userId: string, email: string | null) => {
    if (!window.confirm(`Delete user ${email || userId}? Their email will be blocked.`)) return;
    const { error } = await supabase.rpc("admin_delete_user", {
      p_target: userId,
      p_reason: "Removed by super admin",
    });

    if (error) {
      toast({
        title: "Delete failed",
        description: friendlyError(error.message),
        variant: "destructive",
      });
      return;
    }

    setUsers((prev) => prev.filter((u) => u.id !== userId));
    toast({ title: "User deleted & blocked", description: email || userId });
    loadProjectRoles();
  };

  const filteredUsers = useMemo(() => {
    if (!filterUserText.trim()) return users;
    const q = filterUserText.toLowerCase();
    return users.filter((u) =>
      (u.email || "").toLowerCase().includes(q) || (u.nickname || "").toLowerCase().includes(q)
    );
  }, [users, filterUserText]);

  const loadProjectRoles = async () => {
    const { data, error } = await supabase
      .from("project_members")
      .select("id, role, project_id, user_id, projects(name)")
      .order("project_id", { ascending: true });

    if (error) {
      toast({
        title: "Error loading project roles",
        description: friendlyError(error.message),
        variant: "destructive",
      });
      return;
    }

    const memberships = data || [];
    const userIds = Array.from(new Set(memberships.map((m: any) => m.user_id).filter(Boolean)));

    let profiles: Record<string, { email: string | null; nickname: string | null }> = {};
    if (userIds.length > 0) {
      const { data: profileRows, error: profileError } = await supabase
        .from("profiles")
        .select("id, email, nickname")
        .in("id", userIds);

      if (profileError) {
        toast({
          title: "Error loading member profiles",
          description: friendlyError(profileError.message),
          variant: "destructive",
        });
      } else {
        profiles = (profileRows || []).reduce((acc: any, row: any) => {
          acc[row.id] = { email: row.email, nickname: row.nickname };
          return acc;
        }, {});
      }
    }

    const mapped: AdminProjectRole[] = memberships.map((row: any) => {
      const prof = profiles[row.user_id] || {};
      return {
        membership_id: row.id,
        project_id: row.project_id,
        project_name: row.projects?.name || "",
        user_id: row.user_id,
        user_email: prof.email || null,
        user_nickname: prof.nickname || null,
        role: row.role,
      };
    });

    setProjectRoles(mapped);
  };

  const handleProjectRoleChange = async (
    membershipId: string,
    nextRole: AdminProjectRole["role"],
  ) => {
    const { error } = await supabase
      .from("project_members")
      .update({ role: nextRole })
      .eq("id", membershipId);

    if (error) {
      toast({
        title: "Role update failed",
        description: friendlyError(error.message),
        variant: "destructive",
      });
      return;
    }

    setProjectRoles((prev) =>
      prev.map((pr) =>
        pr.membership_id === membershipId ? { ...pr, role: nextRole } : pr,
      ),
    );

    toast({ title: "Project role updated", description: `Member is now ${nextRole}` });
  };

  if (!authUserId) {
    return null;
  }

  if (profile && profile.role !== "super_admin") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-center px-6">
        <AlertCircle className="w-10 h-10 text-destructive mb-4" />
        <h2 className="text-xl font-display mb-2">Access Denied</h2>
        <p className="text-muted-foreground mb-4">Super admin privileges are required.</p>
        <Button onClick={() => navigate("/dashboard")} variant="outline">
          Back to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background grid-pattern">
      <div className="absolute inset-0 scanlines pointer-events-none" />
      <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Super Admin</p>
              <h1 className="text-lg font-display tracking-wider">ADMIN DASHBOARD</h1>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => navigate("/dashboard")}>Back</Button>
            <Button variant="outline" onClick={() => loadProjects()}>Refresh</Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="projects" className="w-full">
          <TabsList className="bg-secondary">
            <TabsTrigger value="projects">Projects</TabsTrigger>
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="project-roles">Project Roles</TabsTrigger>
          </TabsList>

          <TabsContent value="projects" className="mt-4 space-y-4">
            <Card className="command-border bg-card/60">
              <CardHeader>
                <CardTitle>All Projects</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingProjects ? (
                  <div className="text-muted-foreground">Loading projects...</div>
                ) : projects.length === 0 ? (
                  <div className="text-muted-foreground">No projects found.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {projects.map((project) => (
                        <TableRow key={project.id}>
                          <TableCell>
                            <div className="font-medium">{project.name}</div>
                            <div className="text-xs text-muted-foreground">{project.description || "No description"}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{project.owner?.nickname || project.owner?.email || "Unknown"}</div>
                            {project.owner?.role && (
                              <Badge variant="secondary" className="text-[10px]">{project.owner.role}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(project.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteProject(project.id, project.name)}
                            >
                              <Trash2 className="w-4 h-4 mr-1" /> Delete
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="mt-4 space-y-4">
            <Card className="command-border bg-card/60">
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>All Users</CardTitle>
                <Input
                  value={filterUserText}
                  onChange={(e) => setFilterUserText(e.target.value)}
                  placeholder="Search users"
                  className="max-w-xs"
                />
              </CardHeader>
              <CardContent>
                {loadingUsers ? (
                  <div className="text-muted-foreground">Loading users...</div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-muted-foreground">No users found.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>
                            <div className="font-medium">{user.email || "Unknown"}</div>
                            <div className="text-xs text-muted-foreground">{user.nickname || "No nickname"}</div>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={user.role}
                              onValueChange={(val) => handleRoleChange(user.id, val as AdminUser["role"])}
                            >
                              <SelectTrigger className="w-36">
                                <SelectValue placeholder="Role" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="user">User</SelectItem>
                                <SelectItem value="product_owner">Product Owner</SelectItem>
                                <SelectItem value="super_admin">Super Admin</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            {user.is_blacklisted ? (
                              <Badge variant="destructive">Blacklisted</Badge>
                            ) : (
                              <Badge variant="secondary">Active</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button
                              size="sm"
                              variant={user.is_blacklisted ? "secondary" : "outline"}
                              onClick={() => handleBlacklist(user.id, user.email, !user.is_blacklisted)}
                            >
                              {user.is_blacklisted ? "Unblacklist" : "Blacklist"}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDeleteUser(user.id, user.email)}
                            >
                              Delete
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="project-roles" className="mt-4 space-y-4">
            <Card className="command-border bg-card/60">
              <CardHeader>
                <CardTitle>Project-Level Roles</CardTitle>
              </CardHeader>
              <CardContent>
                {projectRoles.length === 0 ? (
                  <div className="text-muted-foreground">No memberships found.</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Role</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {projectRoles.map((pr, idx) => (
                        <TableRow key={`${pr.project_id}-${pr.user_id}-${idx}`}>
                          <TableCell>{pr.project_name}</TableCell>
                          <TableCell>
                            <div className="font-medium">{pr.user_email || "Unknown"}</div>
                            <div className="text-xs text-muted-foreground">{pr.user_nickname || "No nickname"}</div>
                          </TableCell>
                          <TableCell className="w-48">
                            <Select
                              value={pr.role}
                              onValueChange={(val) =>
                                handleProjectRoleChange(pr.membership_id, val as AdminProjectRole["role"])
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Role" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="member">Member</SelectItem>
                                <SelectItem value="project_owner">Project Owner</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AdminDashboard;
