export interface LocalFilesPickerProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  onSourceSelected?: () => void;
}
