import { s3, type S3Options } from "@uplift-io/s3";

export type R2Options = Omit<S3Options, "region" | "endpoint"> & {
  accountId: string;
};

export function r2(options: R2Options) {
  const adapter = s3({
    ...options,
    region: "auto",
    endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true
  });
  return {
    provider: "r2",
    async put(input: Parameters<typeof adapter.put>[0]) {
      const result = await adapter.put(input);
      return { ...result, provider: "r2" };
    },
    async delete(key: string) {
      await adapter.delete?.(key);
    }
  };
}
