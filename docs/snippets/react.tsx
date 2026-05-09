import { useUploads } from "uplift-io/react";
import type { Uploads } from "./quickstart";

export function AvatarUploader() {
  const upload = useUploads<Uploads>("/api/upload");

  return (
    <input
      type="file"
      accept="image/*"
      onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        if (file) void upload.avatar(file);
      }}
    />
  );
}
