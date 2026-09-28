import { useEffect, useState } from "react";
import chapter1 from "./data/chapter1.json";
import wordBankData from "./data/word_bank.json";
import WordBankEditor from "./components/WordBankEditor";
import type { Chapter, Scene } from "./types/content";

type WordEntry = typeof wordBankData.words[number];
type WordBank = { words: WordEntry[] };
import Sidebar from "./components/Sidebar";
import SceneEditor from "./components/SceneEditor";

function App() {
  const [content, setContent] = useState<Chapter>(() => {
    const saved = localStorage.getItem("akeanquest-content-draft");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Chapter;
        // Never let an empty/corrupt local draft replace the bundled scene tree.
        // This keeps the node graph recoverable after an interrupted edit or
        // stale localStorage state.
        if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
          return parsed;
        }
      } catch {}
      localStorage.removeItem("akeanquest-content-draft");
    }
    return chapter1 as Chapter;
  });
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"scenes" | "word-bank">("scenes");
  const [wordBank, setWordBank] = useState<WordBank>(() => {
    const saved = localStorage.getItem("akeanquest-word-bank-draft");
    if (saved) { try { return JSON.parse(saved) as WordBank; } catch { localStorage.removeItem("akeanquest-word-bank-draft"); } }
    return wordBankData as WordBank;
  });
  useEffect(() => { localStorage.setItem("akeanquest-word-bank-draft", JSON.stringify(wordBank)); }, [wordBank]);

  useEffect(() => { localStorage.setItem("akeanquest-content-draft", JSON.stringify(content)); }, [content]);

  const items = Object.keys(content);

  function handleSave() {
    localStorage.setItem("akeanquest-content-draft", JSON.stringify(content));
    const blob = new Blob([JSON.stringify(content, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "chapter1.json"; link.click(); URL.revokeObjectURL(url);
  }

  function handleAddScene() {
    const sceneName = prompt("Enter scene name:");
    if (!sceneName) return;
    if (content[sceneName]) { alert("A scene with that name already exists."); return; }
    const newScene: Scene = [
      { type: "start_router", start_index_if_flag: { default: 1 } },
      { speaker: "", text: "", next: null, word_ids: [] },
    ];
    setContent({ ...content, [sceneName]: newScene });
    setSelectedItem(sceneName);
  }

  return (
    <div className="editor-app">
      <header className="file-toolbar">
        <div className="file-toolbar-brand">AkeanQuest <span>Content Editor</span></div>
        <nav className="editor-tabs" aria-label="Editor tabs"><button type="button" className={activeTab === "scenes" ? "active" : ""} onClick={() => setActiveTab("scenes")}>Scenes</button><button type="button" className={activeTab === "word-bank" ? "active" : ""} onClick={() => setActiveTab("word-bank")}>Word Bank</button></nav>
      </header>

      <div className="editor-workspace">
        {activeTab === "scenes" ? (<><Sidebar items={items} selectedItem={selectedItem} onSelect={setSelectedItem} /><main className="editor-main">{selectedItem ? <SceneEditor key={selectedItem} name={selectedItem} data={content[selectedItem]} onChange={(updatedData) => setContent({ ...content, [selectedItem]: updatedData })} onAddScene={handleAddScene} onSave={handleSave} /> : <div className="editor-empty"><strong>Select a scene</strong><span>Choose a scene from the explorer to open its node tree.</span></div>}</main></>) : (<main className="editor-main"><WordBankEditor data={wordBank} onChange={setWordBank} /></main>)}
      </div>
    </div>
  );
}

export default App;
