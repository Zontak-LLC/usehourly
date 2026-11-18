"use client";

import { useState } from "react";

import { Mic, Plus, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { type SpeechRecognitionState, useSpeechRecognition } from "@/components/use-speech-recognition";
import { browserStorage, readLastProject } from "@/lib/picked-project";
import {
  closestClients,
  parseVoiceEntry,
  projectForClient,
  VOICE_LISTENING,
  VOICE_NO_TIME,
  type VoiceClient,
} from "@/lib/voice-entry";

import { SetupForm } from "./setup-form";

/** What a spoken sentence (or Clear) puts in the Log time card: the time, the project when one was matched, the note. */
export type VoiceFill = { minutes?: number; projectId?: string; note: string };

/** The voice state the Log time card's slots read: the mic, the lines under the time, the not-found chips. */
export type VoiceEntryState = {
  speech: SpeechRecognitionState;
  clients: readonly VoiceClient[];
  /** The last sentence heard, shown as "Heard: …" until Clear or a save. */
  heard: string | null;
  /** The words heard so far while the mic listens (greyed in the description box), else empty. */
  liveWords: string;
  hasTime: boolean;
  /** A client name that matched none of the user's clients: Log time waits for a chip or a new project. */
  unknown: string | null;
  isAdding: boolean;
  setAdding: (isAdding: boolean) => void;
  /** Empties what the voice filled and the Heard line. */
  clear: () => void;
  /** Forgets the Heard line and the not-found state (after a save), leaving the fields as they are. */
  reset: () => void;
  /** Picks a project for the unknown name (a chip, or the project just made) and ends the not-found state. */
  pick: (projectId: string) => void;
};

/**
 * The voice part of the Log time card. `onFill` writes the three values the way typing does; `onPick` picks a project
 * (the card's own `remember`). Nothing is ever saved from here: the person still taps Log time.
 */
export function useVoiceEntry({
  clients,
  onFill,
  onPick,
}: {
  clients: readonly VoiceClient[];
  onFill: (fill: VoiceFill) => void;
  onPick: (projectId: string) => void;
}): VoiceEntryState {
  const [heard, setHeard] = useState<string | null>(null);
  const [hasTime, setHasTime] = useState(true);
  const [unknown, setUnknown] = useState<string | null>(null);
  const [isAdding, setAdding] = useState(false);
  const reset = () => {
    setHeard(null);
    setUnknown(null);
    setAdding(false);
  };
  const speech = useSpeechRecognition((text) => {
    const entry = parseVoiceEntry(text, { clients, lastProjectId: readLastProject(browserStorage()) });
    setHeard(text);
    setHasTime(entry.minutes !== undefined);
    setUnknown(entry.unknownClient ?? null);
    setAdding(false);
    onFill({ minutes: entry.minutes, projectId: entry.projectId, note: entry.note });
  });
  return {
    speech,
    clients,
    heard,
    liveWords: speech.isListening ? speech.interim : "",
    hasTime,
    unknown,
    isAdding,
    setAdding,
    reset,
    clear: () => {
      reset();
      onFill({ note: "" });
    },
    pick: (projectId) => {
      setUnknown(null);
      setAdding(false);
      onPick(projectId);
    },
  };
}

/**
 * The round "Say it" mic at the right end of the time field: neutral, never amber (amber is Log time's). It pulses
 * while it listens; a second tap stops. Not rendered at all where the browser cannot listen.
 */
export function MicButton({ voice }: { voice: VoiceEntryState }) {
  const { speech } = voice;
  if (!speech.isSupported) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      aria-label="Say it"
      aria-pressed={speech.isListening}
      onClick={speech.isListening ? speech.stop : speech.start}
      className={`absolute top-0 right-0 size-11 rounded-full text-muted-foreground hover:text-foreground ${
        speech.isListening ? "bg-muted text-foreground motion-safe:animate-[mic-pulse_1.4s_ease-in-out_infinite]" : ""
      }`}
    >
      <Mic className="size-5" aria-hidden />
    </Button>
  );
}

/** The one line under the time field: listening, what was heard (with Clear), or why the mic stopped. */
export function VoiceLines({ voice }: { voice: VoiceEntryState }) {
  const { speech, heard } = voice;
  if (speech.isListening)
    return (
      <p aria-live="polite" className="text-muted-foreground text-xs sm:col-span-2">
        {VOICE_LISTENING}
      </p>
    );
  if (speech.error)
    return (
      <p role="alert" className="text-foreground text-sm sm:col-span-2">
        {speech.error}
      </p>
    );
  if (!heard) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-1 text-muted-foreground text-xs sm:col-span-2">
      <span>
        Heard: “{heard}”{voice.hasTime ? "" : ` · ${VOICE_NO_TIME}`}
      </span>
      <button
        type="button"
        onClick={voice.clear}
        className="min-h-8 rounded px-1 font-semibold text-foreground underline underline-offset-2"
      >
        Clear
      </button>
    </p>
  );
}

/**
 * In place of the project pills (`children`) when the heard client is not one of the user's: up to three closest
 * clients, then "+ Add <name>", which opens the Add a client form under the card's form.
 */
export function UnknownClientRow({ voice, children }: { voice: VoiceEntryState; children: React.ReactNode }) {
  const { unknown } = voice;
  if (!unknown) return children;
  const near = closestClients(unknown, voice.clients);
  return (
    <fieldset className="grid min-w-0 flex-1 gap-2 rounded-lg border border-dashed px-2.5 py-2">
      <legend className="float-left flex items-center gap-1.5 text-sm">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />“{unknown}” isn't one of your clients
      </legend>
      <div className="flex flex-wrap gap-2">
        {near.map((client) => (
          <Button
            key={client.id}
            type="button"
            variant="outline"
            className="h-9 rounded-full px-3"
            onClick={() => {
              const projectId = projectForClient(client, readLastProject(browserStorage()));
              if (projectId) voice.pick(projectId);
            }}
          >
            {client.name}
          </Button>
        ))}
        <Button
          type="button"
          variant="outline"
          aria-expanded={voice.isAdding}
          className="h-9 gap-1 rounded-full px-3"
          onClick={() => voice.setAdding(!voice.isAdding)}
        >
          <Plus className="size-3.5 text-foreground/60" aria-hidden strokeWidth={3} />
          Add {unknown}
        </Button>
      </div>
    </fieldset>
  );
}

/** The Add a client form for the unknown name. Outside the card's form: one form may not sit inside another. */
export function VoiceAddClient({ voice }: { voice: VoiceEntryState }) {
  if (!voice.unknown || !voice.isAdding) return null;
  return (
    <div className="border-t pt-3">
      <SetupForm clientName={voice.unknown} onDone={voice.pick} onCancel={() => voice.setAdding(false)} />
    </div>
  );
}
