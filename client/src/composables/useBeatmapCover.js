const PLACEHOLDER_COVERS = Object.freeze([
  "https://osu.ppy.sh/assets/images/1.5f98695d.jpg",
  "https://osu.ppy.sh/assets/images/0.b3bb5a86.jpg",
]);

export function beatmapCoverBackground(beatmapsetId) {
  const id = Number(beatmapsetId);
  if (!Number.isInteger(id) || id <= 0) return "";

  const coverUrl = `https://assets.ppy.sh/beatmaps/${id}/covers/card@2x.jpg`;
  const placeholderUrl = PLACEHOLDER_COVERS[id % PLACEHOLDER_COVERS.length];
  return `url(${coverUrl}), url(${placeholderUrl})`;
}
