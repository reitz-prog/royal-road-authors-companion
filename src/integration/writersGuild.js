// Writers Guild (rrwritersguild.com) API client.
//
// 3-step flow:
//   1. GET /api/discord-auth/me.php           → authed user { id, ... }
//   2. GET /api/shoutouts/authors/stories.php → user's RRWG stories, each with `link` to RR fiction
//   3. GET /api/shoutouts/authors/bookings.php?story_id=… → bookings for one story
//
// Auth is cookie-based — host_permissions covers rrwritersguild.com so background
// fetches with credentials: 'include' work as long as the user is signed in.

import { log } from '../common/logging/core.js';

const logger = log.scope('rrwg');
const BASE = 'https://rrwritersguild.com/api';

export class RrwgAuthError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'RrwgAuthError';
  }
}

async function rrwgFetch(path) {
  const url = `${BASE}${path}`;
  console.log('[RR Companion RRWG] →', url);
  const res = await fetch(url, { credentials: 'include', headers: { 'Accept': 'application/json' } });
  console.log('[RR Companion RRWG] ←', res.status, url);
  if (res.status === 401 || res.status === 403) {
    throw new RrwgAuthError('Not signed in to RRWG');
  }
  if (!res.ok) throw new Error(`RRWG ${path} failed: ${res.status}`);
  const text = await res.text();
  if (!text) throw new RrwgAuthError('Empty response from RRWG');
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`RRWG ${path} returned non-JSON: ${text.slice(0, 80)}`);
  }
}

export async function fetchRrwgMe() {
  return rrwgFetch('/discord-auth/me.php');
}

export async function fetchRrwgStories(authorId) {
  return rrwgFetch(`/shoutouts/authors/stories.php?author_id=${encodeURIComponent(authorId)}`);
}

export async function fetchRrwgBookings(storyId) {
  return rrwgFetch(`/shoutouts/authors/bookings.php?story_id=${encodeURIComponent(storyId)}`);
}

// Pull RR fiction ID out of any RR URL.
export function extractFictionId(url) {
  if (!url) return null;
  const m = String(url).match(/\/fiction\/(\d+)/);
  return m ? m[1] : null;
}

// Auto-generated notes summarising what RRWG knows about a booking. User can
// edit these freely afterward — this is just the first draft.
export function buildRrwgNotes(booking) {
  const parts = ['RRWG'];
  if (booking.status) parts.push(booking.status);
  if (booking.isMirror) parts.push('mirror');
  if (!booking.storyLink) parts.push('offline');
  if (booking.authorName) parts.push(`author: ${booking.authorName}`);
  return parts.join(' · ');
}

// Fetch every booking across every one of the user's RRWG stories.
// onProgress?: (step: string) => void — optional callback for live UI updates.
// Returns { needsAuth: false, bookings: [{ booking, ourFictionId, partnerFictionId }] }
// or { needsAuth: true } when the user isn't signed in to RRWG.
export async function fetchAllRrwgBookings(onProgress = () => {}) {
  onProgress('Authenticating with RRWG…');
  let raw;
  try {
    raw = await fetchRrwgMe();
  } catch (err) {
    if (err instanceof RrwgAuthError) return { needsAuth: true };
    throw err;
  }
  // /discord-auth/me.php nests the user under a `user` key.
  const me = raw?.user || raw;
  if (!me?.id) return { needsAuth: true };
  console.log('[RR Companion RRWG] Discord user:', me.id, me.username);

  onProgress('Fetching your stories…');
  const stories = (await fetchRrwgStories(me.id)) || [];
  const storyMap = new Map();
  for (const s of stories) {
    const rrId = extractFictionId(s.link);
    if (rrId) storyMap.set(String(s.id), rrId);
  }
  console.log('[RR Companion RRWG] Stories:', stories.length, 'mapped:', storyMap.size);
  logger.info('RRWG stories fetched', { count: stories.length, mapped: storyMap.size });

  const all = [];
  for (let i = 0; i < stories.length; i++) {
    const s = stories[i];
    onProgress(`Fetching bookings (${i + 1}/${stories.length}) — ${s.title || s.id}…`);
    const bookings = (await fetchRrwgBookings(s.id)) || [];
    console.log('[RR Companion RRWG] Story', s.id, s.title, '→', bookings.length, 'bookings');
    for (const b of bookings) {
      all.push({
        booking: b,
        ourFictionId: storyMap.get(String(b.authorStoryId)) || storyMap.get(String(s.id)) || null,
        partnerFictionId: extractFictionId(b.storyLink),
      });
    }
  }
  console.log('[RR Companion RRWG] Total bookings:', all.length);
  logger.info('RRWG bookings fetched', { totalBookings: all.length });

  return { needsAuth: false, me, bookings: all };
}

export default {
  RrwgAuthError,
  fetchRrwgMe,
  fetchRrwgStories,
  fetchRrwgBookings,
  fetchAllRrwgBookings,
  extractFictionId,
  buildRrwgNotes,
};
