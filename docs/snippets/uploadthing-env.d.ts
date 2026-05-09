declare module "uploadthing/server" {
  export class UTApi {
    uploadFiles(file: File | File[]): Promise<{
      data: {
        key: string;
        url: string;
        name: string;
        size: number;
      };
      error: null;
    }>;
  }
}
