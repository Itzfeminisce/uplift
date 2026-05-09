import { createUploadClient } from "uplift-io/client";
import type { Uploads } from "../src/uploads";

const upload = createUploadClient<Uploads>("/api/upload");

export default function Page() {
  return (
    <main>
      <h1>Uplift local upload example</h1>
      <input
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void upload.avatar(file);
        }}
      />
    </main>
  );
}
