// Preset avatar gallery for players who sign up with email/password (Google
// Sign-In already supplies a photo). Rendered as inline SVG data URIs so no
// image hosting/upload pipeline is needed, matching the favicon in index.html.
const PALETTE = [
  { id: "default", color: "#66bb6a" },
  { id: "fire", color: "#ff7043" },
  { id: "ice", color: "#4fc3f7" },
  { id: "cyber", color: "#ab47bc" },
  { id: "golden", color: "#ffd54f" },
  { id: "odyssey", color: "#1c2b52" },
  { id: "rose", color: "#ec407a" },
  { id: "teal", color: "#26a69a" }
];

function avatarUrl(color) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><circle cx='32' cy='32' r='32' fill='${color}'/><text x='32' y='43' font-size='30' text-anchor='middle'>🐍</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const AVATARS = PALETTE.map(({ id, color }) => ({ id, color, url: avatarUrl(color) }));

export function getAvatar(id) {
  return AVATARS.find(a => a.id === id) ?? AVATARS[0];
}
