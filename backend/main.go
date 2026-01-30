package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
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
	time.Sleep(2 * time.Second) // Memberi waktu handshake WS selesai
	clientsMux.Lock()
	if _, ok := clients[id]; !ok {
		log.Printf("[!] [ID:%s] Warning: No UI client connected via WebSocket", id)
	}
	clientsMux.Unlock()

	rawDiscoveryChan := make(chan string, 1000)
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

	// Collector & Validator Phase 2
	go func() {
		for url := range rawDiscoveryChan {
			muDedup.Lock()
			if !uniqueURLs[url] {
				uniqueURLs[url] = true
				muDedup.Unlock()

				// Phase 1.4: Realtime Event (Live UX)
				sendEvent(id, map[string]interface{}{"event": "discovery_live", "url": url})

				// Phase 2: HTTPX Validation
				if isValid, status := runHTTPX(ctx, url); isValid {
					finalTargets = append(finalTargets, url)
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

	wgDiscovery.Wait()
	close(rawDiscoveryChan)
	log.Printf("[ok] [ID:%s] Discovery complete. Total unique targets: %d", id, len(finalTargets))

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
	} else {
		log.Printf("[!] [ID:%s] Phase 3 skipped: No valid targets found.", id)
	}

	// --- PHASE 4: FINISHED ---
	duration := time.Since(startTime)
	log.Printf("[DONE] [ID:%s] Scan finished in %v. Total targets scanned: %d", id, duration, len(finalTargets))
	updateState(id, "Finished", 100)
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
	cmd := exec.CommandContext(ctx, "katana", "-u", target, "-silent", "-nc")
	stdout, _ := cmd.StdoutPipe()
	cmd.Start()

	scanner := bufio.NewScanner(stdout)
	count := 0
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line != "" {
			ch <- line
			count++
		}
	}
	cmd.Wait()
	log.Printf("[ok] [ID:%s] [KATANA] Finished. Found: %d", id, count)
}

func runFFUF(ctx context.Context, id string, req ScanRequest, ch chan<- string, wg *sync.WaitGroup) {
	defer wg.Done()
	log.Printf("[+] [ID:%s] [FFUF] Fuzzing started (Waiting for JSON output...)", id)
	
	cmd := exec.CommandContext(ctx, "python3", "run_ffuf.py", req.URL, req.Wordlist, req.ScanType)
	
	// Gunakan CombinedOutput atau Output untuk mengambil seluruh JSON sekaligus
	out, err := cmd.CombinedOutput()
	if err != nil {
		log.Printf("[!] [ID:%s] [FFUF] Error: %v", id, err)
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
	}

	if err := json.Unmarshal(out, &result); err != nil {
		log.Printf("[!] [ID:%s] [FFUF] JSON Parse Error: %v", id, err)
		return
	}

	// Kirim setiap path yang ditemukan ke Discovery Channel
	count := 0
	baseURL := strings.TrimSuffix(req.URL, "/")
	for _, m := range result.Data.Matches {
		fullURL := baseURL + "/" + strings.TrimPrefix(m.Path, "/")
		ch <- fullURL
		count++
	}

	log.Printf("[ok] [ID:%s] [FFUF] Finished. Decoded %d endpoints from JSON.", id, count)
}

func runNuclei(ctx context.Context, id string, targets []string) {
	cmd := exec.CommandContext(ctx, "nuclei", "-silent", "-jsonl")
	stdin, _ := cmd.StdinPipe()
	stdout, _ := cmd.StdoutPipe()
	cmd.Start()

	go func() {
		defer stdin.Close()
		for _, t := range targets {
			io.WriteString(stdin, t+"\n")
		}
	}()

	scanner := bufio.NewScanner(stdout)
	vulnCount := 0
	for scanner.Scan() {
		var obj map[string]interface{}
		if err := json.Unmarshal(scanner.Bytes(), &obj); err == nil {
			info := obj["info"].(map[string]interface{})
			vulnCount++
			
			// feedback terminal administrator
			log.Printf("[VULN] [ID:%s] [%s] %s -> %s", id, info["severity"], obj["template-id"], obj["matched-at"])

			sendEvent(id, map[string]interface{}{
				"event":    "vulnerability",
				"severity": info["severity"],
				"name":     obj["template-id"],
				"url":      obj["matched-at"],
			})
		}
	}
	cmd.Wait()
	log.Printf("[ok] [ID:%s] [NUCLEI] Scan finished. Vulnerabilities found: %d", id, vulnCount)
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