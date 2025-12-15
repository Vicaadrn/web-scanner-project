"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, XCircle, Mail } from "lucide-react";

export default function VerificationPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  const success = searchParams.get("success");
  const error = searchParams.get("error");

  useEffect(() => {
    if (success) {
      setMessage("Email berhasil diverifikasi! Sekarang Anda bisa login.");
    } else if (error) {
      switch (error) {
        case "invalid_token":
          setMessage("Token verifikasi tidak valid.");
          break;
        case "invalid_or_expired_token":
          setMessage("Token verifikasi tidak valid atau sudah kadaluarsa.");
          break;
        case "server_error":
          setMessage("Terjadi kesalahan server. Silakan coba lagi.");
          break;
        default:
          setMessage("Terjadi kesalahan saat verifikasi.");
      }
    }
  }, [success, error]);

  const handleResendVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(data.message);
      } else {
        setMessage(data.error);
      }
    } catch (error) {
      setMessage("Terjadi kesalahan saat mengirim ulang email verifikasi.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl flex justify-center">
            {success ? (
              <CheckCircle className="h-12 w-12 text-green-500" />
            ) : error ? (
              <XCircle className="h-12 w-12 text-red-500" />
            ) : (
              <Mail className="h-12 w-12 text-blue-500" />
            )}
          </CardTitle>
          <CardTitle>
            {success ? "Verifikasi Berhasil" : "Verifikasi Email"}
          </CardTitle>
          <CardDescription>
            {success 
              ? "Email Anda telah berhasil diverifikasi." 
              : "Silakan verifikasi email Anda untuk mengaktifkan akun."
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {message && (
            <div className={`p-3 rounded-lg text-sm ${
              success 
                ? "bg-green-100 text-green-800 border border-green-200" 
                : error && !success
                ? "bg-red-100 text-red-800 border border-red-200"
                : "bg-blue-100 text-blue-800 border border-blue-200"
            }`}>
              {message}
            </div>
          )}

          {!success && (
            <form onSubmit={handleResendVerification} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Masukkan email Anda"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button 
                type="submit" 
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? "Mengirim..." : "Kirim Ulang Email Verifikasi"}
              </Button>
            </form>
          )}

          <div className="text-center">
            <Button variant="outline" asChild className="w-full">
              <a href="/">Kembali ke Beranda</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
