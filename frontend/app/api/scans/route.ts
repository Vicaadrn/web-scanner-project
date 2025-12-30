// /home/webserver/web-scanner/frontend/app/api/scans/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import jwt from "jsonwebtoken"; 

function generateSessionId() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const MAX_FREE_SCANS = 3;

export async function POST(request: NextRequest) {
  try {
    const { url, scan_type, wordlist } = await request.json();
    
    if (!url) {
      return NextResponse.json({ error: "URL harus diisi" }, { status: 400 });
    }

    // --- 1. IDENTIFIKASI USER ---
    let userId: number | null = null;
    const cookies = request.cookies; 
    let sessionId = cookies.get('sessionId')?.value;
    const authToken = cookies.get('token')?.value; 

    if (authToken) {
      try {
        const decoded: any = jwt.verify(authToken, JWT_SECRET);
        const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
        if (user) userId = user.id;
      } catch (error) {
        console.log("JWT expired/invalid.");
      }
    }
    
    if (!sessionId && !userId) sessionId = generateSessionId();

    // --- 2. CEK LIMIT SCAN ---
    let scanCount = 0;
    if (!userId && sessionId) {
      scanCount = await prisma.scan.count({
        where: { sessionId, createdAt: { gte: new Date(Date.now() - 86400000) } }
      });
    }

    if (!userId && scanCount >= MAX_FREE_SCANS) { 
      return NextResponse.json({ 
        status: "error",
        error: "Silakan login untuk melakukan scanning tambahan",
        requiresLogin: true 
      }, { status: 401 });
    }

    // --- 3. CALL ASYNC BACKEND (GO) ---
    const GO_BACKEND_URL = process.env.GO_BACKEND_URL || "http://localhost:8080";
    
    const goRes = await fetch(`${GO_BACKEND_URL}/api/scans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, scan_type, wordlist }),
    });

    if (!goRes.ok) {
      return NextResponse.json({ status: "error", error: "Gagal terhubung ke scanner" }, { status: 503 });
    }

    // Go sekarang mengirimkan { "scan_id": "scan_..." }
    const goData = await goRes.json();
    const scanIdFromGo = goData.scan_id;

    // --- 4. SIMPAN SCAN RECORD (STATUS: PROCESSING) ---
    const scan = await prisma.scan.create({
      data: {
        url,
        status: "processing", // Status awal adalah memproses
        result: {},           // Kosong dulu, akan diupdate via polling/worker nanti jika perlu
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userId: userId || undefined,
        sessionId: userId ? undefined : sessionId,
        // Kita simpan scanId dari Go ke kolom database kita (pastikan kolom ini ada atau gunakan id prisma)
      }
    });

    // --- 5. RESPONSE KE UI ---
    const responseData = {
      status: "ok",
      scan_id: scanIdFromGo, // Kirim ID ini agar UI bisa melakukan polling
      scanDatabaseId: scan.id,
      scanInfo: {
        remainingScans: userId ? null : MAX_FREE_SCANS - (scanCount + 1),
        isLoggedIn: !!userId
      }
    };

    const finalResponse = NextResponse.json(responseData, { status: 201 });
    if (!userId && sessionId) {
      finalResponse.cookies.set("sessionId", sessionId, { maxAge: 24*60*60, path: "/", httpOnly: true });
    }
    
    return finalResponse;

  } catch (error: any) {
    console.error("❌ Global Error:", error);
    return NextResponse.json({ error: "Server error", details: error.message }, { status: 500 });
  }
}