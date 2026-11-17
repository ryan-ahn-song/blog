# Profile and banner image editing

Selecting a profile photo, profile cover or post banner opens a crop dialog before any upload. The dialog supports dragging, arrow-key positioning, zoom, arbitrary rotation, 90-degree turns and reset. Existing images have an Image adjustment action too. Inline document images retain their existing upload behavior.

| Purpose | Preview frame | Saved dimensions |
| --- | --- | --- |
| Profile photo | Circle | 400 × 400 |
| Profile cover | 3:1 rectangle | 1500 × 500 |
| Post/notice banner | 16:9 rectangle | 1600 × 900 |

Cancel resolves without uploading or modifying the current image. Apply exports the selected area in the browser, then uploads it through the existing authenticated media API. Profile changes still require Profile save; post banner changes still require the post save/upload confirmation. Only the adjusted result is stored in R2. The selected original file remains available for readjustment while that editor stays open. After reopening a saved image, readjustment starts from the saved crop; choose the original file again to recover areas outside it.

The cropper and its styles load on demand. Output is WebP at quality 0.92, with the browser's PNG fallback supported, and preserves transparency. Canvas export discards original EXIF metadata. The transform draws directly into a bounded output canvas rather than allocating a full-resolution rotated canvas.

Client preflight checks MIME/signature, the existing 8MB size limit and 8,192px/24-megapixel dimensions before pixel decoding. Dimension parsing is shared with backend validation. Existing-image editing only fetches same-origin `/api/media/` resources with the current account session. The server continues to enforce authentication, CSRF, file signatures, dimensions, rate limits, quotas and image ownership.

Validation includes browser pixel comparisons for 0/90/-90/180-degree rotation, crop offsets, all three output sizes, EXIF orientation and unsupported/oversized inputs. Isolated D1/R2 UI checks cover cancellation without upload, new-file selection, existing-image readjustment, keyboard zoom/position, free rotation, reset, profile save and post confirmation. Existing security/performance and render checks also pass.

Crop interaction library: [react-easy-crop](https://github.com/ValentinH/react-easy-crop).
