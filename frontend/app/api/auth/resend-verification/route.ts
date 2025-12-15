import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import crypto from "crypto";
import { sendVerificationEmail } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email harus diisi" },
        { status: 400 }
      );
    }

    // Cari user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Email tidak ditemukan" },
        { status: 404 }
      );
    }

    if (user.isVerified) {
      return NextResponse.json(
        { error: "Email sudah terverifikasi" },
        { status: 400 }
      );
    }

    // Generate new verification token
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 jam

    // Update user dengan token baru
    await prisma.user.update({
      where: { id: user.id },
      data: {
        verifyToken,
        verifyTokenExpiry,
      },
    });

    // Kirim email verifikasi baru
    try {
      await sendVerificationEmail(email, verifyToken);
    } catch (emailError) {
      console.error("Failed to send verification email:", emailError);
      return NextResponse.json(
        { error: "Gagal mengirim email verifikasi" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: "Email verifikasi telah dikirim ulang. Silakan cek inbox Anda." },
      { status: 200 }
    );
  } catch (error) {
    console.error("Resend verification error:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan server" },
      { status: 500 }
    );
  }
}