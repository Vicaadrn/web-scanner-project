// /home/webserver/web-scanner/frontend/app/api/scans/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import jwt from "jsonwebtoken"; 

// --- HELPER FUNCTION ---
function generateSessionId() {
  // Pastikan fungsi ini ada
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

    // --- 1. IDENTIFIKASI USER (CUSTOM JWT & ANONYMOUS) ---
    let userId: number | null = null;
    const cookies = request.cookies; 
    let sessionId = cookies.get('sessionId')?.value;
    const authToken = cookies.get('token')?.value; 

    if (authToken) {
      try {
        const decoded: any = jwt.verify(authToken, JWT_SECRET);
        
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId }
        });
        
        if (user) {
          userId = user.id;
          console.log(`✅ User authenticated: ${user.email}`);
        }
      } catch (error) {
        console.log("Custom JWT verification failed. Session expired or invalid.");
      }
    }
    
    // Jika belum login dan belum punya session ID, buat baru
    if (!sessionId && !userId) {
      sessionId = generateSessionId();
      console.log(`🆕 New session created: ${sessionId}`);
    }

    // --- 2. CEK LIMIT SCAN ---
    let scanCount = 0;
    
    if (userId) {
      // User login: Anggap unlimited, scanCount = 0 agar selalu lolos check
      scanCount = 0; 
    } else if (sessionId) {
      // Anonymous: Cek limit
      scanCount = await prisma.scan.count({
        where: { sessionId, createdAt: { gte: new Date(Date.now() - 86400000) } }
      });
      console.log(`👻 Anonymous scan count: ${scanCount}`);
    }

    // 🚨 FORCE LOGIN CHECK: BLOKIR HANYA JIKA TIDAK ADA USER ID DAN LIMIT HABIS
    if (!userId && scanCount >= MAX_FREE_SCANS) { 
      console.log(`🚫 Blocking scan: User has ${scanCount} scans, requires login`);
      return NextResponse.json(
        { 
          status: "error",
          error: "Silakan login untuk melakukan scanning tambahan",
          requiresLogin: true, 
          scanCount: scanCount,
          maxFreeScans: MAX_FREE_SCANS
        },
        { status: 401 }
      );
    }

    // --- 3. CALL BACKEND (ACTUAL GO SCANNER) ---
    let backendResponse: any;
    try {
      const GO_BACKEND_URL = process.env.GO_BACKEND_URL || "http://localhost:8080";
      const endpoint = `${GO_BACKEND_URL}/api/scans`;
      
      console.log(`🔗 Calling backend Go scanner at: ${endpoint}`);

      const goRes = await fetch(endpoint, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url, scan_type, wordlist }),
      });

      // Cek jika fetch ke Go gagal (misalnya 404, 500 dari Go)
      if (!goRes.ok) {
        const errorData = await goRes.json();
        console.error(`Go Backend Error (${goRes.status}):`, errorData);
        
        // Mengembalikan error spesifik dari Go ke frontend
        return NextResponse.json(
          { 
            status: "error", 
            error: errorData.error || `Backend Go returned status ${goRes.status}`,
            output: errorData.output // Mungkin ada output dari Python/Go stderr
          }, 
          { status: goRes.status }
        );
      }

      // Go Backend merespons dengan: { output: "JSON_STRING_DARI_PYTHON" }
      const goData = await goRes.json();
      
      if (goData.error) {
        // Python/Go error ditangkap (misalnya ffuf error)
        return NextResponse.json({ status: "error", error: goData.error, output: goData.output }, { status: 500 });
      }

      // ⚠️ DOUBLE PARSE: output adalah string JSON dari Python, kita perlu mem-parse-nya lagi
      backendResponse = JSON.parse(goData.output); 
      
      console.log(`✅ Backend response received. Python status: ${backendResponse.status}`);
      
      if (backendResponse.status !== 'ok') {
        console.error("Python script returned non-OK status:", backendResponse.data?.error);
        return NextResponse.json({ status: "error", error: backendResponse.data?.error || "Scanning failed in Python script" }, { status: 500 });
      }

    } catch (backendError: any) {
      console.error("Backend communication/parsing error:", backendError);
      return NextResponse.json({ 
        status: "error", 
        error: "Backend service unavailable atau error parsing data.",
        details: backendError.message
      }, { status: 503 });
    }

    // --- 4. SIMPAN SCAN RECORD ---
    const scanData: any = {
      url,
      status: "completed",
      // Simpan seluruh hasil dari Python/ffuf
      result: backendResponse, 
      ipAddress: request.headers.get('x-forwarded-for') || 'unknown'
    };
    if (userId) {
      scanData.userId = userId;
    } else {
      scanData.sessionId = sessionId;
    }

    const scan = await prisma.scan.create({ data: scanData });

    console.log(`📊 Scan saved with ID: ${scan.id}`);

    // --- 5. RESPONSE FINAL ---
    const responseData = {
      status: "ok",
      data: backendResponse.data, // Kirim data hasil scan dari Python
      scanInfo: {
        id: scan.id,
        // Jika login (userId), remainingScans null/unlimited. Jika anonymous, hitung sisa.
        remainingScans: userId ? null : MAX_FREE_SCANS - (scanCount + 1),
        requiresLogin: false, 
        isLoggedIn: !!userId,
        scanCount: scanCount + 1,
        maxFreeScans: MAX_FREE_SCANS
      }
    };

    const finalResponse = NextResponse.json(responseData, { status: 201 });

    // Set session cookie hanya untuk anonymous users
    if (!userId && sessionId) {
      finalResponse.cookies.set("sessionId", sessionId, {
        maxAge: 24 * 60 * 60,
        path: "/",
        sameSite: "lax",
        httpOnly: true
      });
    }
    
    return finalResponse;

  } catch (error: any) {
    console.error("❌ Scan creation error (Global Catch):", error);
    return NextResponse.json({ error: "Server error", details: error.message }, { status: 500 });
  }
}