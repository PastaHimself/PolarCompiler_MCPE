export function joinOutputPath(...parts) {
  return parts
    .filter(Boolean)
    .join("/")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/");
}

export function behaviorPath(...parts) {
  return joinOutputPath("behavior_pack", ...parts);
}

export function resourcePath(...parts) {
  return joinOutputPath("resource_pack", ...parts);
}
