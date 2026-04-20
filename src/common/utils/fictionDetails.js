// Shared Royal Road parsers.
//
// Two-step flow for author avatar:
//   1. parseFictionDetails(html, fictionId) on /fiction/<id>
//      → gives fictionTitle, coverUrl, authorName, profileId, profileUrl.
//   2. parseAvatarFromProfile(html) on /profile/<profileId>
//      → gives the real authorAvatar CDN URL from <img data-type="avatar">.
//
// The two-step split exists because the fiction page's avatar <img> often
// points at /dist/img/anon.jpg (a placeholder); the profile page always has
// the real CDN src. Stable contracts used: meta[property="books:author"],
// /profile/<id> URL shape, <img data-type="avatar">.

export function parseFictionDetails(html, fictionId) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const fictionTitle = extractTitle(doc);
  const coverUrl = extractCover(doc);
  const { authorName, profileId, profileUrl } = extractAuthor(doc);

  return {
    fictionId: String(fictionId),
    fictionTitle: fictionTitle || 'Unknown',
    fictionUrl: `https://www.royalroad.com/fiction/${fictionId}`,
    coverUrl,
    authorName,
    profileId,
    profileUrl,
  };
}

export function parseAvatarFromProfile(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const img of doc.querySelectorAll('img[data-type="avatar"]')) {
    const src = img.getAttribute('src') || '';
    if (src.includes('royalroadcdn.com') && src.includes('/avatars/avatar-')) {
      return src;
    }
  }
  return '';
}

function extractTitle(doc) {
  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content');
  if (ogTitle) return ogTitle.replace(/\s*\|\s*Royal Road.*$/i, '').trim();

  const coverAlt = doc.querySelector('img[data-type="cover"]')?.getAttribute('alt');
  if (coverAlt) return coverAlt.trim();

  const h3 = doc.querySelector('h3.text-on-surface-strong')?.textContent?.trim();
  if (h3) return h3;

  const h1 = doc.querySelector('h1.font-white')?.textContent?.trim();
  if (h1) return h1;

  return '';
}

function extractCover(doc) {
  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
  if (ogImage) return ogImage;

  const coverImg = doc.querySelector('img[data-type="cover"]')?.getAttribute('src');
  if (coverImg) return coverImg;

  const fallback = doc.querySelector('img.cover-art-image, .fiction-header img, .cover-art img')?.getAttribute('src');
  return fallback || '';
}

function extractAuthor(doc) {
  const metaAuthor = doc.querySelector('meta[property="books:author"], meta[name="author"]')?.getAttribute('content')?.trim() || '';

  // Primary: <a href="/profile/<id>"> containing <img data-type="avatar" alt="<name>">.
  // Single stable contract gives profileId + authorName atomically.
  const avatarImgs = doc.querySelectorAll('a[href*="/profile/"] img[data-type="avatar"][alt]');
  for (const img of avatarImgs) {
    const alt = (img.getAttribute('alt') || '').trim();
    if (!alt) continue;
    if (metaAuthor && alt !== metaAuthor) continue;
    const link = img.closest('a[href*="/profile/"]');
    const m = (link?.getAttribute('href') || '').match(/\/profile\/(\d+)/);
    if (m) {
      return {
        authorName: alt,
        profileId: m[1],
        profileUrl: `https://www.royalroad.com/profile/${m[1]}`,
      };
    }
  }

  // Fallback: meta-tag name, match against any /profile/ link by text content.
  if (metaAuthor) {
    for (const link of doc.querySelectorAll('a[href*="/profile/"]')) {
      const text = (link.textContent || '').trim();
      if (text && (text === metaAuthor || text.includes(metaAuthor) || metaAuthor.includes(text))) {
        const m = (link.getAttribute('href') || '').match(/\/profile\/(\d+)/);
        if (m) {
          return {
            authorName: metaAuthor,
            profileId: m[1],
            profileUrl: `https://www.royalroad.com/profile/${m[1]}`,
          };
        }
      }
    }
    return { authorName: metaAuthor, profileId: null, profileUrl: '' };
  }

  // Last resort: any profile link with an <h4> (legacy layout).
  for (const link of doc.querySelectorAll('a[href*="/profile/"]')) {
    const h4 = link.querySelector('h4');
    if (!h4) continue;
    const m = (link.getAttribute('href') || '').match(/\/profile\/(\d+)/);
    if (m) {
      return {
        authorName: h4.textContent.trim(),
        profileId: m[1],
        profileUrl: `https://www.royalroad.com/profile/${m[1]}`,
      };
    }
  }

  return { authorName: '', profileId: null, profileUrl: '' };
}
