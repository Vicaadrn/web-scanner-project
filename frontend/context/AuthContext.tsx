"use client";
import { createContext, useContext, useState, useEffect } from "react";

interface User {
  id: number;
  email: string;
  name?: string;
  createdAt?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  checkAuthStatus: () => Promise<void>;
  login: (email: string, password: string) => Promise<any>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // 🔥 Check auth status (Diperbaiki untuk penanganan null user)
  const checkAuthStatus = async () => {
    try {
      const res = await fetch("/api/auth/me", {
        credentials: "include",
      });
      const data = await res.json();
      
      // Pastikan setUser(null) jika respons tidak OK atau data.user kosong
      if (res.ok && data.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error("Error checking auth status:", err);
      setUser(null);
    } finally {
      // Pastikan loading diset false setelah cek awal selesai
      if (loading) setLoading(false);
    }
  };

  // 1. Cek status saat mount pertama kali
  useEffect(() => {
    checkAuthStatus(); // finaly dipanggil di dalam checkAuthStatus
  }, []);

  // 2. 🔥 LISTENER GLOBAL UNTUK 'auth-change' (Sinkronisasi dari Header)
  useEffect(() => {
    const handleAuthChange = () => {
      console.log("AuthContext: Event 'auth-change' received. Rechecking status...");
      // Memperbarui state Auth global
      checkAuthStatus();
    };

    // Daftarkan listener
    window.addEventListener("auth-change", handleAuthChange);

    // Clean up listener
    return () => {
      window.removeEventListener("auth-change", handleAuthChange);
    };
  }, []);


  // 🔥 Login
  const login = async (email: string, password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (res.ok) {
      await checkAuthStatus();
    }

    return data;
  };

  // 🔥 Logout
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    // Tidak perlu dispatch 'auth-change' karena perubahan state Context
    // sudah otomatis me-re-render komponen yang pakai useAuth().
  };

  return (
    <AuthContext.Provider value={{ user, loading, checkAuthStatus, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// Hook untuk digunakan di komponen
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};