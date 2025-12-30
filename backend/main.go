package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
)

var (
	scanStorage = make(map[string]*FullScanResponse)
	storageMux  sync.RWMutex
)

type ScanRequest struct {
	URL      string `json:"url"`
	Wordlist string `json:"wordlist"`
	ScanType string `json:"scan_type"`
}

type FullScanResponse struct {
	ID              string        `json:"id"`
	Status          string        `json:"status"`
	DiscoveryResult interface{}   `json:"discovery"`
	Vulnerabilities []interface{} `json:"vulnerabilities"`
	Error           string        `json:"error,omitempty"`
}

func runFFUF(url, wordlist, scanType string) (string, error) {
	// Berdasarkan ffuf -help: menggunakan -ac (auto calibrate) dan -s (silent)
	// Implementasi lewat script python yang Anda miliki
	cmd := exec.Command("python3", "../python/run_ffuf.py", url, wordlist, scanType)
	out, err := cmd.CombinedOutput()
	return string(out), err
}

func runNuclei(targetsFile string, scanType string) (string, error) {
	nucleiPath := "/usr/local/bin/nuclei"
	args := []string{"-l", targetsFile, "-jsonl", "-silent", "-ni", "-no-color"}

	switch scanType {
	case "quick":
		// Flag -as (automatic-scan) dari help untuk kecepatan tinggi
		args = append(args, "-as", "-severity", "critical,high", "-timeout", "5")
	case "deep":
		args = append(args, "-tags", "cve,misconfig,exposure,lfi,ssrf", "-severity", "critical,high,medium,low")
	case "full":
		// Sesuai manual: scan semua tanpa filter ketat
		args = append(args, "-severity", "critical,high,medium,low,info")
	}

	cmd := exec.Command(nucleiPath, args...)
	out, err := cmd.CombinedOutput()
	return string(out), err
}

func handleScan(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == http.MethodOptions {
		return
	}

	var req ScanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	scanID := fmt.Sprintf("scan_%d", time.Now().Unix())
	storageMux.Lock()
	scanStorage[scanID] = &FullScanResponse{ID: scanID, Status: "processing", Vulnerabilities: []interface{}{}}
	storageMux.Unlock()

	go func(id string, request ScanRequest) {
		// 1. FFUF
		ffufOut, _ := runFFUF(request.URL, request.Wordlist, request.ScanType)
		var dData interface{}
		json.Unmarshal([]byte(ffufOut), &dData)

		storageMux.Lock()
		scanStorage[id].DiscoveryResult = dData
		storageMux.Unlock()

		// 2. Nuclei
		tempFile := fmt.Sprintf("/tmp/targets_%s.txt", id)
		os.WriteFile(tempFile, []byte(request.URL+"\n"), 0644)
		nOut, _ := runNuclei(tempFile, request.ScanType)

		// 3. Parsing Aman untuk Frontend
		storageMux.Lock()
		lines := strings.Split(strings.TrimSpace(string(nOut)), "\n")
		var results []interface{}
		for _, l := range lines {
			if l = strings.TrimSpace(l); l != "" {
				var obj map[string]interface{}
				if err := json.Unmarshal([]byte(l), &obj); err == nil {
					results = append(results, obj)
				} else {
					results = append(results, l)
				}
			}
		}
		scanStorage[id].Vulnerabilities = results
		scanStorage[id].Status = "finished"
		storageMux.Unlock()
		os.Remove(tempFile)
	}(scanID, req)

	json.NewEncoder(w).Encode(map[string]string{"scan_id": scanID})
}

func handleStatus(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")
	id := r.URL.Query().Get("id")
	storageMux.RLock()
	res, ok := scanStorage[id]
	storageMux.RUnlock()
	if !ok {
		http.Error(w, "Not found", 404)
		return
	}
	json.NewEncoder(w).Encode(res)
}

func main() {
	http.HandleFunc("/api/scans", handleScan)
	http.HandleFunc("/api/status", handleStatus)
	fmt.Println("Backend Run on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}