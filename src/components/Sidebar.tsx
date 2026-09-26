type SidebarProps = {
  items: string[];
  selectedItem: string | null;
  onSelect: (item: string) => void;
};

function Sidebar({
  items,
  selectedItem,
  onSelect,
}: SidebarProps) {
  return (
    <aside className="w-72 shrink-0 border-r border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800 p-4">
        <h2 className="font-bold">Content</h2>
      </div>

      <nav className="p-2">
        {items.map((item) => {
          const isSelected = item === selectedItem;

          return (
            <button
              key={item}
              type="button"
              onClick={() => onSelect(item)}
              className={`mb-1 w-full rounded-md px-3 py-2 text-left text-sm ${
                isSelected
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
              }`}
            >
              {item}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

export default Sidebar;