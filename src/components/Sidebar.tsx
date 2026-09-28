type SidebarProps = {
  items: string[];
  selectedItem: string | null;
  onSelect: (item: string) => void;
};

export default function Sidebar({ items, selectedItem, onSelect }: SidebarProps) {
  return (
    <aside className="file-explorer">
      <div className="file-explorer-header"><span>EXPLORER</span><strong>Chapter</strong></div>
      <div className="file-explorer-section"><span>SCENES</span></div>
      <nav className="file-explorer-list">
        {items.map((item) => (
          <button key={item} type="button" onClick={() => onSelect(item)} className={item === selectedItem ? "selected" : ""}>
            <span className="file-icon">◆</span><span>{item}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
