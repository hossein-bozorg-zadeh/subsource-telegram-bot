/**
 * Parses `/command@BotName arguments`. Returns null when the text is not a
 * command or when it targets a different bot in a group.
 */
export function parseCommand(
  input: string,
  botUsername: string | null = null,
): { command: string; args: string } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const firstSpace = trimmed.search(/\s/);
  const head = firstSpace === -1 ? trimmed.slice(1) : trimmed.slice(1, firstSpace);
  const rest = firstSpace === -1 ? "" : trimmed.slice(firstSpace).trim();

  const [rawCommand, rawMention] = head.split("@");
  if (!rawCommand) return null;

  if (rawMention && botUsername) {
    if (rawMention.toLowerCase() !== botUsername.toLowerCase()) return null;
  }

  return {
    command: rawCommand.toLowerCase(),
    args: rest,
  };
}
