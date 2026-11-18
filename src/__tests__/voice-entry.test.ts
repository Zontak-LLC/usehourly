import { describe, expect, it } from "vitest";

import {
  closestClients,
  parseVoiceEntry,
  VOICE_BLOCKED,
  VOICE_NO_SPEECH,
  VOICE_STOPPED,
  type VoiceClient,
  voiceErrorText,
} from "@/lib/voice-entry";

// A freelancer's own clients, as clients.list gives them (projects by name). Zephyr is archived: it never matches.
const clients: VoiceClient[] = [
  { id: "c-acme", name: "Acme", projects: [{ id: "p-acme", name: "General" }] },
  { id: "c-north", name: "Northwind Bakery", projects: [{ id: "p-north", name: "Checkout" }] },
  {
    id: "c-fern",
    name: "Blue Fern",
    projects: [
      { id: "p-fern-web", name: "Website" },
      { id: "p-fern-brand", name: "Branding" },
    ],
  },
  { id: "c-zephyr", name: "Zephyr", archived: true, projects: [{ id: "p-zephyr", name: "Old work" }] },
];

type Row = [said: string, expected: { minutes?: number; projectId?: string; unknownClient?: string; note: string }];

describe("saying a time entry: what lands in the Log time card", () => {
  const rows: Row[] = [
    [
      "two hours on Northwind, fixing the checkout page",
      { minutes: 120, projectId: "p-north", note: "Fixing the checkout page" },
    ],
    ["an hour for Acme website call", { minutes: 60, projectId: "p-acme", note: "Website call" }],
    ["half an hour on Acme", { minutes: 30, projectId: "p-acme", note: "" }],
    ["an hour and a half on Acme, emails", { minutes: 90, projectId: "p-acme", note: "Emails" }],
    ["one and a half hours on Acme", { minutes: 90, projectId: "p-acme", note: "" }],
    ["90 minutes on Acme", { minutes: 90, projectId: "p-acme", note: "" }],
    ["1.5 hours on Acme", { minutes: 90, projectId: "p-acme", note: "" }],
    ["1,5 hours on Acme", { minutes: 90, projectId: "p-acme", note: "" }],
    ["2h for Acme", { minutes: 120, projectId: "p-acme", note: "" }],
    ["1:30 on Northwind Bakery, invoices", { minutes: 90, projectId: "p-north", note: "Invoices" }],
    ["2 hours and 15 minutes for Acme, planning", { minutes: 135, projectId: "p-acme", note: "Planning" }],
    ["fixing tests for two hours on Acme", { minutes: 120, projectId: "p-acme", note: "Fixing tests" }],
    ["two hours on the Northwind site", { minutes: 120, projectId: "p-north", note: "Site" }],
    // A project name wins over the client: Website is Blue Fern's.
    ["three hours on Website, new header", { minutes: 180, projectId: "p-fern-web", note: "New header" }],
    // No "on" or "for": the name is found anywhere in the sentence.
    ["two hours Northwind Bakery", { minutes: 120, projectId: "p-north", note: "" }],
    // Unknown client: the heard name is kept for the chips, and no project is picked.
    ["two hours on Zephyr, design", { minutes: 120, unknownClient: "Zephyr", note: "Design" }],
    ["an hour for Red Kite Studio, logo", { minutes: 60, unknownClient: "Red Kite Studio", note: "Logo" }],
    ["an hour on emails", { minutes: 60, unknownClient: "emails", note: "" }],
    // No time said: the hours are asked for, the rest still fills.
    ["on Acme, fixing tests", { projectId: "p-acme", note: "Fixing tests" }],
    ["", { note: "" }],
  ];

  it.each(rows)("%s", (said, expected) => {
    const got = parseVoiceEntry(said, { clients });
    expect({
      minutes: got.minutes,
      projectId: got.projectId,
      unknownClient: got.unknownClient,
      note: got.note,
    }).toEqual({ minutes: undefined, projectId: undefined, unknownClient: undefined, ...expected });
  });

  it("names the matched client, so the Heard line can say who it picked", () => {
    expect(parseVoiceEntry("two hours on Northwind", { clients }).clientName).toBe("Northwind Bakery");
  });

  it("gives a client with several projects the remembered last project when it is that client's, else its first", () => {
    const said = "three hours on Blue Fern, homepage";
    expect(parseVoiceEntry(said, { clients, lastProjectId: "p-fern-brand" })).toMatchObject({
      minutes: 180,
      projectId: "p-fern-brand",
      note: "Homepage",
    });
    expect(parseVoiceEntry(said, { clients, lastProjectId: "p-acme" }).projectId).toBe("p-fern-web");
    expect(parseVoiceEntry(said, { clients }).projectId).toBe("p-fern-web");
  });

  it("never guesses between two clients that match equally well: no project, and the chips ask", () => {
    const harbors: VoiceClient[] = [
      { id: "c-h1", name: "Harbor Studio", projects: [{ id: "p-h1", name: "General" }] },
      { id: "c-h2", name: "Harbor Labs", projects: [{ id: "p-h2", name: "General" }] },
    ];
    const tie = parseVoiceEntry("two hours on Harbor, review", { clients: harbors });
    expect(tie).toEqual({ minutes: 120, unknownClient: "Harbor", note: "Review" });
    // The whole name said is no tie.
    expect(parseVoiceEntry("two hours on Harbor Labs", { clients: harbors }).projectId).toBe("p-h2");
    // Two projects of the same name under two clients: no guess either.
    expect(parseVoiceEntry("an hour on General", { clients: harbors }).projectId).toBeUndefined();
  });

  it("skips archived clients, even when their name is said in full", () => {
    expect(parseVoiceEntry("two hours on Zephyr", { clients }).projectId).toBeUndefined();
  });
});

describe("the not-found chips", () => {
  it("offer up to three closest clients that can be logged to, never an archived one", () => {
    const near = closestClients("Northwnd", clients);
    expect(near).toHaveLength(3);
    expect(near[0].name).toBe("Northwind Bakery");
    expect(closestClients("Zephyr", clients).map((c) => c.id)).not.toContain("c-zephyr");
    expect(closestClients("Acme", clients, 1).map((c) => c.name)).toEqual(["Acme"]);
  });
});

describe("speech errors in plain words", () => {
  it.each([
    ["not-allowed", VOICE_BLOCKED],
    ["service-not-allowed", VOICE_BLOCKED],
    ["no-speech", VOICE_NO_SPEECH],
    ["network", VOICE_STOPPED],
    ["audio-capture", VOICE_STOPPED],
  ])("%s", (code, words) => {
    expect(voiceErrorText(code)).toBe(words);
  });
});
