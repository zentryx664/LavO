// Hide the extra console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Deserialize)]
struct LaunchReq {
    kind: String,
    id: String,
    path: String,
    dir: String,
    priority: String,
    args: Vec<String>,
    env: HashMap<String, String>,
}

const BLOCKED_ENV: [&str; 9] = [
    "PATH", "PATHEXT", "COMSPEC", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "USERPROFILE", "APPDATA",
];

// Launch options are never passed through a shell, and only a small safe character set is allowed.
fn safe_arg(a: &str) -> bool {
    !a.is_empty()
        && a.len() <= 80
        && a.chars().all(|c| c.is_ascii_alphanumeric() || "-_.=:+,/\\".contains(c))
}

fn safe_key(k: &str) -> bool {
    !k.is_empty()
        && k.len() <= 32
        && k.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_')
        && !k.starts_with(|c: char| c.is_ascii_digit())
}

fn enc(s: &str) -> String {
    s.bytes()
        .map(|b| {
            if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) {
                (b as char).to_string()
            } else {
                format!("%{:02X}", b)
            }
        })
        .collect()
}

fn open_url(url: &str) -> Result<(), String> {
    Command::new("explorer")
        .arg(url)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

// Raises the CPU priority of any process that starts inside the game's folder.
// The script is fixed; the folder and level are passed as environment variables, never as code.
const BOOST_PS: &str = r#"$d = $env:LAVO_DIR.TrimEnd('\') + '\'; $p = $env:LAVO_PRI; for ($i = 0; $i -lt 120; $i++) { Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($d, [System.StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { try { (Get-Process -Id $_.ProcessId).PriorityClass = $p } catch {} }; Start-Sleep -Seconds 1 }"#;

fn boost_priority(dir: &str, level: &str) {
    let lvl = match level {
        "high" => "High",
        "above_normal" => "AboveNormal",
        _ => return,
    };
    let d = Path::new(dir);
    if !d.is_dir() || d.components().count() < 3 {
        return;
    }
    let mut c = Command::new("powershell");
    c.args(["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", BOOST_PS])
        .env("LAVO_DIR", dir)
        .env("LAVO_PRI", lvl);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x08000000);
    }
    let _ = c.spawn();
}

fn detect_engine(dir: &Path) -> &'static str {
    if !dir.is_dir() {
        return "unknown";
    }
    if dir.join("UnityPlayer.dll").exists() {
        return "unity";
    }
    if dir.join("hl2.exe").exists()
        || dir.join("bin").join("engine.dll").exists()
        || dir.join("bin").join("client.dll").exists()
        || dir.join("game").join("bin").join("win64").is_dir()
    {
        return "source";
    }
    if dir.join("Engine").is_dir() {
        return "unreal";
    }
    if let Ok(rd) = fs::read_dir(dir) {
        for e in rd.flatten() {
            let n = e.file_name().to_string_lossy().to_lowercase();
            if n.ends_with("-win64-shipping.exe") || n.ends_with("-win32-shipping.exe") {
                return "unreal";
            }
            if n.ends_with(".pck") {
                return "godot";
            }
        }
    }
    "unknown"
}

fn run_exe(req: &LaunchReq) -> Result<(), String> {
    let p = PathBuf::from(&req.path);
    let is_exe = p
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("exe"))
        .unwrap_or(false);
    if !p.is_file() || !is_exe {
        return Err("Program not found. Check the path in the game's details.".to_string());
    }
    let mut c = Command::new(&p);
    c.args(&req.args).envs(&req.env);
    if let Some(d) = p.parent() {
        c.current_dir(d);
    }
    c.spawn().map(|_| ()).map_err(|e| e.to_string())
}

#[tauri::command]
fn launch_game(req: LaunchReq) -> Result<(), String> {
    if req.args.len() > 32 || !req.args.iter().all(|a| safe_arg(a)) {
        return Err("Blocked: unsafe launch option.".to_string());
    }
    for (k, v) in &req.env {
        if !safe_key(k) || BLOCKED_ENV.contains(&k.as_str()) || !safe_arg(v) {
            return Err("Blocked: unsafe environment value.".to_string());
        }
    }
    let result = match req.kind.as_str() {
        "steam" => {
            if req.id.is_empty() || !req.id.chars().all(|c| c.is_ascii_digit()) {
                return Err("Invalid Steam id.".to_string());
            }
            let mut url = format!("steam://run/{}", req.id);
            if !req.args.is_empty() {
                url.push_str("//");
                url.push_str(&enc(&req.args.join(" ")));
                url.push('/');
            }
            open_url(&url)
        }
        "epic" => {
            if req.args.is_empty() {
                if req.id.is_empty() {
                    return Err("Invalid Epic game id.".to_string());
                }
                open_url(&format!(
                    "com.epicgames.launcher://apps/{}?action=launch&silent=true",
                    enc(&req.id)
                ))
            } else {
                run_exe(&req)
            }
        }
        "exe" => run_exe(&req),
        _ => Err("This game cannot be launched from here.".to_string()),
    };
    if result.is_ok() && !req.priority.is_empty() {
        boost_priority(&req.dir, &req.priority);
    }
    result
}

