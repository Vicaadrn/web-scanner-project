package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

/* ========================================================
   1. DATA STRUCTURES (Spec-1 Protocol)
   ======================================================== */

type ScanRequest struct {
	URL      string `json:"url"`
	Wordlist string `json:"wordlist"`
	ScanType string `json:"scan_type"`
	Timeout  int    `json:"timeout"`
}

type ScanState struct {
	ID        string    `json:"id"`
	Status    string    `json:"status"`
	Progress  int       `json:"progress"`
	Phase     string    `json:"phase"`
	StartTime time.Time `json:"start_time"`
}

type WSMessage struct {
	Type string      `json:"type"` // "state" | "event"
	Data interface{} `json:"data"`
}

type ScanControl struct {
	Cancel context.CancelFunc
}

/* ========================================================
   2. GLOBALS & CONFIG
   ======================================================== */

const (
	pongWait   = 60 * time.Second    // Batas tunggu respon pong dari browser
	pingPeriod = (pongWait * 9) / 10 // Frekuensi kirim ping (54 detik)
	writeWait  = 10 * time.Second    // Timeout menulis ke socket
)

var (
	scanState    = make(map[string]*ScanState)
	scanControls = make(map[string]*ScanControl)
	stateMux     sync.RWMutex
	controlMux   sync.RWMutex

	clients    = make(map[string]*websocket.Conn)
	clientsMux sync.Mutex
	writeMux   sync.Mutex // Menjamin keamanan pengiriman data simultan

	semaphore = make(chan struct{}, 5) // Limit concurrent scans
	upgrader  = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}
)

func main() {
	http.HandleFunc("/api/scans", handleScan)
	http.HandleFunc("/api/scans/stop", handleStop)
	http.HandleFunc("/ws", handleWS)

	log.Println("==================================================")
	log.Println("🚀 SECURITY SCANNER ENGINE V3.5.0 - PRO")
	log.Println("OS:", runtime.GOOS, "| ARCH:", runtime.GOARCH)
	log.Println("Features: Heartbeat, Verbose Logging, Phase 0-2 Fix")
	log.Println("==================================================")

	log.Fatal(http.ListenAndServe(":8080", nil))
}

/* ========================================================
   3. CORE PIPELINE (The "Factory" Logic)
   ======================================================== */

