import { useMemo, useState } from "react";

type WordEntry = { id:string; akeanon:string; category:string; area:string; gloss:string; verified:boolean; source:string };
type WordBank = { words: WordEntry[] };

export default function WordBankEditor({data,onChange}:{data:WordBank;onChange:(data:WordBank)=>void}) {
 const [query,setQuery]=useState("");
 const [selectedId,setSelectedId]=useState<string|null>(data.words[0]?.id??null);
 const [collapsed,setCollapsed]=useState<Set<string>>(new Set());
 const [categoryQuery,setCategoryQuery]=useState("");
 const [categoryOpen,setCategoryOpen]=useState(false);

 const matches=useMemo(()=>{
  const q=query.trim().toLocaleLowerCase();
  return q?data.words.filter(w=>[w.id,w.akeanon,w.category,w.area,w.gloss,w.source].some(v=>v.toLocaleLowerCase().includes(q))):data.words;
 },[data.words,query]);

 const groups=useMemo(()=>{
  const grouped=new Map<string,WordEntry[]>();
  for(const word of matches){
   const letter=(word.akeanon.trim().charAt(0)||"#").toLocaleUpperCase();
   const list=grouped.get(letter)??[];
   list.push(word);
   grouped.set(letter,list);
  }
  return [...grouped.entries()].sort(([a],[b])=>a.localeCompare(b));
 },[matches]);

 const selected=data.words.find(w=>w.id===selectedId)??null;

 const categorySuggestions=useMemo(()=>{
  const q=categoryQuery.trim().toLocaleLowerCase();
  const categories=[...new Set(data.words.map(w=>w.category.trim()).filter(Boolean))];
  return categories.filter(category=>!q||category.toLocaleLowerCase().includes(q)).slice(0,20);
 },[data.words,categoryQuery]);

 function update(patch:Partial<WordEntry>){
  if(!selected)return;
  const nextId=patch.id??selected.id;
  onChange({words:data.words.map(w=>w.id===selected.id?{...w,...patch}:w)});
  if(patch.id!==undefined)setSelectedId(nextId);
 }

 function add(){
  let n=data.words.length+1,id=`w${String(n).padStart(3,"0")}`;
  const used=new Set(data.words.map(w=>w.id));
  while(used.has(id)){n++;id=`w${String(n).padStart(3,"0")}`}
  const w={id,akeanon:"",category:"",area:"chapter1",gloss:"",verified:false,source:""};
  onChange({words:[...data.words,w]});
  setSelectedId(id);
  setQuery("");
 }

 function save(){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;link.download="word_bank.json";link.click();URL.revokeObjectURL(url);
 }

 function remove(){
  if(!selected||!confirm(`Delete ${selected.id} (${selected.akeanon||"empty word"})?`))return;
  const next=data.words.filter(w=>w.id!==selected.id);
  onChange({words:next});
  setSelectedId(next[0]?.id??null);
 }

 function toggle(letter){
  setCollapsed(prev=>{
   const next=new Set(prev);
   if(next.has(letter))next.delete(letter);else next.add(letter);
   return next;
  });
 }

 return <div className="word-bank-editor">
  <div className="word-bank-header">
   <div><strong>Word Bank</strong><span>{data.words.length} entries</span></div>
   <div className="word-bank-actions"><button type="button" onClick={add}>+ Word</button><button type="button" className="save-button" onClick={save}>Save JSON</button><button type="button" className="danger" onClick={remove} disabled={!selected}>Delete</button></div>
  </div>
  <div className="word-bank-body">
   <section className="word-bank-list">
    <div className="word-bank-search"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search words, IDs, glosses…" /></div>
    <div className="word-bank-results">
     {groups.map(([letter,words])=><div className="word-bank-group" key={letter}>
      <button type="button" className="word-bank-group-header" onClick={()=>toggle(letter)} aria-expanded={!collapsed.has(letter)}>
       <span>{letter}</span><small>{words.length}</small><b>{collapsed.has(letter)?"▸":"▾"}</b>
      </button>
      {!collapsed.has(letter)&&words.map(w=><button type="button" key={w.id} className={w.id===selectedId?"selected":""} onClick={()=>setSelectedId(w.id)}>
       <strong>{w.akeanon||"(empty)"}</strong><span>{w.id} · {w.gloss||"No gloss"}</span>
      </button>)}
     </div>)}
     {!groups.length&&<div className="word-bank-empty">No matching words.</div>}
    </div>
   </section>
   <section className="word-bank-form">{selected?<><div className="word-bank-form-title"><span>{selected.id}</span><strong>{selected.akeanon||"New word"}</strong></div>
    <label>ID<input value={selected.id} onChange={e=>update({id:e.target.value.trim()})}/></label><label>Akeanon<input value={selected.akeanon} onChange={e=>update({akeanon:e.target.value})}/></label><label>Gloss<input value={selected.gloss} onChange={e=>update({gloss:e.target.value})}/></label><label>Category<div className="word-bank-category-picker"><div className="word-bank-category-input-wrap"><input value={selected.category} onChange={e=>{const value=e.target.value;update({category:value});setCategoryQuery(value);setCategoryOpen(true)}} onFocus={()=>{setCategoryQuery(selected.category);setCategoryOpen(true)}} onBlur={()=>setTimeout(()=>setCategoryOpen(false),120)} onKeyDown={e=>{if(e.key==="Escape")setCategoryOpen(false);if(e.key==="Enter"&&categorySuggestions.length){e.preventDefault();const value=categorySuggestions[0];update({category:value});setCategoryQuery(value);setCategoryOpen(false)}}} placeholder="Type or search category…" aria-label="Category"/>{categoryOpen&&<div className="word-bank-category-menu">{categorySuggestions.length?categorySuggestions.map(category=><button type="button" key={category} onMouseDown={e=>e.preventDefault()} onClick={()=>{update({category});setCategoryQuery(category);setCategoryOpen(false)}}>{category}</button>):<div className="word-bank-category-empty">No matching categories.</div>}</div>}</div></div></label><label>Area<select value={selected.area} onChange={e=>update({area:e.target.value})}>{["chapter1","chapter2","chapter3","chapter4","chapter5","chapter6"].map(x=><option key={x}>{x}</option>)}</select></label><label>Source<input value={selected.source} onChange={e=>update({source:e.target.value})}/></label><label className="word-bank-checkbox"><input type="checkbox" checked={selected.verified} onChange={e=>update({verified:e.target.checked})}/> Verified</label>
   </>:<div className="word-bank-empty">Select a word to edit.</div>}</section>
  </div>
 </div>
}