use epub::doc::EpubDoc;
use base64::{Engine as _, engine::general_purpose};
use tauri::{Manager, Emitter};
use tauri::http::{Response, header::{CONTENT_TYPE, HeaderValue}};
use std::fs::{self, File};
use std::path::Path;
use std::io::{Read, Write, Seek};
use std::collections::HashMap;
use walkdir::WalkDir;
use serde::{Serialize, Deserialize};
use chrono::Utc;
use url::Url;
use sha2::{Sha256, Digest};
use hex;
use zip::ZipArchive;
use futures_util::StreamExt;

#[derive(Serialize, Deserialize)]
pub struct BookMetadata {
    pub id: String,
    pub path: String,
    pub title: String,
    pub author: String,
    pub cover_image: String,
    pub file_type: String,
    pub progress: f64,
    pub date_added: i64,
    pub last_opened: i64,
    pub is_favorite: bool,
    pub is_deleted: bool,
    pub synopsis: String,
    pub language: String,
    pub category: String,
    pub series_id: Option<String>,
    pub series_name: Option<String>,
    pub volume_number: Option<i32>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Series {
    pub id: String,
    pub name: String,
    pub cover_image: Option<String>,
    pub book_count: i32,
}

#[derive(Serialize)]
pub struct EpubResource {
    pub data: String,
    pub mime: String,
}

#[derive(Serialize, Deserialize)]
pub struct EpubMetadata {
    pub title: Option<String>,
    pub author: Option<String>,
    pub cover: Option<String>,
    pub language: Option<String>,
    pub description: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct NavSpineItem {
    pub id: String,
    pub path: String,
    pub title: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct TocItem {
    pub label: String,
    pub href: String,
    pub children: Vec<TocItem>,
}

fn cover_url(full_path: &str) -> String {
    let encoded_path = urlencoding::encode(full_path);
    format!("quil-lib://localhost/cover?path={}", encoded_path)
}

#[tauri::command]
fn get_book_cover_data(path: &str) -> Result<EpubResource, String> {
    let extension = Path::new(path)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    let cover_data = match extension.as_str() {
        "epub" => epub_cover(path),
        "cbz" => cbz_cover(path).map(|(d, m)| (d, m.to_string())),
        _ => None,
    };

    if let Some((data, mime)) = cover_data {
        Ok(EpubResource {
            data: general_purpose::STANDARD.encode(data),
            mime,
        })
    } else {
        Err("Cover not found".to_string())
    }
}

#[tauri::command]
fn scan_directory(path: &str) -> Result<Vec<BookMetadata>, String> {
    let mut books = Vec::new();
    let now = Utc::now().timestamp_millis();
    let root_path = Path::new(path);

    for entry in WalkDir::new(path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        let file_path = entry.path();
        let extension = file_path.extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();

        if !["epub", "pdf", "mobi", "cbz"].contains(&extension.as_str()) {
            continue;
        }

        let full_path = file_path.to_string_lossy().to_string();
        let title = file_path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Unknown")
            .to_string();

        let mut series_id = None;
        let mut series_name_val: Option<String> = None;

        if let Ok(relative) = file_path.strip_prefix(root_path) {
            let components: Vec<_> = relative.components().collect();
            let (series_key, series_display_name) = if components.len() > 1 {
                let parent_idx = components.len() - 2;
                let parent_name = components[parent_idx].as_os_str().to_string_lossy().to_string();
                let parent_rel: std::path::PathBuf = components[..=parent_idx].iter().collect();
                let parent_rel_str = parent_rel.to_string_lossy().to_string();
                (parent_rel_str, parent_name)
            } else {
                let root_name = root_path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                (root_name.clone(), root_name)
            };

            if !series_display_name.is_empty() {
                let mut hasher = Sha256::new();
                hasher.update(series_key.as_bytes());
                series_id = Some(hex::encode(hasher.finalize()));
                series_name_val = Some(series_display_name);
            }
        }

        let volume_number = extract_volume_number(&title);

        books.push(BookMetadata {
            id: uuid::Uuid::new_v4().to_string(),
            path: full_path.clone(),
            title,
            author: "Unknown Author".to_string(),
            cover_image: cover_url(&full_path),
            file_type: extension,
            progress: 0.0,
            date_added: now,
            last_opened: 0,
            is_favorite: false,
            is_deleted: false,
            synopsis: "".to_string(),
            language: "Unknown".to_string(),
            category: "all".to_string(),
            series_id,
            series_name: series_name_val,
            volume_number,
        });
    }

    Ok(books)
}

fn extract_volume_number(title: &str) -> Option<i32> {
    let re = regex::Regex::new(r"(?i)(?:vol|volume|cap|chapter|ch|#| -)\s*(\d+)").ok()?;
    re.captures(title)
        .and_then(|cap: regex::Captures| cap.get(1))
        .and_then(|m: regex::Match| m.as_str().parse::<i32>().ok())
}

#[tauri::command]
fn scan_file(path: &str) -> Result<BookMetadata, String> {
    let file_path = Path::new(path);
    if !file_path.exists() {
        return Err("File not found".to_string());
    }

    let extension = file_path.extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();

    let full_path = file_path.to_string_lossy().to_string();
    let title = file_path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown")
        .to_string();

    let now = Utc::now().timestamp_millis();
    let volume_number = extract_volume_number(&title);

    Ok(BookMetadata {
        id: uuid::Uuid::new_v4().to_string(),
        path: full_path.clone(),
        title,
        author: "Unknown Author".to_string(),
        cover_image: cover_url(&full_path),
        file_type: extension,
        progress: 0.0,
        date_added: now,
        last_opened: 0,
        is_favorite: false,
        is_deleted: false,
        synopsis: "".to_string(),
        language: "Unknown".to_string(),
        category: "all".to_string(),
        series_id: None,
        series_name: None,
        volume_number,
    })
}

#[tauri::command]
fn get_epub_metadata(path: &str) -> Result<EpubMetadata, String> {
    let doc = EpubDoc::new(path).map_err(|e| e.to_string())?;
    let title = doc.mdata("title").map(|m| m.value.clone());
    let author = doc.mdata("creator").map(|m| m.value.clone());
    let language = doc.mdata("language").map(|m| m.value.clone());
    let description = doc.mdata("description").map(|m| m.value.clone());

    Ok(EpubMetadata {
        title,
        author,
        cover: None,
        language,
        description,
    })
}

#[tauri::command]
fn get_epub_spine(path: &str) -> Result<Vec<NavSpineItem>, String> {
    let mut doc = EpubDoc::new(path).map_err(|e| e.to_string())?;
    let mut spine = Vec::new();

    // Create a mapping of resource paths to TOC labels
    let mut toc_map = std::collections::HashMap::new();

    // Helper function for recursive TOC traversal
    fn walk_toc(toc: &[epub::doc::NavPoint], map: &mut std::collections::HashMap<String, String>) {
        for entry in toc {
            let content_path = entry.content.to_string_lossy().replace('\\', "/");
            let clean_path = content_path.split('#').next().unwrap_or(&content_path).to_string();

            // Store with full path
            map.entry(clean_path.clone()).or_insert_with(|| entry.label.clone());

            // Store with just filename as fallback
            if let Some(filename) = Path::new(&clean_path).file_name().and_then(|s| s.to_str()) {
                map.entry(filename.to_string()).or_insert_with(|| entry.label.clone());
            }

            walk_toc(&entry.children, map);
        }
    }

    walk_toc(&doc.toc, &mut toc_map);

    for item in &doc.spine.clone() {
        if let Some(resource) = doc.resources.get(&item.idref) {
            if resource.mime == "application/xhtml+xml" || resource.mime == "text/html" {
                let rel_path = resource.path.to_string_lossy().replace('\\', "/");

                // Try full path match first
                let mut title = toc_map.get(&rel_path).cloned();

                // Try filename match second
                if title.is_none() {
                    if let Some(filename) = Path::new(&rel_path).file_name().and_then(|s| s.to_str()) {
                        title = toc_map.get(filename).cloned();
                    }
                }

                // Fallback to HTML extraction
                if title.is_none() {
                    if let Some((data, _)) = doc.get_resource(&item.idref) {
                        let html = String::from_utf8_lossy(&data);
                        title = extract_html_title(&html);
                    }
                }

                spine.push(NavSpineItem {
                    id: item.idref.clone(),
                    path: rel_path,
                    title,
                });
            }
        }
    }
    Ok(spine)
}

fn extract_html_title(html: &str) -> Option<String> {
    let re_title = regex::Regex::new(r"(?i)<title>(.*?)</title>").ok()?;
    if let Some(caps) = re_title.captures(html) {
        let t = caps.get(1)?.as_str().trim();
        if !t.is_empty() { return Some(t.to_string()); }
    }
    let re_h1 = regex::Regex::new(r"(?i)<h[1-2].*?>(.*?)</h[1-2]>").ok()?;
    if let Some(caps) = re_h1.captures(html) {
        let t = caps.get(1)?.as_str().trim();
        // Strip any inner HTML tags from the title
        let t_clean = regex::Regex::new(r"<[^>]*>").ok()?.replace_all(t, "");
        if !t_clean.is_empty() { return Some(t_clean.to_string()); }
    }
    None
}

#[tauri::command]
fn get_epub_toc(path: &str) -> Result<Vec<TocItem>, String> {
    let doc = EpubDoc::new(path).map_err(|e| e.to_string())?;

    fn walk_toc_recursive(toc: &[epub::doc::NavPoint]) -> Vec<TocItem> {
        toc.iter().map(|entry| {
            TocItem {
                label: entry.label.clone(),
                href: entry.content.to_string_lossy().replace('\\', "/"),
                children: walk_toc_recursive(&entry.children),
            }
        }).collect()
    }

    Ok(walk_toc_recursive(&doc.toc))
}
#[tauri::command]
fn get_epub_resource(path: &str, resource_id: &str) -> Result<EpubResource, String> {
    let mut doc = EpubDoc::new(path).map_err(|e| e.to_string())?;
    let (data, mime) = doc.get_resource(resource_id).ok_or("Resource not found")?;

    Ok(EpubResource {
        data: general_purpose::STANDARD.encode(data),
        mime,
    })
}

#[tauri::command]
fn get_epub_resource_by_path(path: &str, internal_path: &str) -> Result<EpubResource, String> {
    let mut doc = EpubDoc::new(path).map_err(|e| e.to_string())?;
    let data = doc.get_resource_by_path(internal_path).ok_or("Resource not found")?;
    let mime = mime_from_path(internal_path).to_string();

    Ok(EpubResource {
        data: general_purpose::STANDARD.encode(data),
        mime,
    })
}

#[tauri::command]
fn get_book_image_list(path: &str, file_type: &str) -> Result<Vec<String>, String> {
    match file_type.to_lowercase().as_str() {
        "epub" => {
            let doc = EpubDoc::new(path).map_err(|e| e.to_string())?;
            let mut images: Vec<String> = doc.resources.values()
                .filter(|r| r.mime.starts_with("image/"))
                .map(|r| r.path.to_string_lossy().replace('\\', "/"))
                .collect();
            images.sort();
            Ok(images)
        }
        "cbz" => {
            let file = File::open(path).map_err(|e| e.to_string())?;
            let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
            let mut images: Vec<String> = Vec::new();
            for i in 0..archive.len() {
                if let Ok(entry) = archive.by_index(i) {
                    let name = entry.name().to_string();
                    let lower = name.to_lowercase();
                    if lower.ends_with(".jpg") || lower.ends_with(".jpeg") || lower.ends_with(".png") || lower.ends_with(".webp") {
                        images.push(name);
                    }
                }
            }
            images.sort();
            Ok(images)
        }
        _ => Err("Unsupported file type".to_string()),
    }
}

#[tauri::command]
fn get_book_resource(path: &str, file_type: &str, internal_path: &str) -> Result<EpubResource, String> {
    if file_type == "epub" {
        get_epub_resource_by_path(path, internal_path)
    } else if file_type == "cbz" {
        let file = File::open(path).map_err(|e| e.to_string())?;
        let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
        let mut entry = archive.by_name(internal_path).map_err(|_| "Resource not found")?;
        let mut data = Vec::new();
        entry.read_to_end(&mut data).map_err(|e| e.to_string())?;
        let mime = mime_from_path(internal_path);
        Ok(EpubResource {
            data: general_purpose::STANDARD.encode(data),
            mime: mime.to_string(),
        })
    } else {
        Err("Unsupported file type".to_string())
    }
}

#[tauri::command]
async fn export_all_book_images(path: String, file_type: String, target_dir: String) -> Result<u32, String> {
    let images = get_book_image_list(&path, &file_type)?;
    let target = Path::new(&target_dir);
    fs::create_dir_all(target).map_err(|e| e.to_string())?;

    let mut count = 0;
    for img_path in images {
        if let Ok(res) = get_book_resource(&path, &file_type, &img_path) {
            if let Ok(data) = general_purpose::STANDARD.decode(res.data) {
                if let Some(file_name) = Path::new(&img_path).file_name() {
                    fs::write(target.join(file_name), data).map_err(|e| e.to_string())?;
                    count += 1;
                }
            }
        }
    }
    Ok(count)
}

#[tauri::command]
fn clear_tts_cache(app_handle: tauri::AppHandle) -> Result<(), String> {
    let cache_dir = get_tts_cache_dir(&app_handle);
    if cache_dir.exists() {
        fs::remove_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_piper_voices(app_handle: tauri::AppHandle) -> Result<Vec<String>, String> {
    let mut all_voices = Vec::new();
    
    for voices_dir in get_all_voices_dirs(&app_handle) {
        if voices_dir.exists() {
            if let Ok(entries) = fs::read_dir(voices_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().and_then(|s| s.to_str()) == Some("onnx") {
                        if let Some(name) = path.file_name().and_then(|s| s.to_str()) {
                            let name_str = name.to_string();
                            
                            // Only include if a .json also exists
                            let dir = path.parent().unwrap();
                            let json_path1 = dir.join(format!("{}.json", name_str));
                            let json_path2 = dir.join(format!("{}.onnx.json", name_str));
                            
                            if (json_path1.exists() || json_path2.exists()) && !all_voices.contains(&name_str) {
                                all_voices.push(name_str);
                            }
                        }
                    }
                }
            }
        }
    }
    
    Ok(all_voices)
}

#[tauri::command]
fn delete_piper_voice(app_handle: tauri::AppHandle, name: String) -> Result<(), String> {
    let mut deleted = false;
    for voices_dir in get_all_voices_dirs(&app_handle) {
        let onnx_path = voices_dir.join(&name);
        let json_path1 = voices_dir.join(format!("{}.json", name));
        let json_path2 = voices_dir.join(format!("{}.onnx.json", name));

        if onnx_path.exists() {
            let _ = fs::remove_file(onnx_path);
            deleted = true;
        }
        if json_path1.exists() {
            let _ = fs::remove_file(json_path1);
        }
        if json_path2.exists() {
            let _ = fs::remove_file(json_path2);
        }
    }

    if deleted {
        Ok(())
    } else {
        Err("No se encontró el archivo de voz para eliminar.".to_string())
    }
}

#[tauri::command]
async fn download_piper_model(app_handle: tauri::AppHandle, name: String, url: String) -> Result<(), String> {
    let voices_dir = get_voices_dir(&app_handle);
    if !voices_dir.exists() {
        fs::create_dir_all(&voices_dir).map_err(|e| e.to_string())?;
    }

    let onnx_path = voices_dir.join(format!("{}.onnx", name));
    let json_path = voices_dir.join(format!("{}.onnx.json", name));

    download_file_with_progress(&app_handle, &url, &onnx_path, &format!("Descargando {}...", name)).await?;
    
    let json_url = format!("{}.json", url);
    download_file_with_progress(&app_handle, &json_url, &json_path, &format!("Descargando configuración para {}...", name)).await?;

    Ok(())
}

async fn download_file_with_progress(app_handle: &tauri::AppHandle, url: &str, path: &Path, msg_prefix: &str) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .user_agent("SimpleQuil-App")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client.get(url).send().await.map_err(|e: reqwest::Error| e.to_string())?;
    
    if !response.status().is_success() {
        return Err(format!("Error de descarga: HTTP {}", response.status()));
    }

    let total_size = response.content_length().unwrap_or(0);

    let mut file = File::create(path).map_err(|e: std::io::Error| e.to_string())?;
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();

    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e: reqwest::Error| e.to_string())?;
        file.write_all(&chunk).map_err(|e: std::io::Error| e.to_string())?;
        downloaded += chunk.len() as u64;

        if total_size > 0 {
            let percentage = (downloaded as f64 / total_size as f64) * 100.0;
            let msg = format!("{} ({:.1}%)", msg_prefix, percentage);
            let _ = app_handle.emit("download-progress", msg);
        }
    }
    Ok(())
}

use std::process::Command;

fn strip_html_tags(html: &str) -> String {
    let mut result = String::new();
    let mut in_tag = false;
    let mut current_tag = String::new();
    
    let block_tags = ["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "br", "dt", "dd", "title"];

    for c in html.chars() {
        if c == '<' {
            in_tag = true;
            current_tag.clear();
        } else if c == '>' {
            in_tag = false;
            let tag_name = current_tag.split_whitespace().next().unwrap_or("").to_lowercase();
            let clean_tag = tag_name.trim_start_matches('/');
            if block_tags.contains(&clean_tag) {
                result.push('\n');
            } else {
                result.push(' ');
            }
        } else if in_tag {
            current_tag.push(c);
        } else {
            result.push(c);
        }
    }

    let mut cleaned = String::new();
    for line in result.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() { continue; }
        
        let sentences = trimmed
            .replace(". ", ".\n")
            .replace("? ", "?\n")
            .replace("! ", "!\n")
            .replace("; ", ";\n");
            
        for s in sentences.lines() {
            let s_trimmed = s.trim();
            if !s_trimmed.is_empty() {
                cleaned.push_str(s_trimmed);
                cleaned.push('\n');
            }
        }
    }
    cleaned
}

async fn run_piper_command(
    app_handle: &tauri::AppHandle,
    text: &str,
    model_path: &Path,
    output_path: &Path,
    length_scale: Option<f32>,
) -> Result<(), String> {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    let hash = hex::encode(hasher.finalize());
    let temp_dir = std::env::temp_dir();
    let input_path = temp_dir.join(format!("piper_input_{}.txt", hash));
    
    fs::write(&input_path, text).map_err(|e| format!("Error escribiendo entrada temporal: {}", e))?;

    let bin_dir = get_piper_bin_dir(app_handle);
    let exe_name = if cfg!(windows) { "piper.exe" } else { "piper" };
    let piper_exe = bin_dir.join(exe_name);

    // Prepare the command
    let mut command = if piper_exe.exists() {
        Command::new(&piper_exe)
    } else {
        // Fallback: try "piper" in system PATH
        Command::new("piper")
    };

    // Set working directory if using our bundled piper
    if piper_exe.exists() {
        command.current_dir(&bin_dir);
        
        // Check for espeak-ng-data relative to piper.exe
        let espeak_dir = bin_dir.join("espeak-ng-data");
        if espeak_dir.exists() {
            command.arg("--espeak_data").arg(&espeak_dir);
        }
        
        // On Windows, add piper's dir to PATH so it can find its DLLs
        #[cfg(windows)]
        {
            let path_var = std::env::var("PATH").unwrap_or_default();
            let mut paths = std::env::split_paths(&path_var).collect::<Vec<_>>();
            paths.insert(0, bin_dir.clone());
            if let Ok(new_path) = std::env::join_paths(paths) {
                command.env("PATH", new_path);
            }
        }
    }

    if let Some(scale) = length_scale {
        command.arg("--length_scale").arg(scale.to_string());
    }

    let input_file = File::open(&input_path).map_err(|e| format!("Failed to open input file: {}", e))?;

    let output = command
        .arg("--model")
        .arg(model_path)
        .arg("--output_file")
        .arg(output_path)
        .stdin(input_file)
        .output();
    
    let _ = fs::remove_file(input_path);

    match output {
        Ok(out) => {
            if !out.status.success() {
                let stderr = String::from_utf8_lossy(&out.stderr);
                return Err(format!("Piper failed with status: {} - Stderr: {}", out.status, stderr));
            }
            Ok(())
        },
        Err(e) => {
            if !piper_exe.exists() {
                Err("Motor Piper no encontrado. Por favor, instálalo desde Configuración > TTS.".to_string())
            } else {
                Err(format!("Error ejecutando piper: {}", e))
            }
        }
    }
}

#[tauri::command]
async fn speak_with_piper(app_handle: tauri::AppHandle, text: String, model: String) -> Result<String, String> {
    let (model_path, _) = find_voice_files(&app_handle, &model)
        .ok_or_else(|| format!("No se encontraron los archivos del modelo: {}", model))?;

    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    hasher.update(model.as_bytes());
    let hash = hex::encode(hasher.finalize());
    let filename = format!("{}.wav", hash);

    let cache_dir = get_tts_cache_dir(&app_handle);
    if !cache_dir.exists() {
        fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    }
    let output_path = cache_dir.join(&filename);

    if !output_path.exists() {
        run_piper_command(&app_handle, &text, &model_path, &output_path, None).await?;
    }

    let mut buffer = Vec::new();
    let mut file = File::open(&output_path).map_err(|e| e.to_string())?;
    file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
    
    Ok(general_purpose::STANDARD.encode(buffer))
}

#[derive(Serialize, Clone)]
struct ExportProgress {
    percentage: f64,
    status: String,
}

#[tauri::command]
#[allow(unused_variables)]
async fn export_audiobook(
    app_handle: tauri::AppHandle,
    book_path: String,
    chapters: Vec<String>,
    model_name: String,
    speed: f32,
    pitch: f32,
    natural_pauses: bool,
    export_lyrics: bool,
    output_path: String,
) -> Result<(), String> {
    let (model_path, _) = find_voice_files(&app_handle, &model_name)
        .ok_or_else(|| format!("No se encontraron los archivos del modelo: {}", model_name))?;

    let length_scale = 1.0 / speed;
    let total_chapters = chapters.len();
    let mut temp_files = Vec::new();

    for (i, chapter_id) in chapters.iter().enumerate() {
        let percentage = (i as f64 / total_chapters as f64) * 90.0;
        let _ = app_handle.emit("export-progress", ExportProgress {
            percentage,
            status: format!("Procesando capítulo {} de {}...", i + 1, total_chapters),
        });

        let mut doc = EpubDoc::new(&book_path).map_err(|e| e.to_string())?;
        let (html_data, _) = doc.get_resource(chapter_id).ok_or("Capítulo no encontrado")?;
        let html_str = String::from_utf8_lossy(&html_data);
        let mut text = strip_html_tags(&html_str);
        
        if text.trim().is_empty() {
            continue;
        }

        if natural_pauses {
            text = text.replace(". ", "... ");
            text = text.replace("? ", "...? ");
            text = text.replace("! ", "...! ");
        }

        let mut hasher = Sha256::new();
        hasher.update(chapter_id.as_bytes());
        let id_hash = hex::encode(hasher.finalize());
        let temp_wav = std::env::temp_dir().join(format!("chapter_{}_{}.wav", i, &id_hash[..8]));
        
        run_piper_command(&app_handle, &text, &model_path, &temp_wav, Some(length_scale)).await?;
        temp_files.push(temp_wav);
    }

    let _ = app_handle.emit("export-progress", ExportProgress {
        percentage: 95.0,
        status: "Combinando archivos de audio...".to_string(),
    });

    if temp_files.is_empty() {
        return Err("No se encontró texto para exportar en los capítulos seleccionados.".to_string());
    }

    let mut final_file = File::create(&output_path).map_err(|e| format!("Error creando archivo final: {}", e))?;
    let mut total_data_size = 0u32;
    let mut header_written = false;

    for temp_path in &temp_files {
        let mut f = File::open(temp_path).map_err(|e| format!("Error abriendo archivo temporal: {}", e))?;
        let mut buffer = Vec::new();
        f.read_to_end(&mut buffer).map_err(|e| format!("Error leyendo archivo temporal: {}", e))?;

        if buffer.len() < 44 {
            continue;
        }

        let chunk_size = u32::from_le_bytes(buffer[40..44].try_into().unwrap_or([0,0,0,0]));

        if !header_written {
            final_file.write_all(&buffer).map_err(|e| format!("Error escribiendo cabecera: {}", e))?;
            total_data_size = chunk_size;
            header_written = true;
        } else {
            final_file.write_all(&buffer[44..]).map_err(|e| format!("Error escribiendo datos de audio: {}", e))?;
            total_data_size += chunk_size;
        }
    }

    if !header_written {
        return Err("No se generó ningún audio válido para exportar.".to_string());
    }

    // Update WAV header with total sizes
    let total_riff_size = total_data_size + 36;
    
    final_file.seek(std::io::SeekFrom::Start(4)).map_err(|e| format!("Error actualizando tamaño RIFF: {}", e))?;
    final_file.write_all(&total_riff_size.to_le_bytes()).map_err(|e| format!("Error escribiendo tamaño RIFF: {}", e))?;
    
    final_file.seek(std::io::SeekFrom::Start(40)).map_err(|e| format!("Error actualizando tamaño data: {}", e))?;
    final_file.write_all(&total_data_size.to_le_bytes()).map_err(|e| format!("Error escribiendo tamaño data: {}", e))?;

    for temp_path in temp_files {
        let _ = fs::remove_file(temp_path);
    }

    let _ = app_handle.emit("export-progress", ExportProgress {
        percentage: 100.0,
        status: "¡Exportación completada con éxito!".to_string(),
    });

    Ok(())
}

#[tauri::command]
fn get_available_piper_models() -> Result<Vec<serde_json::Value>, String> {
    Ok(vec![
        serde_json::json!({ "name": "ar_JO-kareem-low", "language": "Arabic (Jordan)", "quality": "Low", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/low/ar_JO-kareem-low.onnx" }),
        serde_json::json!({ "name": "ar_JO-kareem-medium", "language": "Arabic (Jordan)", "quality": "Medium", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/ar/ar_JO/kareem/medium/ar_JO-kareem-medium.onnx" }),
        serde_json::json!({ "name": "ca_ES-upc_ona-medium", "language": "Catalan (Spain)", "quality": "Medium", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/ca/ca_ES/upc_ona/medium/ca_ES-upc_ona-medium.onnx" }),
        serde_json::json!({ "name": "ca_ES-upc_ona-x_low", "language": "Catalan (Spain)", "quality": "X-Low", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/ca/ca_ES/upc_ona/x_low/ca_ES-upc_ona-x_low.onnx" }),
        serde_json::json!({ "name": "cs_CZ-jirka-low", "language": "Czech (Czech Republic)", "quality": "Low", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/cs/cs_CZ/jirka/low/cs_CZ-jirka-low.onnx" }),
        serde_json::json!({ "name": "cs_CZ-jirka-medium", "language": "Czech (Czech Republic)", "quality": "Medium", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/cs/cs_CZ/jirka/medium/cs_CZ-jirka-medium.onnx" }),
        serde_json::json!({ "name": "de_DE-eva_k-x_low", "language": "German (Germany)", "quality": "X-Low", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/eva_k/x_low/de_DE-eva_k-x_low.onnx" }),
        serde_json::json!({ "name": "de_DE-karlsson-low", "language": "German (Germany)", "quality": "Low", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/karlsson/low/de_DE-karlsson-low.onnx" }),
        serde_json::json!({ "name": "de_DE-thorsten-high", "language": "German (Germany)", "quality": "High", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/high/de_DE-thorsten-high.onnx" }),
        serde_json::json!({ "name": "de_DE-thorsten-medium", "language": "German (Germany)", "quality": "Medium", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/de_DE-thorsten-medium.onnx" }),
        serde_json::json!({ "name": "en_GB-alan-low", "language": "English (Great Britain)", "quality": "Low", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alan/low/en_GB-alan-low.onnx" }),
        serde_json::json!({ "name": "en_GB-alan-medium", "language": "English (Great Britain)", "quality": "Medium", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alan/medium/en_GB-alan-medium.onnx" }),
        serde_json::json!({ "name": "en_GB-cori-high", "language": "English (Great Britain)", "quality": "High", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/cori/high/en_GB-cori-high.onnx" }),
        serde_json::json!({ "name": "en_GB-cori-medium", "language": "English (Great Britain)", "quality": "Medium", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/cori/medium/en_GB-cori-medium.onnx" }),
        serde_json::json!({ "name": "en_US-amy-low", "language": "English (United States)", "quality": "Low", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/low/en_US-amy-low.onnx" }),
        serde_json::json!({ "name": "en_US-amy-medium", "language": "English (United States)", "quality": "Medium", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx" }),
        serde_json::json!({ "name": "en_US-lessac-high", "language": "English (United States)", "quality": "High", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/high/en_US-lessac-high.onnx" }),
        serde_json::json!({ "name": "en_US-lessac-medium", "language": "English (United States)", "quality": "Medium", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx" }),
        serde_json::json!({ "name": "en_US-libritts-high", "language": "English (United States)", "quality": "High", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/libritts/high/en_US-libritts-high.onnx" }),
        serde_json::json!({ "name": "en_US-ryan-high", "language": "English (United States)", "quality": "High", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/high/en_US-ryan-high.onnx" }),
        serde_json::json!({ "name": "en_US-ryan-medium", "language": "English (United States)", "quality": "Medium", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ryan/medium/en_US-ryan-medium.onnx" }),
        serde_json::json!({ "name": "es_AR-daniela-high", "language": "Spanish (Argentina)", "quality": "High", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_AR/daniela/high/es_AR-daniela-high.onnx" }),
        serde_json::json!({ "name": "es_ES-davefx-medium", "language": "Spanish (Spain)", "quality": "Medium", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx" }),
        serde_json::json!({ "name": "es_ES-sharvard-medium", "language": "Spanish (Spain)", "quality": "Medium", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_ES/sharvard/medium/es_ES-sharvard-medium.onnx" }),
        serde_json::json!({ "name": "es_MX-ald-medium", "language": "Spanish (Mexico)", "quality": "Medium", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/ald/medium/es_MX-ald-medium.onnx" }),
        serde_json::json!({ "name": "es_MX-claude-high", "language": "Spanish (Mexico)", "quality": "High", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/claude/high/es_MX-claude-high.onnx" }),
        serde_json::json!({ "name": "fr_FR-gilles-low", "language": "French (France)", "quality": "Low", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/gilles/low/fr_FR-gilles-low.onnx" }),
        serde_json::json!({ "name": "fr_FR-siwis-medium", "language": "French (France)", "quality": "Medium", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx" }),
        serde_json::json!({ "name": "it_IT-paola-medium", "language": "Italian (Italy)", "quality": "Medium", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/it/it_IT/paola/medium/it_IT-paola-medium.onnx" }),
        serde_json::json!({ "name": "ru_RU-denis-medium", "language": "Russian (Russia)", "quality": "Medium", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/denis/medium/ru_RU-denis-medium.onnx" }),
        serde_json::json!({ "name": "ru_RU-irina-medium", "language": "Russian (Russia)", "quality": "Medium", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/irina/medium/ru_RU-irina-medium.onnx" }),
        serde_json::json!({ "name": "zh_CN-huayan-medium", "language": "Chinese (China)", "quality": "Medium", "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/huayan/medium/zh_CN-huayan-medium.onnx" })
    ])
}

#[tauri::command]
fn uninstall_piper_engine(app_handle: tauri::AppHandle) -> Result<(), String> {
    let bin_dir = get_piper_bin_dir(&app_handle);
    if bin_dir.exists() {
        fs::remove_dir_all(&bin_dir).map_err(|e| format!("Error eliminando el motor: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
async fn create_book_shortcut(app_handle: tauri::AppHandle, id: String, title: String, book_path: String) -> Result<(), String> {
    let exe_path = std::env::current_exe().map_err(|e| e.to_string())?;
    
    #[cfg(target_os = "windows")]
    {
        use tauri::path::BaseDirectory;
        let desktop_path = app_handle.path().resolve("", BaseDirectory::Desktop).map_err(|e| e.to_string())?;
        
        // Find the cover image in cache
        let cache_dir = app_handle.path().app_cache_dir().map_err(|e| e.to_string())?;
        let mut hasher = Sha256::new();
        hasher.update(&book_path);
        let hash = hex::encode(hasher.finalize());
        let cached_cover = cache_dir.join("covers").join(format!("{}.img", hash));
        
        // We'll create a persistent icon file in app_data so the shortcut icon doesn't disappear
        // if the cache is cleared, and we'll give it an .ico extension so Windows likes it better.
        let icons_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?.join("shortcut_icons");
        if !icons_dir.exists() {
            let _ = fs::create_dir_all(&icons_dir);
        }
        
        let icon_path = icons_dir.join(format!("{}.ico", id));
        let mut icon_arg = String::new();

        let mut cover_data = if cached_cover.exists() {
            fs::read(&cached_cover).ok()
        } else {
            None
        };

        // If not in cache, try to extract it on the fly
        if cover_data.is_none() {
            let extension = Path::new(&book_path).extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
            let extracted = match extension.as_str() {
                "epub" => epub_cover(&book_path).map(|(d, _)| d),
                "cbz" => cbz_cover(&book_path).map(|(d, _)| d),
                _ => None,
            };
            if let Some(data) = extracted {
                // Save to cache for future use
                let _ = fs::create_dir_all(cached_cover.parent().unwrap());
                let _ = fs::write(&cached_cover, &data);
                cover_data = Some(data);
            }
        }

        if let Some(data) = cover_data {
            // Attempt to load the image data and save it as an actual .ico file
            if let Ok(img) = image::load_from_memory(&data) {
                // Resize to standard icon size to ensure compatibility
                let resized = img.resize_exact(256, 256, image::imageops::FilterType::Lanczos3);
                if let Ok(_) = resized.save_with_format(&icon_path, image::ImageFormat::Ico) {
                    icon_arg = format!("; $s.IconLocation='{}'", icon_path.to_string_lossy());
                } else if let Ok(_) = fs::write(&icon_path, &data) {
                    icon_arg = format!("; $s.IconLocation='{}'", icon_path.to_string_lossy());
                }
            } else if let Ok(_) = fs::write(&icon_path, &data) {
                icon_arg = format!("; $s.IconLocation='{}'", icon_path.to_string_lossy());
            }
        }
        
        // Sanitize title for filename
        let safe_title = title.chars().filter(|c| c.is_alphanumeric() || *c == ' ' || *c == '-' || *c == '_').collect::<String>();
        let shortcut_path = desktop_path.join(format!("{}.lnk", safe_title));
        
        let powershell_script = format!(
            "$s=(New-Object -COM WScript.Shell).CreateShortcut('{}'); $s.TargetPath='{}'; $s.Arguments='--open-book \"{}\"'{}; $s.Save()",
            shortcut_path.to_string_lossy(),
            exe_path.to_string_lossy(),
            id,
            icon_arg
        );
        
        let output = std::process::Command::new("powershell")
            .arg("-NoProfile")
            .arg("-Command")
            .arg(&powershell_script)
            .output()
            .map_err(|e| format!("Error ejecutando PowerShell: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Error creando acceso directo: {}", stderr));
        }
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        return Err("La creación de accesos directos solo está soportada en Windows por ahora.".to_string());
    }
    
    Ok(())
}

#[tauri::command]
fn is_directory(path: &str) -> bool {
    Path::new(path).is_dir()
}

#[tauri::command]
fn get_startup_book() -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    for (i, arg) in args.iter().enumerate() {
        if arg == "--open-book" && i + 1 < args.len() {
            return Some(args[i + 1].clone());
        }
    }
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        tauri_plugin_sql::Migration {
            version: 1,
            description: "create_books_table",
            sql: "CREATE TABLE books (
                id TEXT PRIMARY KEY,
                path TEXT NOT NULL,
                title TEXT NOT NULL,
                author TEXT NOT NULL,
                cover_image TEXT,
                file_type TEXT NOT NULL,
                progress REAL DEFAULT 0,
                date_added INTEGER,
                last_opened INTEGER,
                is_favorite INTEGER DEFAULT 0,
                is_deleted INTEGER DEFAULT 0,
                synopsis TEXT,
                language TEXT,
                category TEXT DEFAULT 'all'
            );",
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 2,
            description: "create_settings_table",
            sql: "CREATE TABLE settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );",
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 3,
            description: "create_shelves_table",
            sql: "CREATE TABLE shelves (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL
            );",
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 5,
            description: "ensure_highlights_table",
            sql: "CREATE TABLE IF NOT EXISTS highlights (
                id TEXT PRIMARY KEY,
                book_id TEXT NOT NULL,
                chapter_id TEXT NOT NULL,
                content TEXT NOT NULL,
                color TEXT DEFAULT 'yellow',
                date_added INTEGER NOT NULL,
                cfi_range TEXT
            );",
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 6,
            description: "create_series_table",
            sql: "CREATE TABLE series (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                cover_image TEXT,
                author TEXT,
                synopsis TEXT
            );",
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
        tauri_plugin_sql::Migration {
            version: 7,
            description: "add_series_info_to_books",
            sql: "ALTER TABLE books ADD COLUMN series_id TEXT;
                  ALTER TABLE books ADD COLUMN volume_number INTEGER;",
            kind: tauri_plugin_sql::MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .setup(|app| {
            let args: Vec<String> = std::env::args().collect();
            for (i, arg) in args.iter().enumerate() {
                if arg == "--open-book" && i + 1 < args.len() {
                    let book_id = args[i + 1].clone();
                    let _ = app.emit("open-book", book_id);
                }
            }
            Ok(())
        })
        .register_uri_scheme_protocol("quil-lib", |app, request| {
            let uri_str = request.uri().to_string();
            
            let parsed_url = match Url::parse(&uri_str) {
                Ok(u) => u,
                Err(_) => return Response::builder().status(400).body(Vec::new()).unwrap(),
            };
            
            let query_params: HashMap<String, String> = parsed_url.query_pairs().into_owned().collect();
            let book_path = query_params.get("path").cloned().unwrap_or_default();
            let tts_path = query_params.get("tts").cloned();
            let is_cover = parsed_url.path().contains("cover");

            if let Some(filename) = tts_path {
                let cache_dir = get_tts_cache_dir(app.app_handle());
                let file_path = cache_dir.join(&filename);
                
                if file_path.exists() {
                    if let Ok(data) = fs::read(&file_path) {
                        return Response::builder()
                            .header(CONTENT_TYPE, "audio/wav")
                            .header("Access-Control-Allow-Origin", "*")
                            .status(200)
                            .body(data)
                            .unwrap();
                    }
                }
            }

            let mut cache_path = None;
            if is_cover {
                if let Ok(cache_dir) = app.app_handle().path().app_cache_dir() {
                    let mut hasher = Sha256::new();
                    hasher.update(&book_path);
                    let hash = hex::encode(hasher.finalize());
                    let path = cache_dir.join("covers").join(format!("{}.img", hash));
                    
                    if path.exists() {
                        if let Ok(data) = fs::read(&path) {
                            let mime_path = path.with_extension("mime");
                            let content_type = fs::read_to_string(&mime_path)
                                .unwrap_or_else(|_| "image/jpeg".to_string());
                            let ct_value = HeaderValue::from_str(&content_type)
                                .unwrap_or(HeaderValue::from_static("image/jpeg"));
                            let mut resp = Response::new(data);
                            resp.headers_mut().insert(CONTENT_TYPE, ct_value);
                            resp.headers_mut().insert("Cache-Control", HeaderValue::from_static("max-age=31536000"));
                            return resp;
                        }
                    }
                    cache_path = Some(path);
                }
            }

            let result = if is_cover {
                let extension = Path::new(&book_path).extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
                match extension.as_str() {
                    "epub" => epub_cover(&book_path),
                    "cbz" => cbz_cover(&book_path).map(|(d, m)| (d, m.to_string())),
                    _ => None,
                }
            } else {
                let resource_path = query_params.get("resource").cloned().unwrap_or_default();
                let extension = Path::new(&book_path).extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
                match extension.as_str() {
                    "epub" => {
                        if let Ok(mut doc) = EpubDoc::new(&book_path) {
                            let mime = doc.resources.values()
                                .find(|r| r.path.to_string_lossy().replace('\\', "/") == resource_path)
                                .map(|r| r.mime.clone());
                            
                            if let Some(m) = mime {
                                doc.get_resource_by_path(&resource_path).map(|data| (data, m))
                            } else { None }
                        } else { None }
                    },
                    "cbz" => cbz_resource(&book_path, &resource_path).map(|(d, m)| (d, m.to_string())),
                    _ => None,
                }
            };

            if let Some((data, mime)) = result {
                if let Some(cp) = cache_path {
                    let _ = fs::create_dir_all(cp.parent().unwrap());
                    let _ = fs::write(&cp, &data);
                    let _ = fs::write(cp.with_extension("mime"), &mime);
                }
                let mut resp = Response::new(data);
                let mime_value = HeaderValue::from_str(&mime).unwrap_or(HeaderValue::from_static("application/octet-stream"));
                resp.headers_mut().insert(CONTENT_TYPE, mime_value);
                resp.headers_mut().insert("Cache-Control", HeaderValue::from_static("max-age=3600"));
                resp.headers_mut().insert("Access-Control-Allow-Origin", HeaderValue::from_static("*"));
                resp
            } else {
                Response::builder().status(404).body(Vec::new()).unwrap()
            }
        })
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:library.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            scan_directory,
            scan_file,
            get_epub_metadata,
            get_epub_spine,
            get_epub_toc,
            get_epub_resource,
            get_epub_resource_by_path,
            get_book_image_list,
            get_book_resource,
            export_all_book_images,
            get_book_cover_data,
            get_piper_voices,
            export_audiobook,
            get_available_piper_models,
            download_piper_model,
            delete_piper_voice,
            speak_with_piper,
            clear_tts_cache,
            is_piper_engine_installed,
            download_piper_engine,
            create_book_shortcut,
            uninstall_piper_engine,
            get_startup_book,
            is_directory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn epub_cover(book_path: &str) -> Option<(Vec<u8>, String)> {
    let mut doc = EpubDoc::new(book_path).ok()?;
    doc.get_cover()
}

fn cbz_cover(book_path: &str) -> Option<(Vec<u8>, &'static str)> {
    let file = File::open(book_path).ok()?;
    let mut archive = ZipArchive::new(file).ok()?;
    let mut names: Vec<String> = archive.file_names().map(|n| n.to_string()).collect();
    names.sort();
    
    for name in names {
        let lower = name.to_lowercase();
        if lower.ends_with(".jpg") || lower.ends_with(".jpeg") || lower.ends_with(".png") || lower.ends_with(".webp") {
            let mut entry = archive.by_name(&name).ok()?;
            let mut data = Vec::new();
            entry.read_to_end(&mut data).ok()?;
            return Some((data, mime_from_path(&name)));
        }
    }
    None
}

fn cbz_resource(book_path: &str, internal_path: &str) -> Option<(Vec<u8>, &'static str)> {
    let file = File::open(book_path).ok()?;
    let mut archive = ZipArchive::new(file).ok()?;
    let mut entry = archive.by_name(internal_path).ok()?;
    let mut data = Vec::new();
    entry.read_to_end(&mut data).ok()?;
    Some((data, mime_from_path(internal_path)))
}

fn mime_from_path(path: &str) -> &'static str {
    let lower = path.to_lowercase();
    if lower.ends_with(".jpg") || lower.ends_with(".jpeg") { "image/jpeg" }
    else if lower.ends_with(".png") { "image/png" }
    else if lower.ends_with(".webp") { "image/webp" }
    else if lower.ends_with(".gif") { "image/gif" }
    else if lower.ends_with(".svg") { "image/svg+xml" }
    else { "application/octet-stream" }
}

fn get_voices_dir(app_handle: &tauri::AppHandle) -> std::path::PathBuf {
    app_handle.path().app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("voices")
}

fn get_piper_bin_dir(app_handle: &tauri::AppHandle) -> std::path::PathBuf {
    app_handle.path().app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."))
        .join("bin")
        .join("piper")
}

#[tauri::command]
fn is_piper_engine_installed(app_handle: tauri::AppHandle) -> bool {
    let bin_dir = get_piper_bin_dir(&app_handle);
    let exe_name = if cfg!(windows) { "piper.exe" } else { "piper" };
    let piper_exe = bin_dir.join(exe_name);
    let espeak_dir = bin_dir.join("espeak-ng-data");
    
    piper_exe.exists() && espeak_dir.exists()
}

#[tauri::command]
async fn download_piper_engine(app_handle: tauri::AppHandle) -> Result<(), String> {
    let bin_dir = get_piper_bin_dir(&app_handle);
    if !bin_dir.exists() {
        fs::create_dir_all(&bin_dir).map_err(|e| e.to_string())?;
    }

    let url = if cfg!(windows) {
        "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip"
    } else {
        return Err("OS no soportado para descarga automática de Piper en este momento. Por favor, instálalo manualmente en la carpeta bin/piper.".to_string());
    };

    // Download to a temp file
    let temp_zip = bin_dir.join("piper_download.zip");
    download_file_with_progress(&app_handle, url, &temp_zip, "Descargando motor Piper...").await?;

    // Extract
    {
        let file = File::open(&temp_zip).map_err(|e| format!("Error abriendo zip descargado: {}", e))?;
        let mut archive = ZipArchive::new(file).map_err(|e| format!("Error leyendo archivo Zip: {}. Es posible que la descarga haya fallado.", e))?;
        
        for i in 0..archive.len() {
            let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
            
            // The zip contains a 'piper/' folder, we want to extract its contents directly into bin_dir
            // or handle the 'piper/' prefix.
            let enclosed_name = file.enclosed_name().ok_or("Invalid file name in zip")?;
            
            // Skip the top-level 'piper/' directory entry if it exists
            if enclosed_name.as_os_str() == "piper" || enclosed_name.as_os_str() == "piper/" {
                continue;
            }

            // Remove 'piper/' prefix if present
            let outpath = if enclosed_name.starts_with("piper/") {
                bin_dir.join(enclosed_name.strip_prefix("piper/").unwrap())
            } else if enclosed_name.starts_with("piper\\") {
                bin_dir.join(enclosed_name.strip_prefix("piper\\").unwrap())
            } else {
                bin_dir.join(enclosed_name)
            };

            if (*file.name()).ends_with('/') {
                fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
            } else {
                if let Some(p) = outpath.parent() {
                    if !p.exists() {
                        fs::create_dir_all(&p).map_err(|e| e.to_string())?;
                    }
                }
                let mut outfile = File::create(&outpath).map_err(|e| e.to_string())?;
                std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
            }
        }
    }

    // Clean up
    let _ = fs::remove_file(temp_zip);

    Ok(())
}

fn get_tts_cache_dir(app_handle: &tauri::AppHandle) -> std::path::PathBuf {
    app_handle.path().app_cache_dir().unwrap_or_default().join("tts_cache")
}

fn get_all_voices_dirs(app_handle: &tauri::AppHandle) -> Vec<std::path::PathBuf> {
    let mut dirs = Vec::new();
    
    // 1. App Data (preferred for new downloads)
    if let Ok(data_dir) = app_handle.path().app_data_dir() {
        dirs.push(data_dir.join("voices"));
    }

    // 2. Next to executable
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            dirs.push(exe_dir.join("voices"));
        }
    }

    // 3. Current directory
    if let Ok(cwd) = std::env::current_dir() {
        dirs.push(cwd.join("voices"));
        dirs.push(cwd.join("src-tauri").join("voices"));
    }

    dirs
}

fn find_voice_files(app_handle: &tauri::AppHandle, name: &str) -> Option<(std::path::PathBuf, std::path::PathBuf)> {
    for dir in get_all_voices_dirs(app_handle) {
        let onnx_path = dir.join(name);
        // Check for both name.json and name.onnx.json
        let json_path1 = dir.join(format!("{}.json", name));
        let json_path2 = dir.join(format!("{}.onnx.json", name));
        
        if onnx_path.exists() {
            if json_path1.exists() {
                return Some((onnx_path, json_path1));
            } else if json_path2.exists() {
                return Some((onnx_path, json_path2));
            }
        }
    }
    None
}