func startPipeline(ctx context.Context, id string, req ScanRequest) {
	startTime := time.Now()
	log.Printf("[+] [ID:%s] Starting pipeline for: %s", id, req.URL)

	// Phase 0.2: WS Connection Safety Check
	time.Sleep(2 * time.Second)
	clientsMux.Lock()
	if _, ok := clients[id]; !ok {
		log.Printf("[!] [ID:%s] Warning: No UI client connected via WebSocket", id)
	}
	clientsMux.Unlock()

	rawDiscoveryChan := make(chan string, 2000) // Buffer lebih besar
	var wgDiscovery sync.WaitGroup

	// --- PHASE 1: DISCOVERY ---
	updateState(id, "Discovery", 10)
	log.Printf("[*] [ID:%s] Phase 1: Discovery started (Katana & FFUF)", id)
	
	wgDiscovery.Add(2)
	go runKatana(ctx, id, req.URL, rawDiscoveryChan, &wgDiscovery)
	go runFFUF(ctx, id, req, rawDiscoveryChan, &wgDiscovery)

	uniqueURLs := make(map[string]bool)
	var muDedup sync.Mutex
	var finalTargets []string
	var totalDiscovered int

	// Collector & Validator Phase 2 - dengan proper synchronization
	collectorDone := make(chan bool, 1)
	
	go func() {
		defer func() { collectorDone <- true }()
		
		for url := range rawDiscoveryChan {
			muDedup.Lock()
			if !uniqueURLs[url] {
				uniqueURLs[url] = true
				totalDiscovered++
				muDedup.Unlock()

				// Update progress berdasarkan jumlah discovery
				if totalDiscovered%10 == 0 {
					progress := 10 + int(50*float64(totalDiscovered)/200.0)
					if progress > 60 { progress = 60 }
					updateState(id, fmt.Sprintf("Discovery (%d found)", totalDiscovered), progress)
				}

				// Phase 1.4: Realtime Event (Live UX)
				sendEvent(id, map[string]interface{}{
					"event": "discovery_live", 
					"url": url,
					"count": totalDiscovered,
				})

				// Phase 2: HTTPX Validation
				if isValid, status := runHTTPX(ctx, url); isValid {
					muDedup.Lock()
					finalTargets = append(finalTargets, url)
					muDedup.Unlock()
					
					// Phase 2.3: Final Discovery Event
					sendEvent(id, map[string]interface{}{
						"event":  "discovery",
						"url":    url,
						"status": status,
					})
				}
			} else {
				muDedup.Unlock()
			}
		}
	}()

	// TUNGGU DISCOVERY TOOLS SELESAI
	wgDiscovery.Wait()
	
	// Beri waktu 1 detik untuk memastikan semua data diproses
	time.Sleep(1 * time.Second)
	
	// Tutup channel dan tunggu collector
	close(rawDiscoveryChan)
	<-collectorDone
	
	log.Printf("[ok] [ID:%s] Discovery complete. Total unique targets: %d", id, len(finalTargets))
	
	// Update state ke 65% sebelum lanjut ke Nuclei
	updateState(id, "Discovery Complete", 65)
	
	// Beri jeda untuk transisi
	time.Sleep(2 * time.Second)

	if ctx.Err() != nil {
		log.Printf("[!] [ID:%s] Scan cancelled by administrator", id)
		updateState(id, "Cancelled", 100)
		return
	}

	// --- PHASE 3: VULNERABILITY ---
	if len(finalTargets) > 0 {
		updateState(id, "Vulnerability Scan", 70)
		log.Printf("[*] [ID:%s] Phase 3: Vulnerability scanning with Nuclei...", id)
		runNuclei(ctx, id, finalTargets)
		
		// Update setelah Nuclei selesai
		updateState(id, "Vulnerability Scan Complete", 95)
	} else {
		log.Printf("[!] [ID:%s] Phase 3 skipped: No valid targets found.", id)
		updateState(id, "No Targets Found", 95)
	}

	// --- PHASE 4: FINISHED ---
	duration := time.Since(startTime)
	log.Printf("[DONE] [ID:%s] Scan finished in %v. Targets: %d", id, duration, len(finalTargets))
	
	// PASTIKAN 100%
	updateState(id, "Finished", 100)
	
	// Kirim completion event
	sendEvent(id, map[string]interface{}{
		"event": "scan_complete",
		"duration": duration.String(),
		"targets": len(finalTargets),
	})
}

/* ========================================================
   4. TOOL RUNNERS
   ======================================================== */

func runHTTPX(ctx context.Context, target string) (bool, int) {
	cmd := exec.CommandContext(ctx, "httpx", "-u", target, "-sc", "-silent", "-nc")
	out, err := cmd.Output()
	if err != nil || len(out) == 0 { return false, 0 }

	line := strings.TrimSpace(string(out))
	if !strings.Contains(line, "[") { return false, 0 }

	parts := strings.Split(line, " [")
	statusStr := strings.Trim(parts[1], "] ")
	var status int
	fmt.Sscanf(statusStr, "%d", &status)

	if status != 404 && status != 0 { return true, status }
	return false, 0
}

func runKatana(ctx context.Context, id, target string, ch chan<- string, wg *sync.WaitGroup) {
	defer wg.Done()
	log.Printf("[+] [ID:%s] [KATANA] Crawling started", id)
	
	// Tambah timeout untuk Katana (max 30 detik)
	ctxKatana, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	
	cmd := exec.CommandContext(ctxKatana, "katana", 
		"-u", target, 
		"-silent", 
		"-nc",
		"-crawl-duration", "25", // Max 25 detik
		"-timeout", "10",
	)
	
	stdout, _ := cmd.StdoutPipe()
	
	// Start dengan error handling
	if err := cmd.Start(); err != nil {
		log.Printf("[!] [ID:%s] [KATANA] Start error: %v", id, err)
		return
	}
	
	scanner := bufio.NewScanner(stdout)
	count := 0
	
	for scanner.Scan() {
		select {
		case <-ctxKatana.Done():
			// Context cancelled/done, stop processing
			cmd.Process.Kill()
			log.Printf("[*] [ID:%s] [KATANA] Cancelled by context", id)
			return
		default:
			line := strings.TrimSpace(scanner.Text())
			if line != "" {
				// Kirim dengan non-blocking
				select {
				case ch <- line:
					count++
					// Kirim real-time event
					sendEvent(id, map[string]interface{}{
						"event": "discovery_live",
						"url":   line,
						"tool":  "katana",
						"count": count,
					})
				case <-ctxKatana.Done():
					cmd.Process.Kill()
					return
				default:
					// Channel full, skip atau tunggu
					time.Sleep(5 * time.Millisecond)
					ch <- line
					count++
				}
			}
		}
	}
	
	// Wait untuk command
	cmd.Wait()
	log.Printf("[ok] [ID:%s] [KATANA] Finished. Found: %d", id, count)
}

