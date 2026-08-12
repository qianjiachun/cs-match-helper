<div align="center">

<img src="https://github.com/user-attachments/assets/10ae99ab-5738-4780-a9c4-87ea0cdca1ba" width="128" height="128" alt="CS Match Helper" />

# CS Match Helper

[简体中文](README.zh-CN.md)

<p>
  <a href="https://github.com/qianjiachun/cs-match-helper/stargazers"><img src="https://img.shields.io/github/stars/qianjiachun/cs-match-helper?style=flat-square&logo=github" alt="GitHub stars" /></a>
  <a href="https://github.com/qianjiachun/cs-match-helper/releases/latest"><img src="https://img.shields.io/github/v/release/qianjiachun/cs-match-helper?style=flat-square&logo=github" alt="Latest release" /></a>
  <a href="https://space.bilibili.com/193482"><img src="https://img.shields.io/badge/Bilibili-Xiaochun-FB7299?style=flat-square&logo=bilibili&logoColor=white" alt="Bilibili" /></a>
</p>

Reads match information during the ready phase and presents player statistics, team comparisons, comments, local match history, and optional pre-match AI analysis.

[**Download**](https://cdn.lunaris.win/qianjiachun/cs-match-helper/cs-match-helper.exe?download) · [**GitHub Releases**](https://github.com/qianjiachun/cs-match-helper/releases/latest)

</div>

## Preview

<p align="center">
  <img src="https://github.com/user-attachments/assets/7b4d7716-20bb-4343-9362-54681fd9867e" width="32%" alt="Match data dashboard" />
  <img src="https://github.com/user-attachments/assets/dc70a30e-2c2b-447d-b633-27368f483431" width="32%" alt="Team comparison" />
  <img src="https://github.com/user-attachments/assets/fd436175-01e8-410e-865c-e1b5489b77eb" width="32%" alt="Pre-match AI analysis" />
</p>

## Features

- Match details and player statistics for Perfect World Arena and 5E Arena
- Team comparison, radar charts, party detection, and key-player insights
- Optional AI win-probability and pre-match analysis with a user-provided API key
- Player comments and local comment history
- Local match history with saved match data and AI results
- Chinese and English interfaces
- Portable single-file Windows executable with automatic update support

## Usage

1. Download and run `cs-match-helper.exe`.
2. Select Perfect World Arena or 5E Arena.
3. For 5E, launch the client through CS Match Helper when prompted.
4. Join a match. The application displays available match data during the ready phase.
5. Optionally configure AI analysis and review saved matches in Settings.

## System Requirements

- Windows 10 or later
- Microsoft Edge WebView2 Runtime, normally preinstalled on Windows 11
- Administrator privileges may be required when CS Match Helper launches or reconnects 5E

## Security

- The application does not read CS2 memory, inject code, or modify game files.
- Match data is read from supported platform client-side sources.
- AI credentials are optional and stored locally.
- Comments use an anonymous client key and are not linked to a real account identity.

## Author

Xiaochun · [GitHub](https://github.com/qianjiachun/) · [Bilibili](https://space.bilibili.com/193482)

MIT License
