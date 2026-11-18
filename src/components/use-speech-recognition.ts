"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { voiceErrorText } from "@/lib/voice-entry";

/** The parts of the browser's Web Speech API this hook uses (TypeScript's DOM types do not include it). */
type RecognitionResult = { readonly isFinal: boolean; readonly [alternative: number]: { readonly transcript: string } };
type RecognitionEvent = { readonly results: { readonly length: number; readonly [index: number]: RecognitionResult } };
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { readonly error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionConstructor = new () => Recognition;
type SpeechWindow = Window & {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
};

function recognitionConstructor(): RecognitionConstructor | undefined {
  const w = window as SpeechWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** Support never changes while the page is open, so there is nothing to listen for. */
const noSubscribe = () => () => {
  // nothing to stop listening to
};

/** The words heard so far, final and not, in order. */
function transcriptOf(event: RecognitionEvent): { text: string; isFinal: boolean } {
  let text = "";
  let isFinal = true;
  for (let i = 0; i < event.results.length; i++) {
    text += event.results[i][0]?.transcript ?? "";
    isFinal &&= event.results[i].isFinal;
  }
  return { text: text.trim(), isFinal };
}

/** What the mic can do, what it hears, and why it stopped. */
export type SpeechRecognitionState = {
  /** False on the server and in browsers without the Web Speech API (Firefox): show no mic at all. */
  isSupported: boolean;
  isListening: boolean;
  /** The words heard so far while listening, for the live preview. */
  interim: string;
  /** Plain words for the last failure (blocked mic, nothing heard, any other stop), or null. */
  error: string | null;
  start: () => void;
  stop: () => void;
};

/**
 * Listens for one English sentence with the browser's own speech recognition, and calls `onFinal` with what was heard.
 * The browser asks for the microphone on the first `start()`, which always follows a tap. An end with nothing heard
 * (Safari on iOS ends early) is reported as "Didn't catch that". Nothing is stored.
 */
export function useSpeechRecognition(onFinal: (text: string) => void): SpeechRecognitionState {
  const isSupported = useSyncExternalStore(
    noSubscribe,
    () => recognitionConstructor() !== undefined,
    () => false,
  );
  const [isListening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const start = useCallback(() => {
    const Ctor = recognitionConstructor();
    if (!Ctor || recognition.current) return;
    const rec = new Ctor();
    rec.lang = "en-US"; // the sentence reader is English
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let heard = false;
    let failed = false;
    rec.onresult = (event) => {
      const { text, isFinal } = transcriptOf(event);
      setInterim(text);
      if (!isFinal || !text || heard) return;
      heard = true;
      onFinalRef.current(text);
    };
    rec.onerror = (event) => {
      // "aborted" comes only from this hook's own abort(), never from the person or the browser.
      if (event.error === "aborted") return;
      failed = true;
      setError(voiceErrorText(event.error));
    };
    rec.onend = () => {
      recognition.current = null;
      setListening(false);
      setInterim("");
      if (!heard && !failed) setError(voiceErrorText("no-speech"));
    };
    setError(null);
    setInterim("");
    try {
      rec.start();
    } catch (err) {
      setError(voiceErrorText(err instanceof Error ? err.name : "start-failed"));
      return;
    }
    recognition.current = rec;
    setListening(true);
  }, []);

  const stop = useCallback(() => recognition.current?.stop(), []);

  // Leaving the page while it listens: let go of the handlers first, so nothing sets state on a gone component.
  useEffect(
    () => () => {
      const rec = recognition.current;
      if (!rec) return;
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      rec.abort();
      recognition.current = null;
    },
    [],
  );

  return { isSupported, isListening, interim, error, start, stop };
}
