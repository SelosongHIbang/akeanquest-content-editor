import type { Chapter, DialogueNode, IdleEntry, IdlePool, Scene } from "../types/content";

export type WordBankReferenceEntry = {
  id: string;
  akeanon: string;
};

const WORD_REFERENCE_RE = /\\([^\s\\,.;!?()[\]{}"']+)/g;

export function extractWordReferences(text: string): string[] {
  const refs: string[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(WORD_REFERENCE_RE)) {
    const reference = match[1].trim();
    const key = reference.toLocaleLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      refs.push(reference);
    }
  }

  return refs;
}

export function resolveWordReferences(
  text: string,
  wordBank: WordBankReferenceEntry[],
): { wordIds: string[]; unresolved: string[] } {
  const wordIds: string[] = [];
  const unresolved: string[] = [];
  const seenIds = new Set<string>();

  for (const reference of extractWordReferences(text)) {
    const matches = wordBank.filter(
      (word) => word.akeanon.trim().toLocaleLowerCase() === reference.toLocaleLowerCase(),
    );

    if (!matches.length) {
      unresolved.push(reference);
      continue;
    }

    for (const match of matches) {
      if (!seenIds.has(match.id)) {
        seenIds.add(match.id);
        wordIds.push(match.id);
      }
    }
  }

  return { wordIds, unresolved };
}

export function syncWordIdsFromText(
  text: string,
  currentWordIds: string[] | undefined,
  wordBank: WordBankReferenceEntry[],
): string[] {
  if (!extractWordReferences(text).length) return currentWordIds ?? [];
  return resolveWordReferences(text, wordBank).wordIds;
}

function syncDialogueNode(node: DialogueNode, wordBank: WordBankReferenceEntry[]): DialogueNode {
  const wordIds = syncWordIdsFromText(node.text, node.word_ids, wordBank);
  return JSON.stringify(wordIds) === JSON.stringify(node.word_ids ?? [])
    ? node
    : { ...node, word_ids: wordIds };
}

function resolveScene(scene: Scene, wordBank: WordBankReferenceEntry[]): Scene {
  return scene.map((node) => (
    "speaker" in node && "text" in node ? syncDialogueNode(node, wordBank) : node
  ));
}

function resolveIdlePool(pool: IdlePool, wordBank: WordBankReferenceEntry[]): IdlePool {
  const resolveEntry = (entry: IdleEntry) => {
    const wordIds = syncWordIdsFromText(entry.text, entry.word_ids, wordBank);
    return JSON.stringify(wordIds) === JSON.stringify(entry.word_ids ?? [])
      ? entry
      : { ...entry, word_ids: wordIds };
  };

  return {
    low: pool.low.map(resolveEntry),
    med: pool.med.map(resolveEntry),
    high: pool.high.map(resolveEntry),
  };
}

function sameData(a: Scene | IdlePool, b: Scene | IdlePool): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function resolveChapterWordReferences(
  chapters: Record<string, Chapter>,
  wordBank: WordBankReferenceEntry[],
): Record<string, Chapter> {
  let changed = false;

  const nextChapters: Record<string, Chapter> = {};

  for (const [chapterId, chapter] of Object.entries(chapters)) {
    let chapterChanged = false;
    const nextChapter: Chapter = {};

    for (const [name, data] of Object.entries(chapter)) {
      const nextData = Array.isArray(data)
        ? resolveScene(data, wordBank)
        : resolveIdlePool(data, wordBank);

      nextChapter[name] = nextData;
      if (!sameData(data, nextData)) chapterChanged = true;
    }

    nextChapters[chapterId] = nextChapter;
    if (chapterChanged) changed = true;
  }

  return changed ? nextChapters : chapters;
}
