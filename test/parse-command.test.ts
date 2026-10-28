import { describe, expect, it } from "vitest";
import { parseCommand } from "../src/bot/parse-command";

describe("parseCommand", () => {
  it("parses a plain command", () => {
    expect(parseCommand("/start")).toEqual({ command: "start", args: "" });
  });

  it("lowercases the command and trims arguments", () => {
    expect(parseCommand("  /Search   The Matrix  ")).toEqual({
      command: "search",
      args: "The Matrix",
    });
  });

  it("accepts a command addressed to this bot", () => {
    expect(parseCommand("/search@MyBot heat", "MyBot")).toEqual({
      command: "search",
      args: "heat",
    });
  });

  it("ignores commands addressed to another bot", () => {
    expect(parseCommand("/search@OtherBot heat", "MyBot")).toBeNull();
  });

  it("does not enforce a mention when BOT_USERNAME is unknown", () => {
    expect(parseCommand("/search@OtherBot heat", null)).toEqual({
      command: "search",
      args: "heat",
    });
  });

  it("rejects non-commands and empty commands", () => {
    expect(parseCommand("hello")).toBeNull();
    expect(parseCommand("/")).toBeNull();
    expect(parseCommand("   ")).toBeNull();
  });

  it("keeps multi-word and multiline arguments", () => {
    expect(parseCommand("/search Spider Man\n2002")).toEqual({
      command: "search",
      args: "Spider Man\n2002",
    });
  });
});
