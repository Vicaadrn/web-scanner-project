import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/auth/verification?error=invalid_token`);
    }

    // Cari user dengan token yang valid dan belum kedaluwarsa
    const user = await prisma.user.findFirst({
      where: {
        verifyToken: token,
        verifyTokenExpiry: {
          gt: new Date(), // Cek apakah waktu kedaluwarsa lebih besar dari waktu sekarang
        },
      },
    });

    if (!user) {
      return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/auth/verification?error=invalid_or_expired_token`);
    }

    // Update user menjadi verified
    await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true, // 🔥 Set isVerified: true
        verifyToken: null,
        verifyTokenExpiry: null,
      },
    });

    // Redirect ke halaman sukses verifikasi
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/auth/verification?success=true`);
  } catch (error) {
    console.error("Verification error:", error);
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/auth/verification?error=server_error`);
  }
}