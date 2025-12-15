package main

import (
    "encoding/json"
    "fmt"
    "log"
    "net/http"
    "os/exec"
)

type ScanRequest struct {
    URL       string `json:"url"`
    Wordlist  string `json:"wordlist"`
    ScanType  string `json:"scan_type"`
}

type ScanResponse struct {
    Output string `json:"output"`
    Error  string `json:"error,omitempty"`
}

func runPython(url, wordlist, scanType string) (string, error) {
    cmd := exec.Command("python3", "../python/run_ffuf.py", url, wordlist, scanType)
    out, err := cmd.CombinedOutput()
    return string(out), err
}

func handleScan(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("Access-Control-Allow-Origin", "*")
    w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

    if r.Method == http.MethodOptions {
        w.WriteHeader(http.StatusOK)
        return
    }

    if r.Method != http.MethodPost {
        http.Error(w, "Only POST allowed", http.StatusMethodNotAllowed)
        return
    }

    var req ScanRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }

    output, err := runPython(req.URL, req.Wordlist, req.ScanType)
    if err != nil {
        log.Println("Error running Python:", err)
        json.NewEncoder(w).Encode(ScanResponse{Error: err.Error(), Output: output})
        return
    }

    json.NewEncoder(w).Encode(ScanResponse{Output: output})
}

func main() {
    fmt.Println("🚀 Backend running on http://localhost:8080")
    http.HandleFunc("/api/scans", handleScan)
    log.Fatal(http.ListenAndServe(":8080", nil))
}
