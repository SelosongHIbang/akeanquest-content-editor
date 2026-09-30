export type WordBankReferenceEntry = {
  id: string;
  akeanon: string;
};

const WORD_REFERENCE_RE = /\\([^\\\\s,.;!?()[\]{}"']+)/g;

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
  const references = extractWordReferences(text);
  if (!references.length) return currentWordIds ?? [];
  return resolveWordReferences(text, wordBank).wordIds;
}

export function resolveChapterWordReferences<T extends Record<string, any>>(
  chapters: T,
  wordBank: WordBankReferenceEntry[],
): T {
  let changed = false;

  const nextChapters = Object.fromEntries(
    Object.entries(chapters).map(([chapterId, chapter]) => {
      let chapterChanged = false;
      const nextChapter = Object.fromEntries(
        Object.entries(chapter as Record<string, any>).map(([name, data]) => {
          if (Array.isArray(data)) {
            let sceneChanged = false;
            const nextScene = data.map((node: any) => {
              if (!node || typeof node !== "object" || typeof node.text !== "string") return node;
              const nextIds = syncWordIdsFromText(node.text, node.word_ids, wordBank);
              if (JSON.stringify(nextIds) === JSON.stringify(node.word_ids ?? [])) return node;
              sceneChanged = true;
              return { ...node, word_ids: nextIds };
            });
            if (!sceneChanged) return [name, data];
            chapterChanged = true;
            return [name, nextScene];
          }

          if (!data || typeof data !== "object") return [name, data];

          let poolChanged = false;
          const nextPool = { ...data };
          for (const tier of ["low", "med", "high"]) {
            const entries = data[tier];
            if (!Array.isArray(entries)) continue;
            const nextEntries = entries.map((entry: any) => {
              if (!entry || typeof entry !== "object" || typeof entry.text !== "string") return entry;
              const nextIds = syncWordIdsFromText(entry.text, entry.word_ids, wordBank);
              if (JSON.stringify(nextIds) === JSON.stringify(entry.word_ids ?? [])) return entry;
              poolChanged = true;
              return { ...entry, word_ids: nextIds };
            });
            nextPool[tier] = nextEntries;
          }

          if (!poolChanged) return [name, data];
          chapterChanged = true;
          return [name, nextPool];
        }),
      );

      if (!chapterChanged) return [chapterId, chapter];
      changed = true;
      return [chapterId, nextChapter];
    }),
  ) as T;

  return changed ? nextChapters : chapters;
}