fn vdf_val(text: &str, key: &str) -> Option<String> {
    for line in text.lines() {
        let p: Vec<&str> = line.trim().split('"').collect();
        if p.len() >= 4 && p[0].is_empty() && p[1].eq_ignore_ascii_case(key) {
            return Some(p[3].replace("\\\\", "\\"));
        }
    }
    None
}

fn steam_libs() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();
    for var in ["ProgramFiles(x86)", "ProgramFiles"] {
        if let Ok(v) = std::env::var(var) {
            roots.push(Path::new(&v).join("Steam"));
        }
    }
    let mut libs: Vec<PathBuf> = Vec::new();
    for r in roots {
        if !r.join("steamapps").is_dir() {
            continue;
        }
        if !libs.contains(&r) {
            libs.push(r.clone());
        }
        if let Ok(t) = fs::read_to_string(r.join("steamapps").join("libraryfolders.vdf")) {
            for line in t.lines() {
                let p: Vec<&str> = line.trim().split('"').collect();
                if p.len() >= 4 && p[1].eq_ignore_ascii_case("path") {
                    let lib = PathBuf::from(p[3].replace("\\\\", "\\"));
                    if lib.join("steamapps").is_dir() && !libs.contains(&lib) {
                        libs.push(lib);
                    }
                }
            }
        }
    }
    libs
}

#[tauri::command]
fn scan_games() -> Vec<Value> {
    let mut out: Vec<Value> = Vec::new();

    for lib in steam_libs() {
        if let Ok(rd) = fs::read_dir(lib.join("steamapps")) {
            for e in rd.flatten() {
                let n = e.file_name().to_string_lossy().to_string();
                if !(n.starts_with("appmanifest_") && n.ends_with(".acf")) {
                    continue;
                }
                if let Ok(t) = fs::read_to_string(e.path()) {
                    let id = vdf_val(&t, "appid").unwrap_or_default();
                    let name = vdf_val(&t, "name").unwrap_or_default();
                    if id.is_empty()
                        || name.is_empty()
                        || id == "228980"
                        || name.starts_with("Steam Linux Runtime")
                        || name.starts_with("Proton")
                        || name.starts_with("Steamworks")
                    {
                        continue;
                    }
                    let inst = vdf_val(&t, "installdir").unwrap_or_default();
                    let gdir = lib.join("steamapps").join("common").join(&inst);
                    let (dir, engine) = if inst.is_empty() {
                        (String::new(), "unknown")
                    } else {
                        (gdir.to_string_lossy().to_string(), detect_engine(&gdir))
                    };
                    out.push(json!({"name": name, "source": "Steam", "kind": "steam", "id": id, "path": "", "dir": dir, "engine": engine}));
                }
            }
        }
    }

    let pd = std::env::var("ProgramData").unwrap_or_else(|_| "C:\\ProgramData".to_string());
    let man = Path::new(&pd)
        .join("Epic")
        .join("EpicGamesLauncher")
        .join("Data")
        .join("Manifests");
    if let Ok(rd) = fs::read_dir(&man) {
        for e in rd.flatten() {
            if e.path().extension().and_then(|x| x.to_str()) != Some("item") {
                continue;
            }
            if let Ok(t) = fs::read_to_string(e.path()) {
                if let Ok(v) = serde_json::from_str::<Value>(t.trim_start_matches('\u{feff}')) {
                    let name = v["DisplayName"].as_str().unwrap_or("");
                    let app = v["AppName"].as_str().unwrap_or("");
                    let dir = v["InstallLocation"].as_str().unwrap_or("");
                    let exe = v["LaunchExecutable"].as_str().unwrap_or("");
                    if name.is_empty() || app.is_empty() {
                        continue;
                    }
                    let path = if exe.is_empty() {
                        String::new()
                    } else {
                        Path::new(dir).join(exe).to_string_lossy().to_string()
                    };
                    let engine = if dir.is_empty() { "unknown" } else { detect_engine(Path::new(dir)) };
                    out.push(json!({"name": name, "source": "Epic Games", "kind": "epic", "id": app, "path": path, "dir": dir, "engine": engine}));
                }
            }
        }
    }
    out
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![scan_games, launch_game])
        .run(tauri::generate_context!())
        .expect("error while running LavO Gaming Hub");
}
