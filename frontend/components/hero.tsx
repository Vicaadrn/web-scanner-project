'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { 
  Search, 
  Loader2, 
  ShieldAlert, 
  Zap, 
  Telescope, 
  Brain, 
  FileText, 
  Download, 
  Share2, 
  Settings, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  ChevronRight,
  Eye
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';

// --- CUSTOM COMPONENTS ---

const CustomTabs = ({ 
  children,
  className = "" 
}: { 
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div className={`w-full ${className}`}>
      {children}
    </div>
  );
};

const CustomTabsList = ({ 
  children,
  className = ""
}: { 
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div className={`flex border-b border-gray-200 dark:border-zinc-800 mb-6 ${className}`}>
      {children}
    </div>
  );
};

const CustomTabsTrigger = ({ 
  value, 
  children, 
  isActive,
  onClick
}: { 
  value: string; 
  children: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
}) => {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 font-medium text-sm transition-all ${
        isActive 
          ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500' 
          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
      }`}
    >
      {children}
    </button>
  );
};

const CustomTabsContent = ({ 
  value, 
  children, 
  activeTab 
}: { 
  value: string; 
  children: React.ReactNode;
  activeTab: string;
}) => {
  if (value !== activeTab) return null;
  return <div className="space-y-6">{children}</div>;
};

const CustomCard = ({ 
  children, 
  className = "" 
}: { 
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div className={`border border-gray-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900/50 ${className}`}>
      {children}
    </div>
  );
};

const CustomCardHeader = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="p-6 border-b border-gray-200 dark:border-zinc-800">
      {children}
    </div>
  );
};

const CustomCardContent = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="p-6">
      {children}
    </div>
  );
};

const CustomCardFooter = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="p-6 border-t border-gray-200 dark:border-zinc-800">
      {children}
    </div>
  );
};

const CustomProgress = ({ value }: { value: number }) => {
  return (
    <div className="w-full bg-gray-200 dark:bg-zinc-800 rounded-full h-2">
      <div 
        className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
        style={{ width: `${value}%` }}
      />
    </div>
  );
};

const CustomBadge = ({ 
  children, 
  variant = "default",
  className = ""
}: { 
  children: React.ReactNode; 
  variant?: "default" | "destructive" | "outline" | "secondary";
  className?: string;
}) => {
  const variants = {
    default: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
    destructive: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    outline: "border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300",
    secondary: "bg-gray-100 text-gray-800 dark:bg-zinc-800 dark:text-gray-300"
  };
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
};

type TabType = "overview" | "vulnerabilities" | "discovery";

// --- PARSING LOGIC (DARI KODE PERTAMA) ---

const parseVulnerability = (vuln: any) => {
  try {
    const data = typeof vuln === 'string' ? JSON.parse(vuln) : vuln;
    return {
      name: data.info?.name || "Vulnerability Detected",
      description: data.info?.description || "No description available for this finding.",
      severity: data.info?.severity?.toUpperCase() || "INFO",
      templateId: data["template-id"] || ""
    };
  } catch (e) {
    if (typeof vuln === 'string') {
      const parts = vuln.split('-');
      return {
        name: parts[0]?.trim() || "Unknown Finding",
        description: parts.slice(1).join('-').trim() || "No detailed description.",
        severity: "INFO",
        templateId: ""
      };
    }
    return { name: "Unknown Finding", description: "Error parsing data", severity: "INFO", templateId: "" };
  }
};

const Hero = () => {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const authContext = useAuth();
  const { user, checkAuthStatus } = authContext || {};
  
  useEffect(() => setMounted(true), []);

  const [url, setUrl] = useState("");
  const [scanType, setScanType] = useState("Quick Scan");
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [vulnerabilities, setVulnerabilities] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  
  const [scanProgress, setScanProgress] = useState(0);
  const [currentPhase, setCurrentPhase] = useState("");
  const [estimatedTime, setEstimatedTime] = useState("");
  
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [remainingScans, setRemainingScans] = useState<number | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  
  const isLoggedIn = !!user;

  const [advancedConfig, setAdvancedConfig] = useState({
    wordlistSize: 'medium' as 'small' | 'medium' | 'large',
    recursionDepth: 2,
    rateLimit: 'medium' as 'high' | 'medium' | 'low',
    excludePatterns: '.git,.env,admin,backup',
    enableAI: true,
    customHeaders: ''
  });

  // --- Scan Configuration based on type ---
  const scanConfigs = {
    "Quick Scan": {
      icon: <Zap className="w-5 h-5" />,
      color: "bg-green-500",
      description: "FFUF + Nuclei (Critical/High vulnerabilities only)",
      duration: "5-10 minutes",
      tools: ["FFUF", "Nuclei (Critical/High)"],
      wordlistFile: 'common.txt',  // ✅ UBAH: wordlist -> wordlistFile (string file name)
      recursion: 1,
      nucleiTemplates: 'critical,high'
    },
    "Deep Scan": {
      icon: <Telescope className="w-5 h-5" />,
      color: "bg-amber-500",
      description: "FFUF + Katana + Selected Nuclei templates",
      duration: "30-60 minutes",
      tools: ["FFUF", "Katana", "Nuclei (Selected)"],
      wordlistFile: 'medium.txt',  // ✅ UBAH: wordlist -> wordlistFile (string file name)
      recursion: 3,
      nucleiTemplates: 'critical,high,medium'
    },
    "Full Scan": {
      icon: <Brain className="w-5 h-5" />,
      color: "bg-indigo-500",
      description: "All tools + AI Processing & Analysis",
      duration: "2-4 hours",
      tools: ["FFUF", "Katana", "Nuclei (All)", "AI Analysis"],
      wordlistFile: 'big.txt',  // ✅ UBAH: wordlist -> wordlistFile (string file name)
      recursion: 5,
      nucleiTemplates: 'all'
    }
  };

  const currentConfig = scanConfigs[scanType as keyof typeof scanConfigs] || scanConfigs["Quick Scan"];

  const handleScan = async () => {
    if (!url) {
      alert("Please enter a URL to scan.");
      return;
    }

    setLoading(true);
    setScanProgress(0);
    setCurrentPhase("Initializing scan...");
    setEstimatedTime(currentConfig.duration);
    setScanResult(null);
    setMatches([]);
    setVulnerabilities([]);
    setActiveTab("overview");
    setRequiresLogin(false);
    setScanError(null);

    try {
      // ✅ PERBAIKAN: Gunakan wordlistFile dari config
      const selectedWordlist = currentConfig.wordlistFile;
      
      const res = await fetch("/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          url: url,
          wordlist: selectedWordlist,  // ✅ KIRIM wordlist yang benar sesuai scan type
          scan_type: scanType.toLowerCase().includes("deep") ? "deep" : 
                     scanType.toLowerCase().includes("full") ? "full" : "quick",
          config: advancedConfig
        }),
      });

      const initialData = await res.json();

      if (res.status === 401) {
        setRequiresLogin(true);
        setLoading(false);
        window.dispatchEvent(new CustomEvent("open-login-modal"));
        return;
      }

      if (!res.ok) throw new Error(initialData.error || "Failed to start scan");

      const scanId = initialData.scan_id;
      setCurrentPhase("Discovery (FFUF) running...");
      setScanProgress(25);

      const pollInterval = setInterval(async () => {
        try {
          // FIX: Menggunakan endpoint yang benar sesuai kode pertama
          const statusRes = await fetch(`/api/scans/status?id=${scanId}`);
          if (!statusRes.ok) {
            console.error("Failed to fetch status:", statusRes.status);
            return;
          }

          const update = await statusRes.json();
          console.log("Polling update:", update); // Debug logging

          if (update.status === "processing") {
            if (update.discovery) {
              setCurrentPhase("Vulnerability Analysis (Nuclei)...");
              setScanProgress(60);
            }
            if (update.vulnerabilities?.length > 0) {
              setCurrentPhase("AI Processing & Analysis...");
              setScanProgress(85);
            }
          }

          // FIX: Menggunakan struktur data yang benar dari backend
          if (update.discovery && update.discovery.data) {
            setMatches(update.discovery.data.matches || []);
          } else if (update.discovery) {
            // Backup jika struktur berbeda
            setMatches(update.discovery.matches || []);
          }

          if (update.status === "finished") {
            clearInterval(pollInterval);
            setLoading(false);
            setScanProgress(100);
            setCurrentPhase("Scan completed!");
            setVulnerabilities(update.vulnerabilities || []);
            setScanResult(`Scan completed! Found ${update.discovery?.data?.matches?.length || update.discovery?.matches?.length || 0} endpoints and ${update.vulnerabilities?.length || 0} vulnerabilities.`);
            if (initialData.scanInfo) setRemainingScans(initialData.scanInfo.remainingScans);
          }

          if (update.status === "error") {
            clearInterval(pollInterval);
            setLoading(false);
            setScanError(update.error || "An error occurred during scan.");
          }
        } catch (err) {
          console.error("Polling error:", err);
        }
      }, 3000);

    } catch (error: any) {
      setScanError(error.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (checkAuthStatus) checkAuthStatus();
  }, [checkAuthStatus]);

  // --- PERBAIKAN LOGIKA STATS (DARI KODE PERTAMA) ---
  const stats = useMemo(() => {
    let critical = 0;
    let high = 0;
    let medium = 0;
    let low = 0;

    vulnerabilities.forEach(vuln => {
      let severity = "";
      
      // 1. Cek jika vuln adalah Object (Hasil dari JSON.Unmarshal backend baru)
      if (typeof vuln === 'object' && vuln !== null) {
        severity = (vuln.info?.severity || vuln.severity || "").toUpperCase();
      } 
      // 2. Cek jika vuln adalah String (Hasil dari versi lama atau fallback)
      else if (typeof vuln === 'string') {
        try {
          const parsed = JSON.parse(vuln);
          severity = (parsed.info?.severity || "").toUpperCase();
        } catch (e) {
          severity = vuln.toUpperCase();
        }
      }

      if (severity.includes('CRITICAL')) critical++;
      else if (severity.includes('HIGH')) high++;
      else if (severity.includes('MEDIUM')) medium++;
      else if (severity.includes('LOW') || severity !== "") low++;
    });

    return {
      totalEndpoints: matches.length,
      totalVulnerabilities: vulnerabilities.length,
      critical, high, medium, low
    };
  }, [matches, vulnerabilities]);

  const handleTabChange = (tab: TabType) => setActiveTab(tab);

  return (
    <section className="relative min-h-screen bg-gradient-to-br from-gray-50 dark:from-zinc-950 via-indigo-50 dark:via-black to-indigo-50 dark:to-zinc-950 pt-20 pb-20 lg:pt-28 lg:pb-20 overflow-hidden">
      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <div className="max-w-6xl mx-auto">
          {/* Hero Header */}
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
            <h1 className="font-black text-3xl sm:text-4xl lg:text-5xl mb-4">
              <span className="bg-gradient-to-r from-indigo-900 via-blue-900 to-indigo-900 dark:from-gray-50 dark:via-blue-300 dark:to-indigo-900 bg-clip-text text-transparent">
                Advanced Security Scanner
              </span>
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Scan your targets for vulnerabilities using industry-standard tools and AI analysis.
            </p>
            {!isLoggedIn && remainingScans !== null && (
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-full mt-4">
                <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                  Free scans remaining: {remainingScans}
                </span>
              </div>
            )}
          </motion.div>

          <CustomCard className="border-2 border-gray-200 dark:border-zinc-800 shadow-2xl bg-white/90 dark:bg-zinc-900/90">
            <CustomCardHeader>
              <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Vulnerability Scanner</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Fast, reliable, and thorough security auditing.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}>
                  <Settings className="w-4 h-4 mr-2" /> Advanced
                </Button>
              </div>
            </CustomCardHeader>

            <CustomCardContent>
              {/* URL Input */}
              <div className="mb-8">
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Target URL</label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <input
                      type="text"
                      placeholder="https://example.com"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-gray-900 dark:text-white placeholder:text-gray-400/40 dark:placeholder:text-zinc-500/30 transition-all"
                      disabled={loading}
                    />
                  </div>
                  <Button size="lg" onClick={handleScan} disabled={loading} className="px-8 gap-2">
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                    {loading ? "Scanning..." : "Start Scan"}
                  </Button>
                </div>
              </div>

              {/* Mode Selection */}
              <div className="mb-8">
                <label className="block text-sm font-medium mb-3 text-gray-700 dark:text-gray-300">Scan Mode</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {Object.entries(scanConfigs).map(([mode, config]) => (
                    <div
                      key={mode}
                      className={`p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                        scanType === mode
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 shadow-lg'
                          : 'border-gray-200 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800/50'
                      }`}
                      onClick={() => !loading && setScanType(mode)}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`p-2 rounded-lg ${config.color} text-white`}>
                          {config.icon}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900 dark:text-white">{mode}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <Clock className="w-3 h-3 text-gray-500" />
                            <span className="text-xs text-gray-500 dark:text-gray-400">{config.duration}</span>
                          </div>
                          {/* ✅ TAMPILKAN WORDSLIST YANG DIGUNAKAN */}
                          <div className="mt-2">
                            <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-zinc-800 rounded text-gray-600 dark:text-gray-400">
                              Wordlist: {config.wordlistFile}
                            </span>
                          </div>
                        </div>
                        {scanType === mode && (
                          <CheckCircle className="w-5 h-5 text-indigo-500" />
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{config.description}</p>
                      <div className="flex flex-wrap gap-2">
                        {config.tools.map((tool, idx) => (
                          <span 
                            key={idx} 
                            className="px-2 py-1 text-xs border border-gray-300 dark:border-zinc-700 rounded-md text-gray-600 dark:text-gray-400"
                          >
                            {tool}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {showAdvancedSettings && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mb-8 p-6 rounded-xl border border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-800/30 overflow-hidden"
                >
                  <h4 className="font-semibold mb-4 text-gray-900 dark:text-white">Advanced Configuration</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium mb-2">Wordlist Size</label>
                      <select 
                        className="w-full rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2"
                        value={advancedConfig.wordlistSize}
                        onChange={(e) => setAdvancedConfig({
                          ...advancedConfig, 
                          wordlistSize: e.target.value as 'small' | 'medium' | 'large'
                        })}
                      >
                        <option value="small">Small (Quick scans)</option>
                        <option value="medium">Medium (Deep scans)</option>
                        <option value="large">Large (Full scans)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Recursion Depth</label>
                      <select 
                        className="w-full rounded-lg border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2"
                        value={advancedConfig.recursionDepth}
                        onChange={(e) => setAdvancedConfig({
                          ...advancedConfig, 
                          recursionDepth: parseInt(e.target.value)
                        })}
                      >
                        <option value="1">Level 1 (Quick)</option>
                        <option value="2">Level 2 (Standard)</option>
                        <option value="3">Level 3 (Deep)</option>
                        <option value="5">Level 5 (Full)</option>
                      </select>
                    </div>
                  </div>
                </motion.div>
              )}

              {scanError && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="flex items-center gap-3 text-red-700 dark:text-red-300">
                    <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                    <div>
                      <p className="font-medium">Scan Error</p>
                      <p className="text-sm mt-1">{scanError}</p>
                    </div>
                  </div>
                </div>
              )}

              {loading && (
                <div className="mb-8 p-6 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/30">
                  <div className="flex items-center justify-between mb-4">
                    <div><p className="font-medium">{currentPhase}</p></div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{scanProgress}%</p>
                      <p className="text-xs text-gray-500">{estimatedTime}</p>
                    </div>
                  </div>
                  <CustomProgress value={scanProgress} />
                </div>
              )}

              {/* Results Section */}
              {(scanResult || vulnerabilities.length > 0 || matches.length > 0) && !loading && (
                <div className="mt-10">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white">Scan Results</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{scanResult}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="gap-2">
                        <Download className="w-4 h-4" />
                        Export
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Share2 className="w-4 h-4" />
                        Share
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                    <div className="p-4 rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/30 text-center">
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalEndpoints}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Endpoints</p>
                    </div>
                    <div className="p-4 rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/30 text-center">
                      <p className="text-2xl font-bold text-red-500">{stats.totalVulnerabilities}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Vulnerabilities</p>
                    </div>
                    <div className="p-4 rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/30 text-center">
                      <p className="text-2xl font-bold text-amber-500">{stats.critical}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">Critical</p>
                    </div>
                    <div className="p-4 rounded-lg border border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-800/30 text-center">
                      <p className="text-2xl font-bold text-orange-500">{stats.high}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">High</p>
                    </div>
                  </div>

                  <CustomTabs>
                    <CustomTabsList>
                      <CustomTabsTrigger value="overview" isActive={activeTab === "overview"} onClick={() => handleTabChange("overview")}>
                        <FileText className="w-4 h-4" /> Overview
                      </CustomTabsTrigger>
                      <CustomTabsTrigger value="vulnerabilities" isActive={activeTab === "vulnerabilities"} onClick={() => handleTabChange("vulnerabilities")}>
                        <ShieldAlert className="w-4 h-4" /> Vulnerabilities ({vulnerabilities.length})
                      </CustomTabsTrigger>
                      <CustomTabsTrigger value="discovery" isActive={activeTab === "discovery"} onClick={() => handleTabChange("discovery")}>
                        <Telescope className="w-4 h-4" /> Discovery
                      </CustomTabsTrigger>
                    </CustomTabsList>

                    <CustomTabsContent value="overview" activeTab={activeTab}>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Critical</span>
                          <span className="font-bold text-red-500">{stats.critical}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">High</span>
                          <span className="font-bold text-orange-500">{stats.high}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Medium</span>
                          <span className="font-bold text-yellow-500">{stats.medium}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Low</span>
                          <span className="font-bold text-blue-500">{stats.low}</span>
                        </div>
                      </div>
                    </CustomTabsContent>

                    <CustomTabsContent value="vulnerabilities" activeTab={activeTab}>
                      <div className="space-y-3">
                        {vulnerabilities.map((vuln, i) => {
                          const detail = parseVulnerability(vuln);
                          return (
                            <div key={i} className="p-4 rounded-lg border border-gray-200 dark:border-zinc-800 bg-red-500/5">
                              <div className="flex justify-between items-start">
                                <div>
                                  <h4 className="font-bold text-red-500">{detail.name}</h4>
                                  <p className="text-sm text-gray-500">{detail.description}</p>
                                </div>
                                <CustomBadge variant={detail.severity === 'CRITICAL' ? "destructive" : "outline"}>
                                  {detail.severity}
                                </CustomBadge>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CustomTabsContent>

                    <CustomTabsContent value="discovery" activeTab={activeTab}>
                      <div className="space-y-2 max-h-[400px] overflow-auto">
                        {matches.map((m, i) => (
                          <div key={i} className="flex gap-4 p-3 border border-gray-200 dark:border-zinc-800 rounded-lg">
                            <span className="font-bold">{m.status}</span>
                            <span className="font-mono text-sm truncate">{typeof m.path === 'object' ? m.path.FUZZ : m.path}</span>
                          </div>
                        ))}
                      </div>
                    </CustomTabsContent>
                  </CustomTabs>
                </div>
              )}
            </CustomCardContent>
          </CustomCard>

          {/* Feature Highlights */}
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-12"
          >
            <h3 className="text-2xl font-bold text-center mb-8 text-gray-900 dark:text-white">
              Why Choose Our Security Scanner?
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {[
                {
                  icon: <Zap className="w-8 h-8" />,
                  title: "Fast Scanning",
                  description: "Quick scans complete in minutes with optimized engines"
                },
                {
                  icon: <Brain className="w-8 h-8" />,
                  title: "AI-Powered Analysis",
                  description: "Advanced ML algorithms for intelligent vulnerability detection"
                },
                {
                  icon: <FileText className="w-8 h-8" />,
                  title: "Detailed Reporting",
                  description: "Comprehensive reports with actionable remediation steps"
                }
              ].map((feature, index) => (
                <motion.div 
                  key={index}
                  whileHover={{ y: -10 }}
                  className="p-6 rounded-xl border border-gray-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-800/30 text-center cursor-pointer hover:shadow-xl hover:border-indigo-500/50 dark:hover:border-indigo-500/50 transition-all duration-300"
                >
                  <div className="inline-flex p-3 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 mb-4">
                    {feature.icon}
                  </div>
                  <h4 className="font-bold text-lg mb-2 text-gray-900 dark:text-white">{feature.title}</h4>
                  <p className="text-gray-600 dark:text-gray-400">{feature.description}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default Hero;