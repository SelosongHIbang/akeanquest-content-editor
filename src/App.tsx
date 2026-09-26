import { useEffect, useState } from "react";
import chapter1 from "./data/chapter1.json";
import type { Chapter, Scene } from "./types/content";

import Sidebar from "./components/Sidebar";
import SceneEditor from "./components/SceneEditor";

function App() {
  const [content, setContent] = useState<Chapter>(() => {
    const saved = localStorage.getItem("akeanquest-content-draft");

    if (saved) {
      try {
        return JSON.parse(saved) as Chapter;
      } catch {
        localStorage.removeItem("akeanquest-content-draft");
      }
    }

    return chapter1 as Chapter;
  });

  const [selectedItem, setSelectedItem] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem("akeanquest-content-draft", JSON.stringify(content));
  }, [content]);

  const items = Object.keys(content);

  function handleSave() {
    localStorage.setItem("akeanquest-content-draft", JSON.stringify(content));

    const json = JSON.stringify(content, null, 2);

    const blob = new Blob([json], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "chapter1.json";
    link.click();

    URL.revokeObjectURL(url);
  }

  function handleAddScene() {
    const sceneName = prompt("Enter scene name:");

    if (!sceneName) {
      return;
    }

    if (content[sceneName]) {
      alert("A scene with that name already exists.");
      return;
    }

    const newScene: Scene = [
      {
        type: "start_router",
        start_index_if_flag: {
          default: 1,
        },
      },
      {
        speaker: "",
        text: "",
        next: null,
      },
    ];

    setContent({
      ...content,
      [sceneName]: newScene,
    });

    setSelectedItem(sceneName);
  }

  return (
    <div className="flex min-h-screen bg-zinc-950 text-white">
      <Sidebar
        items={items}
        selectedItem={selectedItem}
        onSelect={setSelectedItem}
      />

      <main className="min-w-0 flex-1 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">AkeanQuest Content Editor</h1>
          <button
            type="button"
            onClick={handleAddScene}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            + Add Scene
          </button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">Draft saved locally</span>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200"
            >
              Save JSON
            </button>
          </div>
        </div>

        {selectedItem ? (
          <SceneEditor
            name={selectedItem}
            data={content[selectedItem]}
            onChange={(updatedData) => {
              setContent({
                ...content,
                [selectedItem]: updatedData,
              });
            }}
          />
        ) : (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-zinc-400">
            Select something from the sidebar.
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
