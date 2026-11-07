export type ArtworkCandidate = {
  url: string;
  textless: boolean;
};

export type ArtworkLookup = { candidate: ArtworkCandidate | null; degraded: boolean };

export type ArtworkUrlLookup = { url: string | null; degraded: boolean };
