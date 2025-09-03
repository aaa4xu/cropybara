# Cropybara - Webtoon Stitcher & Cropper

Cropybara is a browser-based application designed to help users stitch multiple images into a single vertical strip (like a webtoon/manhwa panel) and then intelligently crop it into smaller, manageable slices. It's built with SvelteKit and leverages modern web APIs for a smooth, client-side experience.

## Workflow

1. Start by uploading your images using one of the many available methods.
2. Set your project name, desired slice height, and choose/configure the cut detection method. Cropybara will analyze your images and suggest initial cut points if an automatic detector is chosen.
3. Review the proposed cuts. Add, remove, or fine-tune their positions in the interactive editor.
4. Once satisfied, Cropybara will process the images and provide a ZIP file containing the final slices.

## Development

### Prerequisites

- [Bun](https://bun.sh/)
- [Node](https://nodejs.org/)

### Running Locally

1. Clone the repository
   ```shell
   git clone https://github.com/your-username/cropybara.git
   cd cropybara
   ```
2. Install dependencies
   ```shell
   bun install
   ```
3. Run the development server
   ```shell
   bun dev
   ```

### Running Tests

```shell
bun run test
```

### Building for Production

```shell
bun run build
```

### Environment Variables

Cropybara uses the following optional environment variables (create a .env file in the project root):

- `PUBLIC_GA_MEASUREMENT_ID`: Your Google Analytics Measurement ID (e.g., G-XXXXXXXXXX) to enable analytics.
- `PUBLIC_YANDEX_OAUTH_CLIENT_ID`: Client ID for Yandex OAuth (used for an optional Yandex Disk integration, which is not part of the main image processing flow for now).
- `PUBLIC_YANDEX_OAUTH_REDIRECT_URI`: Redirect URI for Yandex OAuth.
