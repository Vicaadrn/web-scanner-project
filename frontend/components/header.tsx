"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Sun, Moon, Eye, EyeOff, LogOut, User } from "lucide-react";
import { RainbowButton } from "@/components/magicui/rainbow-button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import Logo from "@/components/logo";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";

interface User {
  id: number;
  email: string;
  name?: string;
  createdAt: string;
}

const Header = () => {
  const navItems = ["Home", "Scans", "Reports", "FAQ", "Contact"];
  const { resolvedTheme, setTheme } = useTheme();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isSignupOpen, setIsSignupOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("home");
  const [mounted, setMounted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    loginEmail: "",
    loginPassword: "",
    signupName: "",
    signupEmail: "",
    signupPassword: "",
    confirmPassword: "",
  });

  // Handle scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);


  // Open login modal via event
  useEffect(() => {
    const openLogin = () => setIsLoginOpen(true);
    window.addEventListener("open-login-modal", openLogin);
    return () => window.removeEventListener("open-login-modal", openLogin);
  }, []);

  // 🔥 CHECK AUTH STATUS (FIXED untuk handle logout otomatis)
  const checkAuthStatus = async () => {
    try {
      const response = await fetch("/api/auth/me", {
        method: "GET",
        credentials: "include", // WAJIB AGAR COOKIE TERKIRIM
      });

      const data = await response.json();
      
      if (response.ok && data.user) {
        setUser(data.user);
      } else {
        setUser(null); // Jika tidak OK atau user null, set ke null
      }
    } catch (error) {
      console.error("Auth check failed:", error);
      setUser(null); // Set ke null saat terjadi error network
    }
  };

  // 🔥 PANGGIL AUTH CHECK SAAT MOUNT
  useEffect(() => {
    setMounted(true);
    checkAuthStatus();
  }, []);

  // 🔥 LISTEN 'auth-change' EVENT (Menggantikan 'refresh-user')
  useEffect(() => {
    const handler = () => checkAuthStatus();
    window.addEventListener("auth-change", handler);
    return () => window.removeEventListener("auth-change", handler);
  }, []);

  const handleNavClick = (item: string) => {
    const sectionId = item.toLowerCase();
    setActiveSection(sectionId);

    if (sectionId === "home") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      const element = document.getElementById(sectionId);
      if (element) element.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleLoginOpenChange = (open: boolean) => {
    setIsLoginOpen(open);
    if (open) setError("");
  };

  const handleSignupOpenChange = (open: boolean) => {
    setIsSignupOpen(open);
    if (open) setError("");
  };

  const switchToSignup = () => {
    setError("");
    setIsLoginOpen(false);
    setIsSignupOpen(true);
  };

  const switchToLogin = () => {
    setError("");
    setIsSignupOpen(false);
    setIsLoginOpen(true);
  };

  // 🔥 LOGIN WITH 'auth-change' EVENT
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.loginEmail,
          password: formData.loginPassword,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        await checkAuthStatus();
        // setUser(data.user); // checkAuthStatus sudah mengurus ini
        setIsLoginOpen(false);

        // 🔥 Trigger 'auth-change' globally
        window.dispatchEvent(new Event("auth-change"));

        // Reset form
        setFormData((prev) => ({
          ...prev,
          loginEmail: "",
          loginPassword: "",
        }));
      } else {
        setError(data.error || "Login gagal");
      }
    } catch (error) {
      setError("Terjadi kesalahan saat login");
    } finally {
      setIsLoading(false);
    }
  };

  // SIGNUP HANDLER
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    if (formData.signupPassword !== formData.confirmPassword) {
      setError("Konfirmasi password tidak sesuai");
      setIsLoading(false);
      return;
    }

    if (formData.signupPassword.length < 6) {
      setError("Password harus minimal 6 karakter");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.signupName,
          email: formData.signupEmail,
          password: formData.signupPassword,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Auto-login
        const loginResponse = await fetch("/api/auth/login", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: formData.signupEmail,
            password: formData.signupPassword,
          }),
        });

        if (loginResponse.ok) {
          await checkAuthStatus();
          // const loginData = await loginResponse.json(); 
          // setUser(loginData.user); // checkAuthStatus sudah mengurus ini
          setIsSignupOpen(false);

          // 🔥 Trigger 'auth-change' globally
          window.dispatchEvent(new Event("auth-change"));

          resetFormData();
        } else {
          setError("Pendaftaran berhasil, tetapi auto-login gagal. Silakan coba login manual.");
          setIsSignupOpen(false);
          setIsLoginOpen(true);
        }
      } else {
        setError(data.error || "Pendaftaran gagal");
      }
    } catch (error) {
      setError("Terjadi kesalahan saat pendaftaran");
    } finally {
      setIsLoading(false);
    }
  };

  // LOGOUT
  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });

      setUser(null);

      // 🔥 Trigger 'auth-change' globally
      window.dispatchEvent(new Event("auth-change"));
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const updateFormData = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (error) setError("");
  };

  const resetFormData = () => {
    setFormData({
      loginEmail: "",
      loginPassword: "",
      signupName: "",
      signupEmail: "",
      signupPassword: "",
      confirmPassword: "",
    });
  };

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className={cn(
        "fixed top-0 left-0 right-0 z-40 transition-all duration-300",
        isScrolled
          ? "bg-background/60 backdrop-blur-sm shadow-xs"
          : "bg-transparent"
      )}
    >
      <div className="container mx-auto px-6 py-4 flex items-center justify-between">
        <Logo />

        <div className="flex items-center gap-2.5">
          <nav className="hidden md:flex items-center space-x-8">
            {navItems.map((item) => (
              <motion.button
                key={item}
                onClick={() => handleNavClick(item)}
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "cursor-pointer transition-colors relative group text-sm font-medium",
                  activeSection === item.toLowerCase()
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {item}
                <span
                  className={cn(
                    "absolute bottom-0 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full",
                    activeSection === item.toLowerCase() ? "w-full" : "w-0"
                  )}
                />
              </motion.button>
            ))}

            {user ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <User className="w-4 h-4" />
                  <span>{user.email}</span>
                </div>
                <Button variant="outline" size="sm" onClick={handleLogout}>
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </Button>
              </div>
            ) : (
              // LOGIN DIALOG
              <Dialog open={isLoginOpen} onOpenChange={handleLoginOpenChange}>
                <DialogTrigger asChild>
                  <RainbowButton>Sign In</RainbowButton>
                </DialogTrigger>

                <DialogContent className="sm:max-w-md p-8 rounded-2xl shadow-xl bg-background dark:bg-background">
                  <DialogHeader className="text-start mb-6">
                    <DialogTitle className="text-2xl font-bold">Selamat Datang</DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                      Silakan masuk ke akun Anda
                    </DialogDescription>
                  </DialogHeader>

                  {error && (
                    <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-lg">
                      {error}
                    </div>
                  )}

                  <form onSubmit={handleLogin} className="space-y-5">
                    
                    {/* EMAIL */}
                    <div className="space-y-3">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        required
                        disabled={isLoading}
                        className="h-11"
                        value={formData.loginEmail}
                        onChange={(e) => updateFormData("loginEmail", e.target.value)}
                        placeholder="Masukkan email Anda"
                      />
                    </div>

                    {/* PASSWORD */}
                    <div className="space-y-3">
                      <Label htmlFor="password">Kata Sandi</Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          required
                          disabled={isLoading}
                          className="h-11 pr-10"
                          value={formData.loginPassword}
                          onChange={(e) =>
                            updateFormData("loginPassword", e.target.value)
                          }
                          placeholder="Masukkan kata sandi"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-11 w-11"
                          onClick={() => setShowPassword(!showPassword)}
                          disabled={isLoading}
                        >
                          {showPassword ? <EyeOff /> : <Eye />}
                        </Button>
                      </div>
                    </div>

                    {/* REMEMBER ME */}
                    <div className="flex items-center justify-between text-sm">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                        />
                        Ingat Saya
                      </label>
                      <button type="button" className="text-primary hover:underline">
                        Lupa Kata Sandi?
                      </button>
                    </div>

                    {/* SUBMIT */}
                    <motion.div whileTap={{ scale: 0.97 }}>
                      <Button
                        type="submit"
                        disabled={isLoading}
                        className="w-full h-11"
                      >
                        {isLoading ? (
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{
                              duration: 1,
                              repeat: Infinity,
                              ease: "linear",
                            }}
                            className="w-5 h-5 border-2 border-current border-t-transparent rounded-full"
                          />
                        ) : (
                          "Masuk"
                        )}
                      </Button>
                    </motion.div>

                    {/* SWITCH TO SIGNUP */}
                    <div className="text-center pt-6">
                      <span className="text-sm text-muted-foreground">
                        Belum punya akun?{" "}
                        <button
                          type="button"
                          className="text-primary font-semibold hover:underline"
                          onClick={switchToSignup}
                        >
                          Daftar di sini
                        </button>
                      </span>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}

            {/* SIGNUP DIALOG */}
            <Dialog open={isSignupOpen} onOpenChange={handleSignupOpenChange}>
              <DialogContent className="sm:max-w-md p-8 rounded-2xl shadow-xl bg-background dark:bg-background">
                <DialogHeader className="text-start mb-6">
                  <DialogTitle className="text-2xl font-bold">Buat Akun Baru</DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    Daftar untuk mulai menggunakan layanan kami
                  </DialogDescription>
                </DialogHeader>

                {error && (
                  <div className="bg-destructive/15 text-destructive text-sm p-3 rounded-lg">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSignup} className="space-y-5">
                  
                  {/* NAME */}
                  <div className="space-y-3">
                    <Label htmlFor="fullname">Nama Lengkap</Label>
                    <Input
                      id="fullname"
                      type="text"
                      required
                      disabled={isLoading}
                      className="h-11"
                      value={formData.signupName}
                      onChange={(e) => updateFormData("signupName", e.target.value)}
                      placeholder="Masukkan nama lengkap Anda"
                    />
                  </div>

                  {/* EMAIL */}
                  <div className="space-y-3">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      required
                      disabled={isLoading}
                      className="h-11"
                      value={formData.signupEmail}
                      onChange={(e) => updateFormData("signupEmail", e.target.value)}
                      placeholder="Masukkan email Anda"
                    />
                  </div>

                  {/* PASSWORD */}
                  <div className="space-y-3">
                    <Label htmlFor="signup-password">Kata Sandi</Label>
                    <div className="relative">
                      <Input
                        id="signup-password"
                        type={showPassword ? "text" : "password"}
                        required
                        disabled={isLoading}
                        className="h-11 pr-10"
                        value={formData.signupPassword}
                        onChange={(e) =>
                          updateFormData("signupPassword", e.target.value)
                        }
                        placeholder="Minimal 6 karakter"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-11 w-11"
                        onClick={() => setShowPassword(!showPassword)}
                        disabled={isLoading}
                      >
                        {showPassword ? <EyeOff /> : <Eye />}
                      </Button>
                    </div>
                  </div>

                  {/* CONFIRM PASSWORD */}
                  <div className="space-y-3">
                    <Label htmlFor="confirm-password">Konfirmasi Kata Sandi</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      required
                      disabled={isLoading}
                      className="h-11"
                      value={formData.confirmPassword}
                      onChange={(e) =>
                        updateFormData("confirmPassword", e.target.value)
                      }
                      placeholder="Ulangi kata sandi"
                    />
                  </div>

                  {/* TERMS */}
                  <div className="flex items-start gap-2 text-sm">
                    <input type="checkbox" id="terms" className="mt-1" required />
                    <label htmlFor="terms">
                      Saya menyetujui{" "}
                      <span className="text-primary">Syarat & Ketentuan</span>{" "}
                      dan{" "}
                      <span className="text-primary">Kebijakan Privasi</span>
                    </label>
                  </div>

                  {/* SUBMIT */}
                  <motion.div whileTap={{ scale: 0.97 }}>
                    <Button
                      type="submit"
                      disabled={isLoading}
                      className="w-full h-11"
                    >
                      {isLoading ? (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{
                            duration: 1,
                            repeat: Infinity,
                            ease: "linear",
                          }}
                          className="w-5 h-5 border-2 border-current border-t-transparent rounded-full"
                        />
                      ) : (
                        "Daftar"
                      )}
                    </Button>
                  </motion.div>

                  {/* SWITCH TO LOGIN */}
                  <div className="text-center pt-4">
                    <span className="text-sm text-muted-foreground">
                      Sudah punya akun?{" "}
                      <button
                        type="button"
                        className="text-primary font-semibold hover:underline"
                        onClick={switchToLogin}
                      >
                        Masuk di sini
                      </button>
                    </span>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </nav>

          {/* THEME SWITCHER */}
          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            >
              {resolvedTheme === "dark" ? <Sun /> : <Moon />}
            </Button>
          )}
        </div>
      </div>
    </motion.header>
  );
};

export default Header;