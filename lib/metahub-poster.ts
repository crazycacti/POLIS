export function metahubPosterUrls(imdbId: string): string[] {
  const id = imdbId.trim();
  return [
    `https://images.metahub.space/poster/medium/${id}/img.jpg`,
    `https://live.metahub.space/poster/medium/${id}/img`,
    `https://live.metahub.space/poster/small/${id}/img`,
  ];
}

export function metahubPosterUrl(imdbId: string): string {
  return metahubPosterUrls(imdbId)[0]!;
}
