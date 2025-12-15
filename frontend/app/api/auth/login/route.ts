import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    // Validasi input
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email dan password harus diisi" },
        { status: 400 }
      );
    }

    // Cari user berdasarkan email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Email atau password salah" },
        { status: 401 }
      );
    }

    // Verifikasi password (Dilakukan pertama untuk keamanan)
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: "Email atau password salah" },
        { status: 401 }
      );
    }
    
    // 🔥 Cek apakah email sudah terverifikasi (Pencegahan akses email palsu)
    if (!user.isVerified) {
      return NextResponse.json(
        { 
          error: "Akun Anda ditemukan, tetapi belum diverifikasi. Silakan cek email Anda.",
          requiresVerification: true,
          email: user.email
        },
        { status: 403 } // Menggunakan 403 (Forbidden) untuk ditolak karena status
      );
    }

    // Buat JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Hapus password & token sensitif dari response
    const { password: _, verifyToken: __, verifyTokenExpiry: ___, ...userWithoutSensitiveData } = user;

    // Set cookie dengan token
    const response = NextResponse.json(
      { 
        message: "Login berhasil", 
        user: userWithoutSensitiveData,
        token 
      },
      { status: 200 }
    );

    // Set HTTP-only cookie
    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60, // 7 hari
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan server" },
      { status: 500 }
    );
  }
}