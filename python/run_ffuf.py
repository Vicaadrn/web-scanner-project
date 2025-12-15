#!/usr/bin/env python3
import sys
import subprocess
import json
import os

"""
Usage (supported):
  python3 run_ffuf.py <url> <scan_type>
  python3 run_ffuf.py <url> <wordlist> <scan_type>   # compatible with main.go

This script:
 - Resolves wordlist paths robustly (tries dirs/, files/, params/ when needed)
 - Runs ffuf for one or more wordlists (sequentially) and merges results
 - Returns JSON with human-friendly summary + recommendations
"""

def exit_json(obj, code=0):
    print(json.dumps(obj, ensure_ascii=False))
    sys.exit(code)

# Arg parsing
if len(sys.argv) < 3:
    exit_json({"error": "usage: run_ffuf.py <url> <scan_type>  OR  run_ffuf.py <url> <wordlist> <scan_type>"}, 1)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WORDLIST_BASE = os.path.normpath(os.path.join(BASE_DIR, "../wordlist"))
OUT_JSON = "/tmp/ffuf_output.json"

url = sys.argv[1]

# detect invocation pattern
if len(sys.argv) == 3:
    # run_ffuf.py <url> <scan_type>
    custom_wordlist = None
    scan_type = sys.argv[2].lower()
else:
    # run_ffuf.py <url> <wordlist> <scan_type>
    maybe_wordlist = sys.argv[2]
    scan_type = sys.argv[3].lower()
    custom_wordlist = maybe_wordlist


def _try_candidates(cands):
    """Return list of candidates that exist (normalized)."""
    return [os.path.normpath(p) for p in cands if os.path.exists(p)]

def resolve_wordlists(scan_type, custom_wordlist=None):
    """
    Return list of existing wordlist absolute paths (non-empty),
    or raise ValueError with 'checked' list for debugging.
    """
    candidates = []

    if custom_wordlist:
        # if absolute path provided, try it first
        if os.path.isabs(custom_wordlist):
            candidates.append(custom_wordlist)
        # try relative to WORDLIST_BASE root
        candidates.append(os.path.join(WORDLIST_BASE, custom_wordlist))
        # try common subfolders
        candidates.append(os.path.join(WORDLIST_BASE, "dirs", custom_wordlist))
        candidates.append(os.path.join(WORDLIST_BASE, "files", custom_wordlist))
        candidates.append(os.path.join(WORDLIST_BASE, "params", custom_wordlist))
    else:
        # default mapping by scan_type
        if "deep" in scan_type:
            candidates = [
                os.path.join(WORDLIST_BASE, "dirs", "medium.txt"),
                os.path.join(WORDLIST_BASE, "files", "medium.txt"),
            ]
        elif "full" in scan_type or "ai" in scan_type:
            candidates = [
                os.path.join(WORDLIST_BASE, "dirs", "big.txt"),
                os.path.join(WORDLIST_BASE, "files", "medium.txt"),
                os.path.join(WORDLIST_BASE, "params", "burp.txt"),
            ]
        else:  # quick / default
            candidates = [os.path.join(WORDLIST_BASE, "dirs", "common.txt")]

    existing = _try_candidates(candidates)

    # Special case: if no candidates but custom_wordlist equals common/common.txt or quick etc,
    # also try mapping shortcuts
    if not existing and custom_wordlist:
        name = os.path.basename(custom_wordlist).lower()
        map_lookup = {
            "quick": os.path.join(WORDLIST_BASE, "dirs", "common.txt"),
            "common.txt": os.path.join(WORDLIST_BASE, "dirs", "common.txt"),
            "common": os.path.join(WORDLIST_BASE, "dirs", "common.txt"),
            "medium.txt": os.path.join(WORDLIST_BASE, "dirs", "medium.txt"),
            "medium": os.path.join(WORDLIST_BASE, "dirs", "medium.txt"),
            "big.txt": os.path.join(WORDLIST_BASE, "dirs", "big.txt"),
            "big": os.path.join(WORDLIST_BASE, "dirs", "big.txt"),
        }
        if name in map_lookup:
            extra = map_lookup[name]
            if os.path.exists(extra):
                existing.append(os.path.normpath(extra))

    if not existing:
        raise ValueError({"error": "No valid wordlist found", "checked": [os.path.normpath(p) for p in candidates]})

    return existing

def run_ffuf_single(target, wl):
    cmd = [
        "ffuf",
        "-u", target,
        "-w", wl,
        "-of", "json",
        "-o", OUT_JSON,
        "-t", "100",
        "-timeout", "5",
        "-maxtime", "900",
        "-mc", "200,301,302,401,403"
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    except subprocess.TimeoutExpired:
        return {"error": f"ffuf timeout on {wl}"}
    except FileNotFoundError:
        return {"error": "ffuf not found. Install ffuf or adjust PATH"}
    except Exception as e:
        return {"error": f"ffuf execution error: {str(e)}"}

    if not os.path.exists(OUT_JSON):
        return {
            "error": "ffuf did not produce output file",
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "cmd": " ".join(cmd)
        }

    try:
        with open(OUT_JSON, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        return {"error": "failed to parse ffuf json", "detail": str(e)}

    # cleanup temp file for this run
    try:
        os.remove(OUT_JSON)
    except:
        pass

    return {"ok": True, "data": data, "wordlist": wl}

# Resolve wordlists (may be multiple)
try:
    wordlists = resolve_wordlists(scan_type, custom_wordlist)
except ValueError as e:
    exit_json(e.args[0], 1)

# ensure FUZZ token in URL
if "FUZZ" not in url:
    target = url.rstrip("/") + "/FUZZ"
else:
    target = url

all_matches = []

# run sequentially for each wordlist and merge
for wl in wordlists:
    res = run_ffuf_single(target, wl)
    if res.get("ok"):
        results = res["data"].get("results", [])
        for m in results:
            all_matches.append({
                "path": m.get("input", ""),
                "status": m.get("status", ""),
                "length": m.get("length", 0),
                "words": m.get("words", 0),
                "lines": m.get("lines", 0),
                "duration": m.get("duration", ""),
                "source_wordlist": res["wordlist"]
            })
    else:
        # Return error with debugging info immediately
        exit_json({"error": "ffuf run error", "detail": res, "attempted_wordlist": wl}, 1)

# build human-friendly summary
total = len(all_matches)
examples = all_matches[:5]

readable_summary = {
    "checked_target": url,
    "scan_type": scan_type,
    "total_findings": total,
    "explanation": (
        "Pemindaian ini mencari folder/file publik yang dapat diakses. "
        "Hasil di bawah ini adalah beberapa contoh temuan."
    ),
    "top_examples": examples
}

recommendations = []
if total == 0:
    recommendations.append("Tidak ditemukan jalur mencurigakan. Jalankan 'Deep Scan' jika ingin pemeriksaan lebih luas.")
else:
    recommendations.extend([
        "Periksa jalur sensitif seperti /admin, /config, atau /backup.",
        "Pastikan direktori sensitif tidak bisa diakses publik.",
        "Gunakan autentikasi untuk halaman admin.",
        "Hindari menaruh file konfigurasi di folder web root."
    ])

output = {
    "status": "ok",
    "data": {
        "summary": {
            "target": url,
            "scan_type": scan_type,
            "wordlists_used": wordlists,
            "total_matches": total
        },
        "matches": all_matches,
        "readable_summary": readable_summary,
        "recommendations": recommendations
    }
}

print(json.dumps(output, ensure_ascii=False))