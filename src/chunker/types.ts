export interface ChunkConfig {
  maxWords: number  // Target words per slide (default 50)
}

export const DEFAULT_CHUNK_CONFIG: ChunkConfig = {
  maxWords: 50,
}
