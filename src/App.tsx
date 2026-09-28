import { useEffect, useState } from "react";
import chapter1 from "./data/chapter1.json";
import type { Chapter, Scene } from "./types/content";
import Sidebar from "./components/Sidebar";
import SceneEditor from "./components/SceneEditor";

function App() {
  const [content, setContent] = useState<Chapter>(() => {
    const saved = localStorage.getItem("akeanquest-content-draft");
    if (saved) {
      try { return JSON.parse(saved) as Chapter; } catch { localStorage.removeItem("akeanquest-content-draft"); }
    }
    return chapter1 as Chapter;
  });
  const [selectedItem, setSelectedItem] = useState<string | null>(null);

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
        <div className="file-toolbar-actions">
          <button type="button" onClick={handleAddScene}>+ Scene</button>
          <span className="save-status">● Draft saved locally</span>
          <button type="button" className="save-button" onClick={handleSave}>Save JSON</button>
        </div>
      </header>

      <div className="editor-workspace">
        <Sidebar items={items} selectedItem={selectedItem} onSelect={setSelectedItem} />
        <main className="editor-main">
          {selectedItem ? (
            <SceneEditor key={selectedItem} name={selectedItem} data={content[selectedItem]} onChange={(updatedData) => setContent({ ...content, [selectedItem]: updatedData })} />
          ) : (
            <div className="editor-empty"><strong>Select a scene</strong><span>Choose a scene from the explorer to open its node tree.</span></div>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
