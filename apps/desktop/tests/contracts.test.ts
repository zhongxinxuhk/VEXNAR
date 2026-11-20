// Copyright (c) 2026 xuzhongxin <xuzhongxin@sec.hn.cn>
// Repository: https://github.com/zhongxinxuhk/VEXNAR
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  agentEventSchema,
  messageAppendSchema,
  newApiLoginSchema,
  newApiStateSchema,
  publicSettingsSchema,
  sessionCreateSchema,
  settingsSchema,
} from "@shared/contracts";

describe("settings contracts", () => {
  it("applies desktop defaults", () => {
    const settings = settingsSchema.parse({});
    expect(settings.theme).toBe("light");
    expect(settings.workspaceRoot).toBe("");
    expect(settings.model).toBe("gpt-5-codex");
    expect(settings.newApiModels).toEqual([]);
    expect(settings.baseUrl).toBe("");
    expect(settings.displayName).toBe("");
    expect(settings.avatarColor).toBe("orange");
  });

  it("rejects an unknown avatar color", () => {
    expect(settingsSchema.safeParse({ avatarColor: "pink" }).success).toBe(
      false,
    );
  });

  it("keeps the API key out of public settings", () => {
    const publicSettings = publicSettingsSchema.parse({
      theme: "system",
      model: "local-model",
      hasApiKey: true,
    });
    expect(publicSettings.hasApiKey).toBe(true);
    expect(publicSettings.avatarColor).toBe("orange");
    expect("apiKey" in publicSettings).toBe(false);
    expect("backendUrl" in publicSettings).toBe(false);
  });

  it("rejects an empty model", () => {
    expect(settingsSchema.safeParse({ model: "   " }).success).toBe(false);
  });
});

describe("session and message contracts", () => {
  it("defaults a new session title and workspace", () => {
    const session = sessionCreateSchema.parse({});
    expect(session.title).toBe("New chat");
    expect(session.workspace).toBe("");
  });

  it("requires message content", () => {
    expect(
      messageAppendSchema.safeParse({
        sessionId: "s1",
        role: "user",
        content: "",
      }).success,
    ).toBe(false);
  });
});

describe("agent event contract", () => {
  it("accepts the runtime event union", () => {
    const events = [
      { type: "ready" },
      { type: "assistant_delta", text: "hello" },
      { type: "assistant_done" },
      { type: "tool_start", id: "t1", name: "list_files", input: { depth: 2 } },
      {
        type: "tool_end",
        id: "t1",
        name: "list_files",
        ok: true,
        output: "src/",
      },
      { type: "error", message: "boom" },
    ];
    for (const event of events) {
      expect(agentEventSchema.safeParse(event).success).toBe(true);
    }
  });

  it("rejects unknown events", () => {
    expect(agentEventSchema.safeParse({ type: "mystery" }).success).toBe(false);
  });
});

describe("HXSEC API login contracts", () => {
  it("trims the username and rejects empty credentials", () => {
    const login = newApiLoginSchema.parse({
      username: "  go@sec.hn.cn ",
      password: "local-test-value",
    });
    expect(login.username).toBe("go@sec.hn.cn");
    expect(newApiLoginSchema.safeParse({ username: "", password: "" }).success).toBe(
      false,
    );
  });

  it("represents the two-factor verification stage", () => {
    const state = newApiStateSchema.parse({
      stage: "verification",
      authenticated: false,
      verificationMethods: ["2fa"],
    });
    expect(state.stage).toBe("verification");
    expect(state.verificationMethods).toEqual(["2fa"]);
  });
});

describe('image message contracts', () => {
  const image = { id: 'image', name: 'pasted.png', dataUrl: 'data:image/png;base64,aGVsbG8=' }
  it('accepts image-only messages and rejects unsupported or oversized attachments', () => {
    expect(messageAppendSchema.safeParse({ sessionId: 's', role: 'user', content: '', attachments: [image] }).success).toBe(true)
    expect(messageAppendSchema.safeParse({ sessionId: 's', role: 'user', content: '', attachments: [{ ...image, dataUrl: 'data:image/svg+xml;base64,aGVsbG8=' }] }).success).toBe(false)
    expect(messageAppendSchema.safeParse({ sessionId: 's', role: 'user', content: '', attachments: Array(7).fill(image) }).success).toBe(false)
  })
})
