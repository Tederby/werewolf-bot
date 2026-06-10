/**
 * winCondition.js — Win Condition Checker
 *
 * Kondisi menang:
 *  - Village Win: Semua werewolf telah tereliminasi
 *  - Werewolf Win: Jumlah werewolf >= jumlah non-werewolf
 */

import { getAlivePlayers } from '../gameState.js';

/**
 * @returns {{ winner: 'village'|'werewolf', reason: string } | null}
 */
export function checkWinCondition() {
  const alive = getAlivePlayers();
  const ww = alive.filter(p => p.data.role === 'werewolf');
  const nonWw = alive.filter(p => p.data.role !== 'werewolf');

  if (ww.length === 0) {
    return {
      winner: 'village',
      reason: '🏘️ **Semua Werewolf telah dieliminasi!**\nDesa kembali aman.',
    };
  }

  if (ww.length >= nonWw.length) {
    return {
      winner: 'werewolf',
      reason: '🐺 **Werewolf mendominasi desa!**\nDesa telah jatuh ke tangan serigala.',
    };
  }

  return null;
}
