import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const TAURI_ROOT = path.resolve(process.cwd(), 'src-tauri');

describe('Perfect player Tauri permissions', () => {
  it('allows both player-data commands in the main-window capability', () => {
    const permission = fs.readFileSync(
      path.join(TAURI_ROOT, 'permissions/allow-perfect-player-data.toml'),
      'utf8',
    );
    const capability = JSON.parse(
      fs.readFileSync(path.join(TAURI_ROOT, 'capabilities/default.json'), 'utf8'),
    ) as { permissions?: string[] };

    expect(permission).toContain('"fetch_perfect_player_stats"');
    expect(permission).toContain('"debug_perfect_player_apis"');
    expect(permission).toContain('"search_perfect_board_user"');
    expect(capability.permissions).toContain('allow-perfect-player-data');
  });

  it('allows authentication and decrypt commands without exposing credential commands', () => {
    const permission = fs.readFileSync(
      path.join(TAURI_ROOT, 'permissions/allow-perfect-auth.toml'),
      'utf8',
    );
    const capability = JSON.parse(
      fs.readFileSync(path.join(TAURI_ROOT, 'capabilities/default.json'), 'utf8'),
    ) as { permissions?: string[] };

    for (const command of [
      'get_perfect_auth_status',
      'start_perfect_qr_login',
      'start_perfect_steam_login',
      'cancel_perfect_login',
      'clear_perfect_auth',
      'decrypt_perfect_response',
    ]) {
      expect(permission).toContain(`\"${command}\"`);
    }
    expect(capability.permissions).toContain('allow-perfect-auth');
    expect(permission).not.toContain('access_token');
  });
});
