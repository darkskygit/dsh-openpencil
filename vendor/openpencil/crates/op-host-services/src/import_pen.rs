//! `import_pen` — convert a plaintext `.pen` (or legacy `.op`) document into a
//! current-schema `.op` file.
//!
//! This is the `pen2op` conversion the desktop uses, exposed as an MCP tool so a
//! client can import a document it cannot open directly. The load routes through
//! `load_canonical`, so the version gate, legacy normalization, and unknown-field
//! warnings behave exactly as they do when the desktop opens a file. A plain
//! rename is not enough: normalization rewrites older payloads (version drift,
//! image nodes without `src`, string `fill`) into the current schema.
//!
//! The tool only reads the source and writes the target. It never touches the
//! live editor state, so a failed import cannot damage an open document.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use op_mcp::{McpTool, ToolErrorCode, ToolOutcome};
use serde_json::json;

/// Refuse documents larger than this: import is a copy, not a stream, and a
/// malformed multi-gigabyte file must not be buffered whole.
const MAX_SOURCE_BYTES: u64 = 64 * 1024 * 1024;

pub struct ImportPen;

impl McpTool for ImportPen {
    fn name(&self) -> &str {
        "import_pen"
    }

    fn call(&self, args: &BTreeMap<String, String>) -> ToolOutcome {
        match import(args) {
            Ok(value) => ToolOutcome::OkJson(value),
            Err((code, message)) => ToolOutcome::Err(code, message),
        }
    }
}

pub fn import_pen_snapshot() -> ImportPen {
    ImportPen
}

fn import(args: &BTreeMap<String, String>) -> Result<String, (ToolErrorCode, String)> {
    let source = required_path(args, "path")?;
    let metadata = fs::metadata(&source).map_err(|error| {
        (
            ToolErrorCode::InvalidArgument,
            format!("import_pen: cannot read {}: {error}", source.display()),
        )
    })?;
    if !metadata.is_file() {
        return Err((
            ToolErrorCode::InvalidArgument,
            format!("import_pen: {} is not a regular file", source.display()),
        ));
    }
    if metadata.len() > MAX_SOURCE_BYTES {
        return Err((
            ToolErrorCode::InvalidArgument,
            format!(
                "import_pen: {} is {} bytes, above the {MAX_SOURCE_BYTES}-byte import limit",
                source.display(),
                metadata.len()
            ),
        ));
    }
    let text = fs::read_to_string(&source).map_err(|error| {
        (
            ToolErrorCode::InvalidArgument,
            format!(
                "import_pen: {} is not a readable UTF-8 document: {error}",
                source.display()
            ),
        )
    })?;

    let loaded = op_pen_loader::load_canonical(&text).map_err(|error| {
        (
            ToolErrorCode::InvalidArgument,
            format!("import_pen: {} is not a loadable document: {error:?}", source.display()),
        )
    })?;

    let target = match args.get("target").map(|value| value.trim()) {
        Some(value) if !value.is_empty() => PathBuf::from(value),
        _ => source.with_extension("op"),
    };
    if !target.is_absolute() {
        return Err((
            ToolErrorCode::InvalidArgument,
            format!("import_pen: target must be an absolute path, got {}", target.display()),
        ));
    }
    if same_path(&source, &target) {
        return Err((
            ToolErrorCode::InvalidArgument,
            "import_pen: target must differ from the source; the source is never rewritten".into(),
        ));
    }
    if target.exists() && args.get("overwrite").map(|value| value.trim()) != Some("true") {
        return Err((
            ToolErrorCode::InvalidArgument,
            format!(
                "import_pen: {} already exists; pass overwrite when replacing it",
                target.display()
            ),
        ));
    }

    let serialized = serialize(&loaded.value, op_pen_loader::extract_editor_meta(&text)).map_err(
        |message| (ToolErrorCode::Internal, format!("import_pen: {message}")),
    )?;
    fs::write(&target, serialized).map_err(|error| {
        (
            ToolErrorCode::ToolFailed,
            format!("import_pen: cannot write {}: {error}", target.display()),
        )
    })?;

    let warnings: Vec<String> = loaded.warnings.iter().map(|warning| format!("{warning:?}")).collect();
    Ok(json!({
        "source": source.display().to_string(),
        "target": target.display().to_string(),
        "version": loaded.value.version,
        "warnings": warnings,
    })
    .to_string())
}

/// Serialize the normalized document, carrying any existing top-level
/// `editorMeta` extension through unchanged.
fn serialize(
    document: &jian_ops_schema::document::PenDocument,
    editor_meta: Option<op_pen_loader::EditorMeta>,
) -> Result<String, String> {
    let mut value = serde_json::to_value(document).map_err(|error| error.to_string())?;
    if let Some(meta) = editor_meta {
        if let Some(object) = value.as_object_mut() {
            object.insert("editorMeta".into(), serde_json::to_value(meta).map_err(|error| error.to_string())?);
        }
    }
    let mut text = serde_json::to_string_pretty(&value).map_err(|error| error.to_string())?;
    text.push('\n');
    Ok(text)
}

fn required_path(
    args: &BTreeMap<String, String>,
    key: &str,
) -> Result<PathBuf, (ToolErrorCode, String)> {
    let raw = args.get(key).map(|value| value.trim()).filter(|value| !value.is_empty());
    let Some(raw) = raw else {
        return Err((
            ToolErrorCode::MissingArgument,
            format!("import_pen: {key} is required"),
        ));
    };
    let path = PathBuf::from(raw);
    if !path.is_absolute() {
        return Err((
            ToolErrorCode::InvalidArgument,
            format!("import_pen: {key} must be an absolute path, got {raw}"),
        ));
    }
    Ok(path)
}

/// Compare two paths without requiring either to exist yet.
fn same_path(left: &Path, right: &Path) -> bool {
    match (fs::canonicalize(left), fs::canonicalize(right)) {
        (Ok(a), Ok(b)) => a == b,
        _ => left == right,
    }
}