func runFFUF(ctx context.Context, id string, req ScanRequest, ch chan<- string, wg *sync.WaitGroup) {
	defer wg.Done()
	log.Printf("[+] [ID:%s] [FFUF] Fuzzing started", id)
	
	// VALIDASI SEBELUM EKSEKUSI
	if req.Wordlist == "" {
		log.Printf("[!] [ID:%s] [FFUF] Wordlist kosong, menggunakan default", id)
		req.Wordlist = "common.txt" // Default wordlist
	}
	
	// Gunakan path absolut jika relative
	wordlistPath := req.Wordlist
	if !strings.Contains(wordlistPath, "/") {
		// Coba cari di beberapa lokasi umum
		possiblePaths := []string{
			"/usr/share/wordlists/" + wordlistPath,
			"/usr/share/wordlists/dirb/" + wordlistPath,
			"./" + wordlistPath,
			"../wordlists/" + wordlistPath,
		}
		for _, path := range possiblePaths {
			if _, err := os.Stat(path); err == nil {
				wordlistPath = path
				log.Printf("[*] [ID:%s] [FFUF] Found wordlist at: %s", id, path)
				break
			}
		}
	}
	
	// Tambah timeout untuk Python script
	ctxFFUF, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	
	cmd := exec.CommandContext(ctxFFUF, "python3", "run_ffuf.py", req.URL, wordlistPath, req.ScanType)
	
	// Capture stderr untuk debug
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	
	out, err := cmd.Output()
	if err != nil {
		log.Printf("[!] [ID:%s] [FFUF] Error: %v", id, err)
		log.Printf("[!] [ID:%s] [FFUF] Stderr: %s", id, stderr.String())
		
		// FALLBACK: Coba langsung jalankan ffuf tanpa Python wrapper
		log.Printf("[*] [ID:%s] [FFUF] Trying direct FFUF execution...", id)
		runFFUFDirect(ctx, id, req, ch, wordlistPath)
		return
	}

	// Dekode JSON besar dari Python
	var result struct {
		Status string `json:"status"`
		Data   struct {
			Matches []struct {
				Path string `json:"path"`
			} `json:"matches"`
		} `json:"data"`
		Error string `json:"error,omitempty"`
	}

	if err := json.Unmarshal(out, &result); err != nil {
		log.Printf("[!] [ID:%s] [FFUF] JSON Parse Error: %v", id, err)
		log.Printf("[DEBUG] [ID:%s] [FFUF] Raw output: %s", id, string(out[:min(500, len(out))]))
		return
	}
	
	if result.Error != "" {
		log.Printf("[!] [ID:%s] [FFUF] Python wrapper error: %s", id, result.Error)
		return
	}

	// Kirim setiap path yang ditemukan ke Discovery Channel
	count := 0
	baseURL := strings.TrimSuffix(req.URL, "/")
	for _, m := range result.Data.Matches {
		fullURL := baseURL + "/" + strings.TrimPrefix(m.Path, "/")
		
		// Kirim ke channel dengan timeout
		select {
		case ch <- fullURL:
			count++
			// Kirim real-time event
			sendEvent(id, map[string]interface{}{
				"event": "ffuf_discovery",
				"url":   fullURL,
				"tool":  "ffuf",
				"count": count,
			})
		case <-ctx.Done():
			log.Printf("[*] [ID:%s] [FFUF] Cancelled during processing", id)
			return
		default:
			// Channel penuh, tunggu sebentar
			time.Sleep(10 * time.Millisecond)
			ch <- fullURL
			count++
		}
	}

	log.Printf("[ok] [ID:%s] [FFUF] Finished. Found %d endpoints.", id, count)
}

