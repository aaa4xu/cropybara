export interface ImagesSaver {
  save(name: string, images: AsyncGenerator<File>, onprogress?: () => void): Promise<void>;
}
