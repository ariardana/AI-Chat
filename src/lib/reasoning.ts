export interface ParsedThinking {
  reasoning: string;
  answer: string;
  hasThinking: boolean;
  isThinkingClosed: boolean;
}

function trimPartialTag(value: string) {
  const lower = value.toLowerCase();
  const partials = ["<think", "<reasoning", "</think", "</reasoning"];
  let cut = value.length;

  for (const partial of partials) {
    const index = lower.lastIndexOf(partial);
    if (index >= 0 && !lower.slice(index).includes(">")) {
      cut = Math.min(cut, index);
    }
  }

  return value.slice(0, cut);
}

export function parseThinkTags(content: string): ParsedThinking {
  const openMatch = /<(think|reasoning)>/i.exec(content);

  if (!openMatch) {
    const lower = content.toLowerCase();
    const partialStarts = ["<think", "<reasoning"];
    const partialIndex = partialStarts.reduce((found, partial) => {
      const index = lower.lastIndexOf(partial);
      if (index < 0 || lower.slice(index).includes(">")) return found;
      return found < 0 ? index : Math.min(found, index);
    }, -1);

    if (partialIndex >= 0) {
      return {
        reasoning: "",
        answer: content.slice(0, partialIndex),
        hasThinking: true,
        isThinkingClosed: false,
      };
    }

    return {
      reasoning: "",
      answer: content,
      hasThinking: false,
      isThinkingClosed: false,
    };
  }

  const tag = openMatch[1].toLowerCase();
  const before = content.slice(0, openMatch.index);
  const reasoningStart = openMatch.index + openMatch[0].length;
  const afterOpen = content.slice(reasoningStart);
  const closeMatch = new RegExp(`</${tag}>`, "i").exec(afterOpen);

  if (!closeMatch) {
    return {
      reasoning: trimPartialTag(afterOpen),
      answer: before,
      hasThinking: true,
      isThinkingClosed: false,
    };
  }

  const reasoning = afterOpen.slice(0, closeMatch.index);
  const answer = `${before}${afterOpen.slice(closeMatch.index + closeMatch[0].length)}`;

  return {
    reasoning,
    answer,
    hasThinking: true,
    isThinkingClosed: true,
  };
}
