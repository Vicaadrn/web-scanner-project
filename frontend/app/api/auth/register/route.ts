import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { sendVerificationEmail } from "@/lib/email"; // Pastikan fungsi ini tersedia

export async function POST(request: NextRequest) {
  try {
    const { name, email, password } = await request.json();

    // Validasi input
    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Nama, email, dan password harus diisi" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password harus minimal 6 karakter" },
        { status: 400 }
      );
    }

    // Cek apakah email sudah terdaftar
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Email sudah terdaftar" },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Generate verification token
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 jam

    // Buat user baru (isVerified: false)
    const user = await prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
        isVerified: false, // 🔥 Wajib false saat pendaftaran
        verifyToken,
        verifyTokenExpiry,
      },
    });

    // Kirim email verifikasi
    try {
      await sendVerificationEmail(email, verifyToken);
    } catch (emailError) {
      console.error("Failed to send verification email:", emailError);
      // Tetap lanjut meski email gagal dikirim (pengguna bisa menggunakan resend)
    }

    // Hapus sensitive data dari response
    const { password: _, verifyToken: __, verifyTokenExpiry: ___, ...userWithoutSensitiveData } = user;

    return NextResponse.json(
      { 
        message: "Pendaftaran berhasil! Silakan cek email Anda untuk verifikasi.", 
        user: userWithoutSensitiveData,
        requiresVerification: true // Memberitahu frontend untuk menampilkan pesan verifikasi
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan server" },
      { status: 500 }
    );
  }
}