// Fungsi fallback jika Python wrapper gagal
func runFFUFDirect(ctx context.Context, id string, req ScanRequest, ch chan<- string, wordlistPath string) {
	log.Printf("[*] [ID:%s] [FFUF-Direct] Starting direct execution", id)
	
	cmd := exec.CommandContext(ctx, "ffuf",
		"-u", req.URL+"/FUZZ",
		"-w", wordlistPath,
		"-t", "20",
		"-rate", "15",
		"-mc", "200,204,301,302,401,403,500",
		"-fc", "404",
		"-of", "json",
		"-s",
	)
	
	out, err := cmd.Output()
	if err != nil {
		log.Printf("[!] [ID:%s] [FFUF-Direct] Error: %v", id, err)
		return
	}
	
	// Parse hasil langsung
	var result map[string]interface{}
	if err := json.Unmarshal(out, &result); err != nil {
		log.Printf("[!] [ID:%s] [FFUF-Direct] JSON parse error: %v", id, err)
		return
	}
	
	// Process results
	if results, ok := result["results"].([]interface{}); ok {
		count := 0
		baseURL := strings.TrimSuffix(req.URL, "/")
		
		for _, r := range results {
			if match, ok := r.(map[string]interface{}); ok {
				if input, ok := match["input"].(map[string]interface{}); ok {
					if path, ok := input["FUZZ"].(string); ok {
						fullURL := baseURL + "/" + strings.TrimPrefix(path, "/")
						ch <- fullURL
						count++
						
						sendEvent(id, map[string]interface{}{
							"event": "ffuf_discovery",
							"url":   fullURL,
							"tool":  "ffuf",
							"count": count,
						})
					}
				}
			}
		}
		log.Printf("[ok] [ID:%s] [FFUF-Direct] Found %d endpoints", id, count)
	}
}

func min(a, b int) int {
	if a < b { return a }
	return b
}

func runNuclei(ctx context.Context, id string, targets []string) {
	log.Printf("[*] [ID:%s] [NUCLEI] Starting scan on %d targets", id, len(targets))
	
	// Update progress ke 71% untuk menunjukkan mulai
	updateState(id, "Nuclei Initializing", 71)
	
	// Buat temporary file untuk targets
	tmpFile, err := os.CreateTemp("", fmt.Sprintf("nuclei-%s-*.txt", id))
	if err != nil {
		log.Printf("[!] [ID:%s] [NUCLEI] Temp file error: %v", id, err)
		return
	}
	defer os.Remove(tmpFile.Name())
	
	// Tulis targets ke file
	for _, t := range targets {
		fmt.Fprintln(tmpFile, t)
	}
	tmpFile.Close()
	
	// Jalankan nuclei dengan stats untuk progress tracking
	cmd := exec.CommandContext(ctx, "nuclei",
		"-l", tmpFile.Name(),
		"-silent",
		"-jsonl",
		"-stats",
		"-stats-interval", "10",
		"-timeout", "30",
	)
	
	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()
	
	cmd.Start()
	
	// Goroutine untuk membaca progress dari stderr
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			line := scanner.Text()
			// Update progress berdasarkan stats nuclei
			if strings.Contains(line, "Requests") || strings.Contains(line, "Percent") {
				// Parse progress dari line
				// Contoh: "[INF] Requests: 45 (30.00%) | Total: 150 | Finished: 45 (30.00%)"
				sendEvent(id, map[string]interface{}{
					"event": "nuclei_progress",
					"message": line,
				})
				
				// Update progress incremental (71% -> 90%)
				// Coba ekstrak persentase
				if strings.Contains(line, "%") {
					// Naik progress sedikit
					updateState(id, "Nuclei Scanning", 75)
				}
			}
		}
	}()
	
	scanner := bufio.NewScanner(stdout)
	vulnCount := 0
	lastProgressUpdate := time.Now()
	
	for scanner.Scan() {
		var obj map[string]interface{}
		if err := json.Unmarshal(scanner.Bytes(), &obj); err == nil {
			if info, ok := obj["info"].(map[string]interface{}); ok {
				vulnCount++
				
				// Update progress setiap 5 vulnerability atau 10 detik
				if vulnCount%5 == 0 || time.Since(lastProgressUpdate) > 10*time.Second {
					// Hitung progress (71% - 90%)
					progress := 71 + int(19*float64(vulnCount)/float64(len(targets)))
					if progress > 90 { progress = 90 }
					
					updateState(id, fmt.Sprintf("Nuclei: %d vulns found", vulnCount), progress)
					lastProgressUpdate = time.Now()
				}
				
				// Log untuk admin
				log.Printf("[VULN] [ID:%s] [%s] %s -> %s", 
					id, info["severity"], obj["template-id"], obj["matched-at"])
				
				// Event ke frontend
				sendEvent(id, map[string]interface{}{
					"event":    "vulnerability",
					"severity": info["severity"],
					"name":     obj["template-id"],
					"url":      obj["matched-at"],
					"count":    vulnCount,
				})
			}
		}
	}
	
	cmd.Wait()
	
	// Update final progress untuk Nuclei
	updateState(id, "Nuclei Complete", 95)
	log.Printf("[ok] [ID:%s] [NUCLEI] Scan finished. Vulnerabilities found: %d", id, vulnCount)
	
	// Kirim completion event
	sendEvent(id, map[string]interface{}{
		"event": "nuclei_complete",
		"count": vulnCount,
	})
}

