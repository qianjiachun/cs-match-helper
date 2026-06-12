use serde::{Deserialize, Serialize};

const GITHUB_RELEASES_URL: &str =
    "https://api.github.com/repos/qianjiachun/cs-match-helper/releases/latest";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub current_version: String,
    pub has_update: bool,
    pub latest_version: Option<String>,
    pub release_notes: Option<String>,
    pub release_url: Option<String>,
    pub published_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    body: Option<String>,
    html_url: String,
    published_at: Option<String>,
}

fn parse_version_parts(version: &str) -> Vec<u32> {
    version
        .trim()
        .trim_start_matches('v')
        .split('.')
        .map(|part| {
            part.chars()
                .take_while(|c| c.is_ascii_digit())
                .collect::<String>()
        })
        .filter(|part| !part.is_empty())
        .filter_map(|part| part.parse().ok())
        .collect()
}

fn is_newer_version(latest: &str, current: &str) -> bool {
    let latest_parts = parse_version_parts(latest);
    let current_parts = parse_version_parts(current);

    if latest_parts.is_empty() || current_parts.is_empty() {
        return false;
    }

    let max_len = latest_parts.len().max(current_parts.len());
    for index in 0..max_len {
        let latest_value = latest_parts.get(index).copied().unwrap_or(0);
        let current_value = current_parts.get(index).copied().unwrap_or(0);

        if latest_value > current_value {
            return true;
        }
        if latest_value < current_value {
            return false;
        }
    }

    false
}

#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
pub async fn check_for_update() -> Result<UpdateCheckResult, String> {
    let current_version = get_app_version();

    let client = reqwest::Client::builder()
        .user_agent("cs-match-helper")
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .get(GITHUB_RELEASES_URL)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|error| format!("检查更新失败: {error}"))?;

    if !response.status().is_success() {
        return Err(format!("检查更新失败: HTTP {}", response.status()));
    }

    let release = response
        .json::<GithubRelease>()
        .await
        .map_err(|error| format!("解析更新信息失败: {error}"))?;

    let has_update = is_newer_version(&release.tag_name, &current_version);

    Ok(UpdateCheckResult {
        current_version,
        has_update,
        latest_version: if has_update {
            Some(release.tag_name)
        } else {
            None
        },
        release_notes: if has_update {
            release.body
        } else {
            None
        },
        release_url: if has_update {
            Some(release.html_url)
        } else {
            None
        },
        published_at: if has_update {
            release.published_at
        } else {
            None
        },
    })
}
