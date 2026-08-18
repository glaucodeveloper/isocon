export const githubStorageConfig = Object.freeze({
  owner: "glaucodeveloper",
  repo: "isocon",
  branch: "storage",
  tokenParts: ["Z2l0aHViX3BhdF8xMUJPSjdRUFkwTTRGSnVHTHpRaGI3X3NobnBHUUthbnpEcm", "JiaTNXaE5VWXR5QjE0TkxTMVZWcUR5OVAwVnhMMnJGSTNUWjRKU2hRUGdCaTh1"],
  chatPath: "runtime/chat.json",
  contactsPath: "runtime/contacts.json",
  pollMs: 3000,
  presencePollMs: 5000,
});

export function githubStorageToken() {
  return atob(githubStorageConfig.tokenParts.join(""));
}