/* ========================================================
   5. HANDLERS & WEBSOCKET ENGINE
   ======================================================== */

func handleScan(w http.ResponseWriter, r *http.Request) {
	var req ScanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad Request", 400)
		return
	}

	scanID := fmt.Sprintf("scan_%d", time.Now().Unix())
	ctx, cancel := context.WithCancel(context.Background())

	stateMux.Lock()
	scanState[scanID] = &ScanState{
		ID: scanID, Status: "running", Progress: 0, Phase: "Init", StartTime: time.Now(),
	}
	stateMux.Unlock()

	controlMux.Lock()
	scanControls[scanID] = &ScanControl{Cancel: cancel}
	controlMux.Unlock()

	go func() {
		semaphore <- struct{}{}
		defer func() { <-semaphore }()
		startPipeline(ctx, scanID, req)
	}()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"scan_id": scanID})
}

func handleWS(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil { return }

	clientsMux.Lock()
	clients[id] = conn
	clientsMux.Unlock()

	log.Printf("[ws] [ID:%s] Client connected. Initializing heartbeat.", id)

	// A. Heartbeat Setup
	conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	// B. Ping Loop (Writer)
	go func(c *websocket.Conn, sid string) {
		ticker := time.NewTicker(pingPeriod)
		defer func() {
			ticker.Stop()
			c.Close()
			clientsMux.Lock()
			delete(clients, sid)
			clientsMux.Unlock()
			log.Printf("[ws] [ID:%s] Connection closed (heartbeat loss)", sid)
		}()

		for {
			select {
			case <-ticker.C:
				writeMux.Lock()
				c.SetWriteDeadline(time.Now().Add(writeWait))
				if err := c.WriteMessage(websocket.PingMessage, nil); err != nil {
					writeMux.Unlock()
					return
				}
				writeMux.Unlock()
			}
		}
	}(conn, id)

	// C. Required Read Loop
	for {
		if _, _, err := conn.ReadMessage(); err != nil { break }
	}
}

func handleStop(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	controlMux.RLock()
	ctrl, ok := scanControls[id]
	controlMux.RUnlock()

	if ok {
		ctrl.Cancel()
		w.Write([]byte(`{"status":"stopped"}`))
		return
	}
	http.Error(w, "Scan not found", 404)
}

func updateState(id, phase string, progress int) {
	stateMux.Lock()
	if s, ok := scanState[id]; ok {
		s.Phase = phase
		s.Progress = progress
		log.Printf("[state] [ID:%s] Phase: %s (%d%%)", id, phase, progress)
	}
	msg := WSMessage{Type: "state", Data: scanState[id]}
	stateMux.Unlock()

	safeWriteJSON(id, msg)
}

func sendEvent(id string, payload interface{}) {
	safeWriteJSON(id, WSMessage{Type: "event", Data: payload})
}

func safeWriteJSON(id string, msg WSMessage) {
	clientsMux.Lock()
	conn, ok := clients[id]
	clientsMux.Unlock()

	if ok {
		writeMux.Lock()
		defer writeMux.Unlock()
		conn.SetWriteDeadline(time.Now().Add(writeWait))
		if err := conn.WriteJSON(msg); err != nil {
			log.Printf("[!] [ID:%s] Write error: %v", id, err)
			conn.Close()
		}
	}
}