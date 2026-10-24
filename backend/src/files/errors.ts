export class FileInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileInputError";
  }
}
