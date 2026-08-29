// osu!-style deterministic nick colors: same nick always gets the same
// color within a session, picked from a fixed palette via a string hash.
const NICK_PALETTE = ["#8e7cf0", "#e06ea3", "#4fb8a3", "#e0a23d", "#5b9de0", "#d1637a", "#7fb04a", "#c084fc"];

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * @param {string} author - nick to color
 * @param {string} [currentUser] - if author matches this, returns the
 *   theme's primary accent color instead of a palette color
 */
export function useNickColor() {
  function nickColor(author, currentUser) {
    if (currentUser && author === currentUser) return "var(--p-primary-color)";
    return NICK_PALETTE[hashString(author) % NICK_PALETTE.length];
  }

  return { nickColor };
}
