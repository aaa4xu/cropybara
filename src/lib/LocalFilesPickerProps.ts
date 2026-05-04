export interface LocalFilesPickerProps {
  onFiles: (files: File[]) => void | Promise<void>;
  disabled?: boolean;
  onSourceSelected?: () => void;
}
