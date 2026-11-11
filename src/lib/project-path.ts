export function displayProjectPath(path: string): string {
  // Windows canonical paths can use the extended-length namespace.
  const prefix = "\\\\?\\";
  if (!path.startsWith(prefix)) return path;

  const suffix = path.slice(prefix.length);
  if (suffix.toUpperCase().startsWith("UNC\\")) return "\\\\" + suffix.slice(4);
  return /^[a-z]:\\/i.test(suffix) ? suffix : path;
}
