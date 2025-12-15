import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, Gift, Search } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useState, useEffect, useMemo, useContext } from 'react';
import Link from 'next/link';
import { AnimatedTooltip } from "@/components/ui/animated-tooltip";
import { Star } from '@/components/custom/star';
import CustomDropdown from "@/components/custom/dropdown";
import { useAuth } from '@/context/AuthContext';

const Hero = () => {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  
  // 🎯 FIX: Pastikan useAuth mengembalikan nilai, meskipun null
  const authContext = useAuth();
  const { user, checkAuthStatus } = authContext || {};
  
  useEffect(() => setMounted(true), []);

  const [url, setUrl] = useState("");
  const [scanType, setScanType] = useState("Quick Scan");
  const [aiAnalysis, setAiAnalysis] = useState("Standard Analysis");
  const [reportFormat, setReportFormat] = useState("Detailed Report");

  // hasil scanning
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [showRaw, setShowRaw] = useState(false);
  const [limit, setLimit] = useState(50);

  // tambahan dari AI backend
  const [readableSummary, setReadableSummary] = useState<any | null>(null);
  const [recommendations, setRecommendations] = useState<string[] | null>(null);

  // State untuk forced login
  // 🎯 Mengganti isLoggedIn dengan user dari useAuth. Menggunakan isLoggedIn state hanya sebagai fallback/mirror.
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [remainingScans, setRemainingScans] = useState<number | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  
  // Menggunakan status user dari AuthContext.
  const isLoggedIn = !!user;

  const handleScan = async () => {
    if (!url) {
      alert("Please enter a URL to scan.");
      return;
    }

    // Reset semua state
    setScanResult("⏳ Scanning... please wait.");
    setMatches([]);
    setShowRaw(false);
    setReadableSummary(null);
    setRecommendations(null);
    setRequiresLogin(false);
    setScanError(null);

    try {
      const res = await fetch("/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          url: url,
          wordlist: "common.txt",
          scan_type: scanType.toLowerCase().includes("deep")
            ? "deep"
            : scanType.toLowerCase().includes("full")
            ? "full"
            : "quick",
        }),
      });

      const data = await res.json();

      console.log("Scan response:", data); // Debug log

      // 🎯 HANDLE FORCED LOGIN
      // Cek apakah status 401 dan respons meminta login
      if (res.status === 401 && (data.requiresLogin || data.error?.includes("login"))) {
        
        // Jika user sudah login tapi masih dapat 401, mungkin token expired/masalah server
        if (isLoggedIn) {
          setScanError("Your session may have expired. Please refresh or relogin.");
          setScanResult(null);
          return;
        }

        setRequiresLogin(true);
        setScanResult(`❌ ${data.message || "Please login to continue scanning"}`);
        
        if (data.scanInfo?.remainingScans !== undefined) {
          setRemainingScans(data.scanInfo.remainingScans);
        }
        
        // Trigger login modal hanya jika belum login
        if (!isLoggedIn) {
          window.dispatchEvent(new CustomEvent("open-login-modal"));
        }
        return;
      }

      // 🎯 HANDLE OTHER ERRORS
      if (data.status === "error" || !res.ok) {
        setScanResult(`❌ ${data.error || "Scan failed"}`);
        setScanError(data.error);
        return;
      }

      // 🎯 PROCESS SUCCESS
      if (data.status === "ok" && data.data) {
        const summary = data.data.summary || {};
        const found = Array.isArray(data.data.matches) ? data.data.matches : [];
        setMatches(found);
        setReadableSummary(data.data.readable_summary || null);
        
        // 🎯 FIX: Pastikan recommendations adalah array atau null
        const incomingRecommendations = data.data.recommendations;
        setRecommendations(
          Array.isArray(incomingRecommendations)
            ? incomingRecommendations
            : null
        );
        
        // Update scan info
        if (data.scanInfo) {
          setRemainingScans(data.scanInfo.remainingScans);
          // setIsLoggedIn(data.scanInfo.isLoggedIn || !!user); // Tidak perlu disetel lagi
        }
        
        setScanResult(
          `✅ Scan complete for ${summary.target || url}\nFound ${found.length} result(s).`
        );
      } else {
        setScanResult(`❌ Unexpected response: ${JSON.stringify(data)}`);
      }

    } catch (error: any) {
      console.error("Scan error:", error);
      setScanResult(`❌ Error: ${error.message}`);
      setScanError(error.message);
    }
  };

  // Check auth status on mount
  useEffect(() => {
    if (checkAuthStatus) {
      checkAuthStatus();
    }
    // State isLoggedIn kini didapatkan dari !!user
  }, [checkAuthStatus]);

  const shownMatches = useMemo(() => matches.slice(0, limit), [matches, limit]);

  return (
    <section className="relative lg:min-h-screen bg-gradient-to-br from-gray-50 dark:from-zinc-950 via-indigo-50 dark:via-black to-indigo-50 dark:to-zinc-950 pt-25 pb-20 lg:pt-40 lg:pb-20 overflow-hidden group">
      <div className="container mx-auto px-6 relative z-10">
        <div className="text-center max-w-5xl mx-auto">
          {/* Title ... */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="font-black text-3xl lg:text-7xl mb-4 lg:mb-8"
          >
            <span className="bg-gradient-to-r from-indigo-900 via-blue-900 to-indigo-900 dark:from-gray-50 dark:via-blue-300 dark:to-indigo-900 bg-clip-text text-transparent">
              Security Scanner Dashboard
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-base md:text-xl text-muted-foreground mb-8 max-w-[600px] mx-auto leading-relaxed"
          >
            Enter a URL to scan for vulnerabilities with AI-powered analysis.
            {!isLoggedIn && remainingScans !== null && remainingScans >= 0 && (
              <span className="block mt-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                Free scans remaining: {remainingScans}
              </span>
            )}
            {isLoggedIn && (
              <span className="block mt-2 text-sm font-medium text-green-600 dark:text-green-400">
                ✓ Unlimited scans (Logged in)
              </span>
            )}
          </motion.p>

          {/* 🎯 FORCED LOGIN ALERT */}
          {/* HANYA TAMPILKAN JIKA requiresLogin=true DAN user BELUM login */}
          {requiresLogin && !user && ( 
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/20 dark:border-red-800"
            >
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center dark:bg-red-900/30">
                  <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-red-800 dark:text-red-300">Login Required</h3>
                  <p className="text-sm text-red-600 dark:text-red-400">
                    You've used your free scan limit. Please login to continue scanning.
                  </p>
                  <div className="flex gap-2 mt-2">
                    <Button 
                      size="sm" 
                      className="bg-red-600 hover:bg-red-700 text-white"
                      onClick={() => window.dispatchEvent(new CustomEvent("open-login-modal"))}
                    >
                      Login Now
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => setRequiresLogin(false)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Form utama */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="bg-white/80 dark:bg-zinc-900/70 shadow-lg rounded-2xl p-6 md:p-10 backdrop-blur-md border border-gray-200 dark:border-zinc-800 mb-8"
          >
            {/* User Status Indicator */}
            {user && (
              <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="font-medium">Logged in as: {user.email}</span>
                  <span className="text-xs bg-green-100 dark:bg-green-800 px-2 py-1 rounded">
                    Unlimited scans
                  </span>
                </div>
                {/* Hapus notifikasi ini, karena sudah diganti dengan notifikasi di atas */}
              </div>
            )}

            {/* URL Input */}
            <div className="flex flex-col md:flex-row items-center gap-4 mb-6">
              <input
                type="text"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 dark:border-zinc-700 bg-transparent px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <Button 
                size="lg" 
                onClick={handleScan} 
                className="px-6"
                disabled={requiresLogin && !isLoggedIn} // Disable jika required login dan user belum login
              >
                <Search className="mr-2 h-5 w-5" /> Scan
              </Button>
            </div>

            {/* Dropdowns ... */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <CustomDropdown
                options={["Quick Scan", "Deep Scan", "Full Audit"]}
                value={scanType}
                onChange={setScanType}
              />
              <CustomDropdown
                options={[
                  "Standard Analysis",
                  "Advanced AI Analysis",
                  "Exploit Detection",
                ]}
                value={aiAnalysis}
                onChange={setAiAnalysis}
              />
              <CustomDropdown
                options={[
                  "Detailed Report",
                  "Summary Report",
                  "JSON Output",
                ]}
                value={reportFormat}
                onChange={setReportFormat}
              />
            </div>

            {/* 🎯 ERROR DISPLAY ... */}
            {scanError && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
              >
                <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                  <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{scanError}</span>
                </div>
              </motion.div>
            )}

            {/* ✅ Scan Results */}
            {(scanResult || matches.length > 0) && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
                className="mt-6 p-5 rounded-xl border border-indigo-500/30 bg-gradient-to-r from-indigo-900/10 via-blue-800/10 to-indigo-900/10 
                dark:from-indigo-900/30 dark:via-blue-900/30 dark:to-indigo-800/30 text-left
                text-sm md:text-base text-gray-800 dark:text-gray-100 shadow-[0_0_15px_rgba(99,102,241,0.3)]"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-indigo-600 dark:text-indigo-400">
                      Scan Results:
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line">
                      {scanResult}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="text-xs px-2 py-1 border rounded bg-transparent hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                      onClick={() => setShowRaw(!showRaw)}
                    >
                      {showRaw ? "Hide raw" : "Show raw"}
                    </button>
                    {matches.length > limit && (
                      <button
                        className="text-xs px-2 py-1 border rounded bg-transparent hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                        onClick={() => setLimit((l) => l + 50)}
                      >
                        Load more
                      </button>
                    )}
                  </div>
                </div>

                {/* Ringkasan singkat */}
                {readableSummary && (
                  <div className="mb-4 p-3 rounded bg-indigo-50/20 dark:bg-indigo-900/20">
                    <div className="font-semibold text-indigo-600 dark:text-indigo-400">
                      Ringkasan Singkat
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {readableSummary.explanation}
                    </div>

                    {readableSummary.top_examples && Array.isArray(readableSummary.top_examples) && (
                      <ul className="mt-3 text-sm list-disc list-inside space-y-1">
                        {readableSummary.top_examples.map(
                          (ex: any, i: number) => (
                            <li key={i} className="text-gray-700 dark:text-gray-300">
                              <span className="font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded">
                                {typeof ex.path === 'object' ? ex.path.FUZZ : ex.path}
                              </span> — status: {ex.status} — tingkat:{" "}
                              <strong className={
                                ex.status >= 400 ? 'text-red-600' : 
                                ex.status >= 300 ? 'text-yellow-600' : 
                                'text-green-600'
                              }>
                                {ex.status}
                              </strong>
                            </li>
                          )
                        )}
                      </ul>
                    )}
                  </div>
                )}

                {/* Saran AI */}
                {/* 🎯 FIX: Pastikan recommendations adalah array sebelum memanggil .map */}
                {recommendations && Array.isArray(recommendations) && (
                  <div className="mb-4 p-3 rounded border border-yellow-300/30 bg-yellow-50/10 dark:bg-yellow-900/10">
                    <div className="font-semibold text-yellow-700 dark:text-yellow-400">
                      Saran Singkat
                    </div>
                    <ul className="mt-2 text-sm list-disc list-inside space-y-1">
                      {recommendations.map((r, i) => (
                        <li key={i} className="text-gray-700 dark:text-gray-300">
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* structured list ... */}
                {matches.length > 0 && !showRaw && (
                  <div className="space-y-2 max-h-[420px] overflow-auto pr-2">
                    <div className="text-xs text-muted-foreground mb-2">
                      Showing {shownMatches.length} of {matches.length} matches
                    </div>
                    {shownMatches.map((m, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-4 p-2 rounded hover:bg-white/5 dark:hover:bg-white/10 transition-colors"
                      >
                        <div className="w-8 text-sm text-indigo-400 font-mono">
                          {m.status || "-"}
                        </div>
                        <div className="flex-1">
                          <div className="font-mono text-sm text-gray-800 dark:text-gray-200">
                            {typeof m.path === "object" ? m.path.FUZZ : m.path || "(no path)"}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            len: {m.length ?? "-"} • words: {m.words ?? "-"} • lines: {m.lines ?? "-"} • dur: {m.duration ? `${(m.duration / 1000000).toFixed(2)}ms` : "-"}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          #{idx + 1}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* raw view ... */}
                {showRaw && (
                  <pre className="whitespace-pre-wrap leading-relaxed font-mono text-[0.95rem] max-h-[420px] overflow-auto bg-gray-900 text-gray-100 p-3 rounded">
                    {JSON.stringify(
                      { summary: scanResult, matches },
                      null,
                      2
                    )}
                  </pre>
                )}
              </motion.div>
            )}
          </motion.div>

          {/* Scan Limit Info */}
          {!isLoggedIn && remainingScans !== null && (
            <div className="text-center mt-6">
              <div className="inline-flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2">
                <svg className="w-4 h-4 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-sm text-amber-700 dark:text-amber-300">
                  Free scans remaining: <strong>{remainingScans}</strong>
                  {" • "}
                  <button 
                    className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    onClick={() => window.dispatchEvent(new CustomEvent("open-login-modal"))}
                  >
                    Login for unlimited scans
                  </button>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default Hero;