import { useEffect, useRef, useState } from "react";
import chapter1 from "./data/chapter1.json";
import chapter2 from "./data/chapter2.json";
import chapter3 from "./data/chapter3.json";
import chapter4 from "./data/chapter4.json";
import chapter5 from "./data/chapter5.json";
import chapter6 from "./data/chapter6.json";
import wordBankData from "./data/word_bank.json";
import WordBankEditor from "./components/WordBankEditor";
import type { Chapter, Scene } from "./types/content";

type WordEntry = typeof wordBankData.words[number];
type WordBank = { words: WordEntry[] };
type Chapters = Record<string, Chapter>;
type SelectedScene = { chapterId: string; sceneName: string } | null;

type UnknownRecord = Record<string, unknown>;

import Sidebar from "./components/Sidebar";
import SceneEditor from "./components/SceneEditor";

const bundledChapters: Chapters = {
  chapter1: chapter1 as Chapter,
  chapter2: chapter2 as Chapter,
  chapter3: chapter3 as Chapter,
  chapter4: chapter4 as Chapter,
  chapter5: chapter5 as Chapter,
  chapter6: chapter6 as Chapter,
};

function App() {
  const [chapters, setChapters] = useState<Chapters>(() => bundledChapters);
  const [selectedChapterId, setSelectedChapterId] = useState("chapter1");
  const [selectedScene, setSelectedScene] = useState<SelectedScene>(null);
  const [activeTab, setActiveTab] = useState<"scenes" | "word-bank">("scenes");
  const [wordBank, setWordBank] = useState<WordBank>(() => wordBankData as WordBank);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveGeneration = useRef(0);

  useEffect(() => {
    saveGeneration.current += 1;
    const generation = saveGeneration.current;
    if (saveTimer.current) clearTimeout(saveTimer.current);

    saveTimer.current = setTimeout(async () => {
      try {
        await Promise.all([
          ...Object.entries(chapters).map(([chapterId, content]) =>
            fetch(`/__akeanquest/save/${chapterId}.json`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(content, null, 2),
            }).then(async (response) => {
              if (!response.ok) throw new Error(await response.text());
            })
          ),
          fetch("/__akeanquest/save/word_bank.json", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(wordBank, null, 2),
          }).then(async (response) => {
            if (!response.ok) throw new Error(await response.text());
          }),
        ]);
        if (generation === saveGeneration.current) {
          console.info("[AkeanQuest] Content autosaved to src/data.");
        }
      } catch (error) {
        console.error("[AkeanQuest] Autosave failed:", error);
      }
    }, 700);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [chapters, wordBank]);

  function handleSave() {
    if (!selectedScene) return;
    const content = chapters[selectedScene.chapterId];
    const blob = new Blob([JSON.stringify(content, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = selectedScene.chapterId + ".json"; link.click(); URL.revokeObjectURL(url);
  }

  function handleAddScene() {
    const chapterId = selectedChapterId;
    const sceneName = prompt("Enter scene name:");
    if (!sceneName) return;
    const currentChapter = chapters[chapterId];
    if (currentChapter[sceneName]) { alert("A scene with that name already exists."); return; }
    const newScene: Scene = [
      { type: "start_router", start_index_if_flag: { default: 1 } },
      { speaker: "", text: "", next: null, word_ids: [] },
    ];
    setChapters({
      ...chapters,
      [chapterId]: { ...currentChapter, [sceneName]: newScene },
    });
    setSelectedScene({ chapterId, sceneName });
  }


  function handleArchiveScene() {
    if (!selectedScene) return;
    const currentChapter = chapters[selectedScene.chapterId];
    if (!currentChapter[selectedScene.sceneName]) return;
    if (!confirm(`Archive "${selectedScene.sceneName}"?`)) return;
    const remaining = Object.fromEntries(
      Object.entries(currentChapter).filter(([name]) => name !== selectedScene.sceneName)
    ) as Chapter;
    setChapters({
      ...chapters,
      [selectedScene.chapterId]: remaining,
    });
    setSelectedScene(null);
  }

  const selectedChapter = selectedScene ? chapters[selectedScene.chapterId] : null;
  const selectedData = selectedScene && selectedChapter ? selectedChapter[selectedScene.sceneName] : null;

  return (
    <div className="editor-app">
      <header className="file-toolbar">
        <div className="file-toolbar-brand">AkeanQuest <span>Content Editor</span></div>
        <nav className="editor-tabs" aria-label="Editor tabs"><button type="button" className={activeTab === "scenes" ? "active" : ""} onClick={() => setActiveTab("scenes")}>Scenes</button><button type="button" className={activeTab === "word-bank" ? "active" : ""} onClick={() => setActiveTab("word-bank")}>Word Bank</button></nav>
      </header>

      <div className="editor-workspace">
        {activeTab === "scenes" ? (<><Sidebar chapters={chapters} selectedChapterId={selectedChapterId} selectedScene={selectedScene} onChapterChange={(chapterId) => { setSelectedChapterId(chapterId); setSelectedScene(null); }} onSelect={setSelectedScene} onAddScene={handleAddScene} /><main className="editor-main"><SceneEditor key={selectedScene ? selectedScene.chapterId + ":" + selectedScene.sceneName : "no-scene"} name={selectedScene?.sceneName ?? "No scene selected"} data={selectedData ?? null} onChange={(updatedData) => { if (!selectedScene) return; setChapters({ ...chapters, [selectedScene.chapterId]: { ...chapters[selectedScene.chapterId], [selectedScene.sceneName]: updatedData } }); }} onSave={handleSave} onArchive={handleArchiveScene} /></main></>) : (<main className="editor-main"><WordBankEditor data={wordBank} onChange={setWordBank} /></main>)}
      </div>
    </div>
  );
}

export default App;
