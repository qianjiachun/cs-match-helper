<div align="center">

<img src="https://github.com/user-attachments/assets/10ae99ab-5738-4780-a9c4-87ea0cdca1ba" width="128" height="128" alt="CS Match Helper" />

# CS Match Helper

[简体中文](README.zh-CN.md)

<p>
  <a href="https://github.com/qianjiachun/cs-match-helper/stargazers"><img src="https://img.shields.io/github/stars/qianjiachun/cs-match-helper?style=flat-square&logo=github&labelColor=FFF3C4&color=EAB308&logoColor=333" alt="GitHub stars" /></a>
  <a href="https://github.com/qianjiachun/cs-match-helper/releases"><img src="https://img.shields.io/github/downloads/qianjiachun/cs-match-helper/total?style=flat-square&logo=github&labelColor=D1FAE5&color=16A34A&logoColor=333" alt="All release downloads" /></a>
  <a href="https://github.com/qianjiachun/cs-match-helper/releases/latest"><img src="https://img.shields.io/github/v/release/qianjiachun/cs-match-helper?style=flat-square&logo=github&labelColor=E9E0FF&color=7C3AED&logoColor=333" alt="Latest release" /></a>
  <a href="https://github.com/qianjiachun/cs-match-helper/releases/latest"><img src="https://img.shields.io/github/release-date/qianjiachun/cs-match-helper?style=flat-square&logo=github&labelColor=CFFAFE&color=0891B2&logoColor=333" alt="Release date" /></a>
  <a href="https://github.com/qianjiachun/cs-match-helper/graphs/commit-activity"><img src="https://img.shields.io/github/commit-activity/m/qianjiachun/cs-match-helper?style=flat-square&logo=github&labelColor=FFEDD5&color=EA580C&logoColor=333" alt="Commit activity" /></a>
  <a href="https://space.bilibili.com/193482"><img src="https://img.shields.io/badge/Bilibili-Xiaochun-FB7299?style=flat-square&logo=bilibili&labelColor=FB7299&color=FB7299&logoColor=white" alt="Bilibili" /></a>
</p>

Automatically reads match information during the ready phase and presents player statistics, team comparisons, and optional pre-match AI analysis.

[**Download**](https://cdn.lunaris.win/qianjiachun/cs-match-helper/cs-match-helper.exe?download) · [**GitHub Releases**](https://github.com/qianjiachun/cs-match-helper/releases/latest)

</div>

## Preview

<p align="center">
  <img src="https://github.com/user-attachments/assets/7b4d7716-20bb-4343-9362-54681fd9867e" width="32%" alt="Match data dashboard" />
  <img src="https://github.com/user-attachments/assets/dc70a30e-2c2b-447d-b633-27368f483431" width="32%" alt="Team comparison" />
  <img src="https://github.com/user-attachments/assets/fd436175-01e8-410e-865c-e1b5489b77eb" width="32%" alt="Pre-match AI analysis" />
</p>

## Features

- **Lightweight:** About 6 MB, low memory usage, and fast startup without affecting game performance
- **Ready to use:** No installation or complex setup; match data appears automatically during the ready phase
- **Match information:** Map, countdown, and both team rosters
- **Player statistics:** Rank, damage, rating, seasonal statistics, and more
- **Team comparison:** Radar charts and party detection
- **AI analysis:** Win probability and pre-match assessment with a configured DeepSeek API key
- **Player comments:** Read and post comments from the match view, then manage comment history in Settings
- **Multiple platforms:** Perfect World Arena and 5E Arena
- **Counter-strafing assistant:** Measures shooting stability and counter-strafing quality with an in-game HUD and Game Bar widget

## Supported Platforms

- Perfect World Arena
- 5E Arena

## Usage

1. Download `cs-match-helper.exe` from the [direct download](https://cdn.lunaris.win/qianjiachun/cs-match-helper/cs-match-helper.exe?download) or [GitHub Releases](https://github.com/qianjiachun/cs-match-helper/releases/latest).
2. Start a supported platform and join a match.
3. The application displays match data automatically when the ready phase begins.
4. Optional: configure a DeepSeek API key in Settings to enable AI analysis, and manage your comment history under My Comments.

## Counter-strafing Assistant

The assistant listens to local movement, crouch, and fire-key input, then estimates movement state and input timing with a speed model. It **does not read game memory or inject code into the game process**. It is intended for deathmatch, aim practice, and regular matches.

| Metric | Description |
| --- | --- |
| **Shooting stability** | Evaluates whether the player had stopped before each shot. A bar chart shows recent shots, average error, and the stable-shot ratio. |
| **Counter-strafing assessment** | Evaluates same-axis direction changes such as A to D. A line chart distinguishes perfect, good, early, and late timing. |

> The counter-strafing assessment was inspired by [cs2.keyiu.cn](http://cs2.keyiu.cn/).

Display modes available from the counter-strafing console:

- **In-game overlay:** For windowed, borderless, and fullscreen-windowed modes
- **Game Bar widget:** For exclusive fullscreen; requires Xbox Game Bar and the CS Match Helper widget, which can be installed from the application

<p align="center">
  <img src="https://github.com/user-attachments/assets/41a1fc5c-44fc-412a-bd38-3e55aca16e8b" width="36%" alt="Counter-strafing Game Bar widget" />
</p>

Quick start:

1. Open the counter-strafing assistant from the title bar.
2. Select a display mode in the Console and start recording.
3. Running as administrator is recommended for global keyboard input. Exclusive fullscreen also requires the Game Bar widget.
4. Review live feedback in the HUD or widget and aggregated results in the Data view.

Key bindings, HUD typography, line width, opacity, speed models, and assessment thresholds are configurable.

## System Requirements

- Windows 10 or later
- [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/), normally preinstalled on Windows 11
- Administrator privileges are recommended for global counter-strafing input capture
- [Xbox Game Bar](https://apps.microsoft.com/detail/9NZKPSTSNW4P) is required for the exclusive-fullscreen widget

## Security

- The application does not modify game files, inject into the game process, or perform cheat-related operations.
- The counter-strafing assistant only observes local keyboard input and estimates movement from a speed model. It does not read game memory or network traffic.
- DeepSeek credentials are optional and stored locally.
- Comments use an anonymous client key and are not linked to a real account identity.

## Author

Xiaochun · [GitHub](https://github.com/qianjiachun/) · [Bilibili](https://space.bilibili.com/193482)

MIT License
