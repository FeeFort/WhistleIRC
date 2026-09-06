export const config = {
  osuWebUrl: "https://osu.ppy.sh",
  redirectUri: "http://localhost:3000/",
  httpHost: process.env.HTTP_HOST || "0.0.0.0",
  httpPort: Number(process.env.HTTP_PORT) || 3000,
  allowedApiEndpoints: [/^\/beatmaps\/\d+$/, /^\/beatmapsets\/\d+$/, /^\/users\/\d+$/] as RegExp[],
};
