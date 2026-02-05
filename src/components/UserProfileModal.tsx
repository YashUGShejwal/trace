import React, { useState, useEffect } from "react";
import { User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useUserProfile, useUpdateProfile } from "@/hooks/useUserProfile";
import { friendlyError } from "@/lib/utils";

interface UserProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userEmail: string | null;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  userId,
  userEmail,
}) => {
  const [nickname, setNickname] = useState("");
  const { toast } = useToast();

  const { data: profile, isLoading } = useUserProfile(userId);
  const updateProfile = useUpdateProfile();

  // Populate nickname when profile loads
  useEffect(() => {
    if (profile?.nickname) {
      setNickname(profile.nickname);
    }
  }, [profile]);

  const handleSave = async () => {
    if (!nickname.trim()) {
      toast({
        title: "Validation Error",
        description: "Display name cannot be empty",
        variant: "destructive",
      });
      return;
    }

    if (nickname.length > 50) {
      toast({
        title: "Validation Error",
        description: "Display name must be 50 characters or less",
        variant: "destructive",
      });
      return;
    }

    try {
      await updateProfile.mutateAsync({ userId, nickname: nickname.trim() });
      
      toast({
        title: "Profile Updated",
        description: "Your display name has been saved.",
      });

      onClose();
    } catch (error: any) {
      toast({
        title: "Update Failed",
        description: friendlyError(error.message) || "Failed to update profile",
        variant: "destructive",
      });
    }
  };

  const handleCancel = () => {
    // Reset to original nickname
    setNickname(profile?.nickname || "");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wider text-foreground flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            USER SETTINGS
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Email (Read-only) */}
          <div className="space-y-2">
            <Label htmlFor="email" className="text-xs font-display tracking-wider text-muted-foreground">
              EMAIL
            </Label>
            <Input
              id="email"
              value={userEmail || ""}
              disabled
              className="bg-secondary/50 text-muted-foreground cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground">
              Email cannot be changed
            </p>
          </div>

          {/* Display Name */}
          <div className="space-y-2">
            <Label htmlFor="nickname" className="text-xs font-display tracking-wider text-muted-foreground">
              DISPLAY NAME
            </Label>
            <Input
              id="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Enter your display name"
              className="bg-input border-border"
              maxLength={50}
              disabled={updateProfile.isPending}
            />
            <p className="text-xs text-muted-foreground">
              This name will be shown instead of your email
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={updateProfile.isPending}
            className="border-border"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateProfile.isPending || isLoading}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {updateProfile.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
