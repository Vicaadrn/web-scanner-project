// /home/webserver/web-scanner/frontend/app/api/scans/status/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

  try {
    const GO_BACKEND_URL = process.env.GO_BACKEND_URL || "http://localhost:8080";
    const res = await fetch(`${GO_BACKEND_URL}/api/status?id=${id}`);
    const data = await res.json();

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch status" }, { status: 500 });
  }
}