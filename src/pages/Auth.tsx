import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/utils";
import { Terminal, Shield, AlertTriangle } from "lucide-react";
import { z } from "zod";

const authSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        navigate("/dashboard");
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        navigate("/dashboard");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const validateForm = () => {
    try {
      authSchema.parse({ email, password });
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: { email?: string; password?: string } = {};
        error.errors.forEach((err) => {
          if (err.path[0] === "email") fieldErrors.email = err.message;
          if (err.path[0] === "password") fieldErrors.password = err.message;
        });
        setErrors(fieldErrors);
      }
      return false;
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          toast({
            title: "Authentication Failed",
            description: friendlyError(error.message),
            variant: "destructive",
          });
        } else {
          toast({
            title: "Access Granted",
            description: "Welcome back, operator.",
          });
        }
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        });

        if (error) {
          if (error.message.includes("already registered")) {
            toast({
              title: "Registration Failed",
              description: "This email is already registered. Try logging in.",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Registration Failed",
              description: friendlyError(error.message),
              variant: "destructive",
            });
          }
        } else {
          toast({
            title: "Registration Complete",
            description: "Your operator credentials have been created.",
          });
        }
      }
    } catch (error) {
      toast({
        title: "System Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background grid-pattern relative overflow-hidden">
      {/* Scan line overlay */}
      <div className="absolute inset-0 scanlines pointer-events-none" />
      
      {/* Background decorative elements */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
      <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent opacity-50" />
      
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Logo section */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center p-4 mb-4">
              <Terminal className="w-12 h-12 text-primary text-glow-primary" />
            </div>
            <h1 className="text-4xl font-display font-bold text-primary text-glow-primary tracking-widest">
              TRACE
            </h1>
            <p className="text-muted-foreground mt-2 text-sm tracking-wide">
              GAME ASSET COMMAND CENTER
            </p>
          </div>

          {/* Auth card */}
          <div className="command-border bg-card/80 backdrop-blur-sm p-8 rounded-sm">
            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-border">
              <Shield className="w-5 h-5 text-primary" />
              <span className="font-display text-sm tracking-wider text-foreground">
                {isLogin ? "OPERATOR LOGIN" : "NEW OPERATOR REGISTRATION"}
              </span>
            </div>

            <form onSubmit={handleAuth} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-muted-foreground text-xs tracking-wider uppercase">
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@trace.sys"
                  className="bg-input border-border focus:border-primary focus:ring-primary/20 font-mono"
                  required
                />
                {errors.email && (
                  <p className="text-destructive text-xs flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {errors.email}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-muted-foreground text-xs tracking-wider uppercase">
                  Access Code
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-input border-border focus:border-primary focus:ring-primary/20 font-mono"
                  required
                />
                {errors.password && (
                  <p className="text-destructive text-xs flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {errors.password}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-display tracking-wider glow-primary transition-all duration-300"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-pulse">PROCESSING</span>
                    <span className="animate-ping">...</span>
                  </span>
                ) : isLogin ? (
                  "INITIALIZE SESSION"
                ) : (
                  "CREATE CREDENTIALS"
                )}
              </Button>
            </form>

            <div className="mt-6 pt-4 border-t border-border text-center">
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-muted-foreground hover:text-primary text-sm transition-colors"
              >
                {isLogin ? (
                  <>New operator? <span className="text-primary">Register here</span></>
                ) : (
                  <>Already registered? <span className="text-primary">Login here</span></>
                )}
              </button>
            </div>
          </div>

          {/* Footer text */}
          <p className="text-center text-muted-foreground/50 text-xs mt-6 font-mono">
            SYS.VERSION 1.0.0 // SECURE CONNECTION
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
