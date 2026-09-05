export const config = {
  osuWebUrl: "https://osu.ppy.sh",
  redirectUri: "http://localhost:3000/",
  allowedApiEndpoints: [
    /^\/beatmaps\/\d+\/scores\/\d+$/,
    /^\/beatmapsets\/\d+$/,
    /^\/users\/\d+$/,
  ] as RegExp[],
};
