import { Action, action, thunk, Thunk } from "easy-peasy";
import { makeScratchSVG } from "./scratchblocks-render";
import { marked } from "marked";
import { IPytchAppModel } from ".";
import { withinApp } from "../utils";

export type HeadingElementDescriptor = {
  kind: "heading";
  heading: string;
};

export type BlockElementDescriptor = {
  kind: "block";
  python: string;
  scratch: SVGElement;
  scratchIsLong: boolean;
  help: HTMLCollection;
  helpIsVisible: boolean;
};

export type NonMethodBlockElementDescriptor = {
  kind: "non-method-block";
  heading: string;
  scratch: SVGElement;
  python?: string;
  help: HTMLCollection;
  helpIsVisible: boolean;
};

export type PurePythonElementDescriptor = {
  kind: "pure-python";
  python: string;
  help: HTMLCollection;
  helpIsVisible: boolean;
};

export const scratchblocksScale = 0.7;

/**
 * Replace the given `codeElt` (in its parent) with a sequence of
 * children, one per line of the original `codeElt`'s text content.
 * Lines starting with the Python comment character `#` are given the
 * class `comment`.
 */
const simpleSyntaxHighlight = (codeElt: Element): void => {
  const codeText = codeElt.textContent ?? "";
  const codeLines = codeText.split("\n");
  const nLines = codeLines.length;
  const codeLineElts = codeLines.map((line, idx) => {
    const isLast = idx === nLines - 1;
    let lineElt = document.createElement("code");
    lineElt.innerText = line + (isLast ? "" : "\n");
    if (line.startsWith("#")) {
      lineElt.classList.add("comment");
    }
    return lineElt;
  });
  const preElt = codeElt.parentElement!;
  preElt.innerHTML = "";
  codeLineElts.forEach((elt) => preElt.appendChild(elt));
};



/**
 * Convert the given `helpMarkdown` text into an `HTMLCollection`.  Any
 * code blocks are mutated via `simpleSyntaxHighlight()` to allow
 * styling of comments.
 */
const makeHelpTextElements = (helpMarkdown: string): HTMLCollection => {
  const helpHtml = marked.parse(helpMarkdown);

  let helpDoc = new DOMParser().parseFromString(helpHtml, "text/html");
  helpDoc.querySelectorAll("pre > code").forEach(simpleSyntaxHighlight);

  const helpElts = helpDoc.documentElement.querySelector("body")!.children;

  return helpElts;
};

const makeBlockElementDescriptor = (raw: any): BlockElementDescriptor => ({
  kind: "block",
  python: raw.python,
  scratch: makeScratchSVG(raw.scratch, scratchblocksScale),
  scratchIsLong: raw.scratchIsLong ?? false,
  help: makeHelpTextElements(raw.help),
  helpIsVisible: false,
});

const makeNonMethodBlockElementDescriptor = (
  raw: any
): NonMethodBlockElementDescriptor => ({
  kind: "non-method-block",
  heading: raw.heading,
  scratch: makeScratchSVG(raw.scratch, scratchblocksScale),
  python: raw.python,
  help: makeHelpTextElements(raw.help),
  helpIsVisible: false,
});

const makePurePythonElementDescriptor = (
  raw: any
): PurePythonElementDescriptor => ({
  kind: "pure-python",
  python: raw.python,
  help: makeHelpTextElements(raw.help),
  helpIsVisible: false,
});

export type HelpElementDescriptor =
  | HeadingElementDescriptor
  | BlockElementDescriptor
  | NonMethodBlockElementDescriptor
  | PurePythonElementDescriptor;

const makeHelpElementDescriptor = (raw: any): HelpElementDescriptor => {
  switch (raw.kind as HelpElementDescriptor["kind"]) {
    case "heading":
      return raw as HeadingElementDescriptor;
    case "block":
      return makeBlockElementDescriptor(raw);
    case "non-method-block":
      return makeNonMethodBlockElementDescriptor(raw);
    case "pure-python":
      return makePurePythonElementDescriptor(raw);
    default:
      throw new Error(`unknown help element kind "${raw.kind}"`);
  }
};

export type HelpContentDescriptor = Array<HelpElementDescriptor>;

export type ContentFetchState =
  | { state: "idle" }
  | { state: "requesting" }
  | { state: "available"; content: HelpContentDescriptor }
  | { state: "error" };

export interface IHelpSidebar {
  contentFetchState: ContentFetchState;
  isVisible: boolean;
  toggleVisibility: Action<IHelpSidebar>;

  toggleHelpItemVisibility: Action<IHelpSidebar, number>;

  ensureHaveContent: Thunk<IHelpSidebar, void, {}, IPytchAppModel>;
  setRequestingContent: Action<IHelpSidebar>;
  setContentFetchError: Action<IHelpSidebar>;
  setContent: Action<IHelpSidebar, HelpContentDescriptor>;
}

export const helpSidebar: IHelpSidebar = {
  contentFetchState: { state: "idle" },
  isVisible: false,
  toggleVisibility: action((state) => {
    state.isVisible = !state.isVisible;
  }),

  toggleHelpItemVisibility: action((state, index) => {
    if (state.contentFetchState.state !== "available") {
      console.error("can not toggle help if content not available");
      return;
    }
    let entry = state.contentFetchState.content[index];
    if (!("helpIsVisible" in entry)) {
      console.error(`can not toggle help of "${entry.kind}" element`);
      return;
    }
    entry.helpIsVisible = !entry.helpIsVisible;
  }),

  setRequestingContent: action((state) => {
    state.contentFetchState = { state: "requesting" };
  }),
  setContentFetchError: action((state) => {
    state.contentFetchState = { state: "error" };
  }),
  setContent: action((state, content) => {
    state.contentFetchState = { state: "available", content };
  }),
  ensureHaveContent: thunk(async (actions, _voidPayload, helpers) => {
    const state = helpers.getState();
    if (state.contentFetchState.state !== "idle") return;

    actions.setRequestingContent();

    try {
      const url = withinApp("/data/help-sidebar.json");
      const response = await fetch(url);
      const text = await response.text();
      const content = JSON.parse(text).map(makeHelpElementDescriptor);
      actions.setContent(content);
    } catch (err) {
      console.error("error fetching help sidebar content:", err);
      actions.setContentFetchError();
    }
  }),
};
