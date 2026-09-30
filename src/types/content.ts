export type Choice = {
  label: string;
  next: number | null;
};

export type PhraseBuilderNode = {
  type: "phrase_builder";
  prompt: string;
  choices: string[];
  answer: string[];
  next: number | null;
  translation?: string;
};

export type DialogueNode = {
  speaker: string;
  text: string;
  next: number | null;
  translation?: string;
  word_ids?: string[];
  choices?: Choice[];
  set_flag_on_enter?: string;
};

export type StartRouter = {
  start_index_if_flag: Record<string, number>;
  type: string;
};

export type Scene = Array<StartRouter | DialogueNode | PhraseBuilderNode>;

export type IdleEntry = {
  speaker: string;
  text: string;
  word_ids: string[];
};

export type IdlePool = {
  low: IdleEntry[];
  med: IdleEntry[];
  high: IdleEntry[];
};

export type Chapter = Record<string, Scene | IdlePool>;