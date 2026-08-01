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
    expect(permission).toContain('"search_perfect_board_user"');
    expect(capability.permissions).toContain('allow-perfect-player-data');
  });
});
