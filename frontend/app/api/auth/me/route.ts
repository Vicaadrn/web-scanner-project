// /home/webserver/web-scanner/frontend/app/api/auth/me/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import jwt from "jsonwebtoken"; // 👈 Tambahkan


// Ambil secret dari environment
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key"; 

export async function GET(request: NextRequest) {
  try {
    const cookieHeader = request.headers.get('cookie') || '';
    
    // 🎯 1. Ganti: Ambil cookie 'token' (Custom JWT)
    // Di Next.js App Router, cara tercepat adalah dengan NextRequest.cookies.get('token')
    const tokenCookie = request.cookies.get('token');
    const token = tokenCookie?.value;

    if (!token) {
      return NextResponse.json({ user: null });
    }
    
    let decoded: any;
    try {
        // 🎯 2. Ganti: Verifikasi Token menggunakan jsonwebtoken
        decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
        // Token tidak valid atau expired
        console.log("Invalid JWT token:", err);
        return NextResponse.json({ user: null });
    }
    
    // Verifikasi berhasil, ambil user
    const user = await prisma.user.findUnique({
      where: {
        id: decoded.userId // Gunakan ID dari payload token
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true
      }
    });
    
    return NextResponse.json({ user });
  } catch (error) {
    console.error("Auth me error:", error);
    return NextResponse.json({ user: null });
  }
}